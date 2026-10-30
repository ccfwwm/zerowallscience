import type { Context } from '@deepseek-ai/cordis'
import { createHash, randomUUID } from 'node:crypto'
import { cp, mkdir, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { homedir } from 'node:os'
import type { SkillDefinition, SkillSummary } from '@deepseek-ai/dsh-skill'
import { isModelInvocable, isSkillName } from '@deepseek-ai/dsh-skill'
import type {} from '@deepseek-ai/dsh-agent'
import { createUserMessage, type MessageSource } from '@deepseek-ai/dsh-llm'
import type { Session } from '@deepseek-ai/dsh-session'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { apply as applySkillFilesystem } from '@deepseek-ai/dsh-skill-filesystem'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {} from 'zod'
import type { CopyBundledSkillInput, CreateSkillInput, ImportSkillInput, SkillSourceSnapshot, ZeroWallSkillDetail, ZeroWallSkillSummary } from '../shared/types.js'
import { migrateUserSkillRouting } from './skill-routing-migration.js'

export type { CopyBundledSkillInput, CreateSkillInput, ImportSkillInput, SkillSourceSnapshot, ZeroWallSkillDetail, ZeroWallSkillSummary } from '../shared/types.js'

// Keep systemPrompt as an activation dependency so the Host loader preserves
// the established ordering; ARS guidance itself is owned by plugin-base.
export const inject = ['skills', 'systemPrompt', 'tools', 'workingDirectory']

declare module '@deepseek-ai/cordis' {
  interface Context { workingDirectory: { ensure(agent: unknown, signal?: AbortSignal): Promise<string> } }
}

// The catalog producer owns this source extension. Keep its boundary local:
// redeclaring MessageSourceMap changes unrelated plugins' generated Typert
// source snapshots and invalidates their immutable published packages.
type SkillCatalogSource = { kind: 'skill-catalog'; form: 'catalog'; entries: readonly { name: string; description: string }[] }
function isSkillCatalogSource(source: unknown): source is SkillCatalogSource {
  return source !== null && typeof source === 'object'
    && (source as SkillCatalogSource).kind === 'skill-catalog'
    && Array.isArray((source as SkillCatalogSource).entries)
}
function skillCatalogSource(entries: SkillCatalogSource['entries']): MessageSource {
  return { kind: 'skill-catalog', form: 'catalog', entries } as unknown as MessageSource
}

// Windows directory watchers and virus scanners can briefly deny rename.
// Retry only sharing/permission failures; never remove a target to force a swap.
async function moveSkillDirectory(source: string, destination: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try { await rename(source, destination); return } catch (error) {
      if (process.platform !== 'win32' || attempt >= 12 || !['EPERM', 'EACCES', 'EBUSY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error
      await new Promise(resolveRetry => setTimeout(resolveRetry, 100 + attempt * 50))
    }
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context { zerowallCapabilities: ZeroWallCapabilitiesService }
}

export class ZeroWallCapabilitiesService extends TypertRemoteService {
  static inject = ['skills']

  constructor(private readonly runtimeCtx: Context) {
    super(runtimeCtx, 'zerowallCapabilities')
    const bundledSkillDir = process.env.ZEROWALL_BUNDLED_SKILLS ?? process.env.DSH_BUNDLED_SKILL_DIR
    const registry = runtimeCtx.get('skills') as { registerProvider?: (create: never) => unknown } | undefined
    if (bundledSkillDir !== undefined && typeof registry?.registerProvider === 'function') {
      applySkillFilesystem(runtimeCtx, {
        providerName: 'zerowall-scientific',
        includeDefaultRoots: false,
        bundledSkillDir,
        watch: false,
      })
    }
    const userSkillsDir = userSkillDir()
    try {
      const migration = migrateUserSkillRouting(userSkillsDir)
      if (migration.records.length > 0 || migration.failures.length > 0) {
        runtimeCtx.logger.info(`zerowall-skills: migrated ${migration.records.length} user Skill routing records${migration.failures.length > 0 ? `; ${migration.failures.length} failed` : ''}`)
      }
    } catch (error) {
      runtimeCtx.logger.warn(`zerowall-skills: user Skill routing migration skipped: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (typeof registry?.registerProvider === 'function') {
      void mkdir(userSkillsDir, { recursive: true })
      applySkillFilesystem(runtimeCtx, {
        providerName: 'zerowall-user-skills',
        includeDefaultRoots: false,
        customSkillDirs: [userSkillsDir],
        // DSH assigns custom roots rank 300 and bundled roots rank 600, so an
        // editable user Skill wins a same-name bundled catalog entry.
        // User changes must invalidate the filesystem provider cache so the
        // Settings page reflects create/import/disable operations immediately.
        watch: true,
      })
    }
    if (runtimeCtx.get('tools') === undefined || runtimeCtx.get('workingDirectory') === undefined) return
    runtimeCtx.tools.register(defineTool({
      name: 'skill_search',
      description: 'Search available Skills by task, method, software, or domain. Returns at most five matching summaries; call skill with an exact returned name to load its full instructions.',
      parameters: { query: { type: 'string', description: 'Task or capability; omit to browse categories.' }, category: { type: 'string', description: 'Optional category returned by this tool.' } },
      output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
      async execute(args, exec) {
        const cwd = exec.agent === undefined ? undefined : await runtimeCtx.workingDirectory.ensure(exec.agent, exec.signal)
        const skills = (await runtimeCtx.skills.list({ cwd, signal: exec.signal, scope: exec.agent })).filter(isModelInvocable)
        const candidates = skills.filter(skill => !args.category || skillCategory(skill) === args.category)
        if (!args.query?.trim() && !args.category) return { categories: SKILL_CATEGORIES.map(([id, label]) => ({ id, label, count: skills.filter(skill => skillCategory(skill) === id).length })).filter(item => item.count > 0), next: 'Search a category or task, then load an exact name with skill.' }
        return { matches: (args.query?.trim() ? rankSkills(candidates, args.query) : candidates.sort((a, b) => a.name.localeCompare(b.name))).slice(0, 5).map(skill => ({ name: skill.name, category: skillCategory(skill), description: skill.description.slice(0, 320), ...(skill.whenToUse ? { whenToUse: skill.whenToUse.slice(0, 200) } : {}) })) }
      },
    }))
    // DSH's standard preset emits every Skill summary into every request. Keep
    // its explicit /name gesture and full-content `skill` tool, while replacing
    // only that broad catalog with a tiny task-ranked shortlist.
    runtimeCtx.on('agent/pre-step', async ({ agent, messages, signal }, next) => {
      shrinkLegacySkillCatalogs(agent.session)
      const decision = await next()
      if (decision.kind === 'reject') return decision
      const catalogs = decision.messages.filter(message => isSkillCatalogSource(message.source))
      if (!catalogs.length) return decision
      const query = [...messages].reverse().find(message => message.source?.kind === 'user')?.content
        ?.filter(block => block.type === 'text').map(block => block.text).join('\n') ?? ''
      const cwd = await runtimeCtx.workingDirectory.ensure(agent, signal)
      const snapshot = await runtimeCtx.skills.snapshot({ cwd, signal, scope: agent })
      if (!snapshot.complete) return { ...decision, messages: decision.messages.filter(message => !isSkillCatalogSource(message.source)) }
      const matches = rankSkills(snapshot.skills.filter(isModelInvocable), query).slice(0, 3)
      const compact = matches.length ? createUserMessage({
        content: [{ type: 'text', text: `<available_skills>\n${matches.map(skill => `- ${skill.name}: ${skill.description.slice(0, 180)}`).join('\n')}\n</available_skills>` }],
        source: skillCatalogSource(matches.map(skill => ({ name: skill.name, description: skill.description.slice(0, 180) }))),
      }) : undefined
      const filtered = decision.messages.filter(message => !isSkillCatalogSource(message.source))
      return { ...decision, messages: compact ? [...filtered, compact] : filtered }
    }, { prepend: true })
  }

  @Remote('listSkills')
  async listSkills(): Promise<ZeroWallSkillSummary[]> {
    const registry = this.runtimeCtx.get('skills')
    if (registry === undefined) throw new Error('The DSH skill registry is not available.')
    const active = (await registry.list()).map(skillSummary)
    const activeNames = new Set(active.map(skill => skill.name))
    const disabled = await disabledSkills()
    return [...active, ...disabled.filter(skill => !activeNames.has(skill.name))]
      .sort((left, right) => left.name.localeCompare(right.name))
  }

  @Remote('getSkill')
  async getSkill(name: string): Promise<ZeroWallSkillDetail> {
    const registry = this.runtimeCtx.get('skills')
    if (registry === undefined) throw new Error('The DSH skill registry is not available.')
    const skill = await registry.get(name.trim())
    if (skill !== undefined) return skillDetail(skill)
    const disabled = await disabledSkill(name)
    if (disabled !== undefined) return disabled
    throw new Error(`Skill was not found: ${name}`)
  }

  @Remote('listSkillSources')
  async listSkillSources(): Promise<SkillSourceSnapshot> {
    return { enabled: await skillDirectories(userSkillDir()), disabled: await skillDirectories(disabledSkillDir()) }
  }

  @Remote('createSkill')
  async createSkill(input: CreateSkillInput): Promise<ZeroWallSkillSummary> {
    const normalized = validateSkillInput(input)
    const target = safeSkillPath(userSkillDir(), normalized.name)
    if (await exists(target)) throw new Error(`A user Skill already exists: ${normalized.name}`)
    await mkdir(target, { recursive: false })
    await writeFile(join(target, 'SKILL.md'), skillMarkdown(normalized), 'utf8')
    return await this.getSkill(normalized.name)
  }

  @Remote('importSkill')
  async importSkill(input: ImportSkillInput): Promise<ZeroWallSkillSummary> {
    const source = resolve(input.sourcePath.trim())
    const sourceStat = await stat(source).catch(() => undefined)
    if (sourceStat === undefined || !sourceStat.isDirectory()) throw new Error('Select a Skill folder containing SKILL.md.')
    const root = await locateSkillRoot(source)
    const markdown = await readSkillMarkdown(join(root, 'SKILL.md'))
    const parsed = validateSkillMarkdown(markdown)
    const target = safeSkillPath(userSkillDir(), parsed.name)
    if (await exists(target)) throw new Error(`A user Skill already exists: ${parsed.name}`)
    await copySkillTree(root, target)
    return await this.getSkill(parsed.name)
  }

  @Remote('updateSkill')
  async updateSkill(input: ImportSkillInput): Promise<ZeroWallSkillSummary> {
    const source = await locateSkillRoot(resolve(input.sourcePath.trim()))
    const parsed = validateSkillMarkdown(await readSkillMarkdown(join(source, 'SKILL.md')))
    const name = validateSkillName(parsed.name)
    const disabled = await exists(safeSkillPath(disabledSkillDir(), name))
    const target = safeSkillPath(disabled ? disabledSkillDir() : userSkillDir(), name)
    if (!(await exists(target))) return this.importSkill(input)
    const within = relative(await realpath(target), await realpath(source))
    if (!within || (!within.startsWith('..') && !isAbsolute(within))) throw new Error('Choose a separate update source.')
    const candidate = join(dirname(userSkillDir()), 'candidates', randomUUID(), name)
    await copySkillTree(source, candidate)
    const backup = join(dirname(userSkillDir()), 'history', name, randomUUID())
    await mkdir(dirname(backup), { recursive: true })
    await moveSkillDirectory(target, backup)
    try { await moveSkillDirectory(candidate, target) } catch (error) { await moveSkillDirectory(backup, target); throw error }
    // The filesystem provider's watcher invalidates the registry. Existing
    // tasks keep their already resolved SkillDefinition and content snapshot.
    return await this.getSkill(name)
  }

  @Remote('rollbackSkill')
  async rollbackSkill(id: string): Promise<ZeroWallSkillSummary> {
    const name = validateSkillName(id)
    const history = join(dirname(userSkillDir()), 'history', name)
    const backups = await readdir(history, { withFileTypes: true })
    const candidates = await Promise.all(backups.filter(item => item.isDirectory()).map(async item => ({ path: join(history, item.name), time: (await stat(join(history, item.name))).mtimeMs })))
    const previous = candidates.sort((a, b) => b.time - a.time)[0]
    if (!previous) throw new Error('No previous Skill version is available.')
    const disabled = await exists(safeSkillPath(disabledSkillDir(), name))
    const target = safeSkillPath(disabled ? disabledSkillDir() : userSkillDir(), name)
    const backup = join(history, randomUUID())
    await moveSkillDirectory(target, backup)
    try { await moveSkillDirectory(previous.path, target) } catch (error) { await moveSkillDirectory(backup, target); throw error }
    return this.getSkill(name)
  }

  @Remote('copyBundledSkill')
  async copyBundledSkill(input: CopyBundledSkillInput): Promise<ZeroWallSkillSummary> {
    const name = validateSkillName(input.name)
    const bundled = bundledSkillDir()
    if (bundled === undefined) throw new Error('No bundled Skills directory is available.')
    const source = safeSkillPath(bundled, name)
    const markdown = await readSkillMarkdown(join(source, 'SKILL.md'))
    const parsed = validateSkillMarkdown(markdown)
    const target = safeSkillPath(userSkillDir(), parsed.name)
    if (await exists(target)) throw new Error(`A user Skill already exists: ${parsed.name}`)
    await copySkillTree(source, target)
    return await this.getSkill(parsed.name)
  }

  @Remote('removeImportedSkill')
  async removeImportedSkill(name: string): Promise<void> {
    const normalized = validateSkillName(name)
    const active = safeSkillPath(userSkillDir(), normalized)
    const disabled = safeSkillPath(disabledSkillDir(), normalized)
    if (!(await exists(active)) && !(await exists(disabled))) throw new Error(`Imported Skill was not found: ${normalized}`)
    await Promise.all([rm(active, { recursive: true, force: true }), rm(disabled, { recursive: true, force: true })])
  }

  @Remote('setSkillEnabled')
  async setSkillEnabled(name: string, enabled: boolean): Promise<void> {
    const normalized = validateSkillName(name)
    const from = safeSkillPath(enabled ? disabledSkillDir() : userSkillDir(), normalized)
    const to = safeSkillPath(enabled ? userSkillDir() : disabledSkillDir(), normalized)
    if (!(await exists(from))) throw new Error(`Imported Skill was not found: ${normalized}`)
    await mkdir(dirname(to), { recursive: true })
    await moveSkillDirectory(from, to)
  }
}

/** Replace only obsolete catalogs in the model surface; original events stay in the log. */
export function shrinkLegacySkillCatalogs(session: Session): void {
  for (const seq of [...session.surface.nodes]) {
    const event = session.eventAt(seq)
    if (event?.type !== 'user/message') continue
    const source: unknown = event.data.source
    if (!isSkillCatalogSource(source)) continue
    if (source.entries.length <= 5 && JSON.stringify(event.data.content).length < 1800) continue
    session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'Skills are available on demand: browse categories or search with skill_search, then load an exact name with skill.' }],
      source: skillCatalogSource([]),
    }), { surfaceOp: { op: 'replace', startSeq: seq, endSeq: seq }, sourceEventSeqs: [seq] })
  }
}

function userSkillDir(): string {
  return resolve(process.env.ZEROWALL_USER_SKILLS ?? join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'zerowall-skills', 'enabled'))
}

function skillTerms(value: string): Set<string> {
  const normalized = value.toLocaleLowerCase().replaceAll('_', ' ').replaceAll('-', ' ')
  const terms = new Set(normalized.match(/[\p{L}\p{N}]{2,}/gu) ?? [])
  const compact = normalized.replace(/\s+/gu, '')
  for (const match of compact.matchAll(/[\p{Script=Han}]{2,}/gu)) {
    const phrase = match[0]
    terms.add(phrase)
    for (let index = 0; index < phrase.length - 1; index++) terms.add(phrase.slice(index, index + 2))
  }
  return terms
}

const SKILL_CATEGORIES = [
  ['literature', '文献与证据 / literature', /paper|literature|pubmed|citation|论文|文献|引用/iu],
  ['data', '数据与统计 / data', /statistic|survey|nhanes|data|统计|数据|回归/iu],
  ['biology', '生命科学 / biology', /gene|cell|omic|protein|molecul|biology|生物|基因|细胞/iu],
  ['documents', '文档与演示 / documents', /document|pdf|docx|ppt|presentation|slide|文档|演示|排版/iu],
  ['engineering', '软件与工具 / engineering', /code|software|program|mcp|python|git|软件|编程|工具/iu],
  ['general', '其他能力 / general', /./u],
] as const
export function skillCategory(skill: Pick<SkillSummary, 'name' | 'description'>): string {
  return SKILL_CATEGORIES.find(([, , pattern]) => pattern.test(skill.name))?.[0]
    ?? SKILL_CATEGORIES.find(([, , pattern]) => pattern.test(skill.description))?.[0] ?? 'general'
}
export function rankSkills(skills: SkillSummary[], query: string): SkillSummary[] {
  const terms = skillTerms(query)
  const unique = [...new Map(skills.map(skill => [skill.name, skill])).values()]
  if (!terms.size) return []
  return unique.map(skill => {
    const name = skill.name.toLocaleLowerCase()
    const description = `${skill.description} ${skill.whenToUse ?? ''}`.toLocaleLowerCase()
    const score = [...terms].reduce((total, term) => total + (name.includes(term) ? 5 : 0) + (description.includes(term) ? 1 : 0), 0)
    return { skill, score }
  }).filter(item => item.score > 0)
    .sort((left, right) => right.score - left.score || left.skill.name.localeCompare(right.skill.name))
    .map(item => item.skill)
}

function bundledSkillDir(): string | undefined {
  const root = process.env.ZEROWALL_BUNDLED_SKILLS ?? process.env.DSH_BUNDLED_SKILL_DIR
  return root?.trim() ? resolve(root) : undefined
}

function disabledSkillDir(): string { return join(dirname(userSkillDir()), 'disabled') }

function validateSkillName(value: string): string {
  const name = value.trim()
  if (!isSkillName(name)) throw new Error('Skill name must use lowercase kebab-case.')
  return name
}

function validateSkillInput(input: CreateSkillInput): CreateSkillInput {
  const name = validateSkillName(input.name)
  const description = input.description.trim()
  const content = input.content.trim()
  if (!description || !content) throw new Error('Skill description and content are required.')
  return { name, description, ...(input.whenToUse?.trim() ? { whenToUse: input.whenToUse.trim() } : {}), content }
}

function validateSkillMarkdown(markdown: string): CreateSkillInput {
  const match = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n([\s\S]*)$/u.exec(markdown)
  if (match === null) throw new Error('SKILL.md must contain YAML frontmatter.')
  const fields = new Map<string, string>()
  for (const line of (match[1] ?? '').split(/\r?\n/u)) {
    const field = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/u.exec(line)
    if (field !== null && field[1] !== undefined && field[2] !== undefined) fields.set(field[1], field[2].replace(/^['"]|['"]$/gu, '').trim())
  }
  const whenToUse = fields.get('whenToUse')
  return validateSkillInput({ name: fields.get('name') ?? '', description: fields.get('description') ?? '', ...(whenToUse === undefined ? {} : { whenToUse }), content: match[2] ?? '' })
}

function skillMarkdown(input: CreateSkillInput): string {
  const quote = (value: string) => value.replaceAll('"', '\\"')
  return ['---', `name: ${input.name}`, `description: "${quote(input.description)}"`, ...(input.whenToUse ? [`whenToUse: "${quote(input.whenToUse)}"`] : []), '---', '', input.content, ''].join('\n')
}

function safeSkillPath(root: string, name: string): string {
  const target = resolve(root, validateSkillName(name))
  const prefix = resolve(root) + requirePathSeparator()
  if (!target.startsWith(prefix)) throw new Error('Skill path escapes the user Skill directory.')
  return target
}

function requirePathSeparator(): string { return process.platform === 'win32' ? '\\' : '/' }

async function locateSkillRoot(source: string): Promise<string> {
  if (await exists(join(source, 'SKILL.md'))) return source
  const children = await readdir(source, { withFileTypes: true })
  const directories = children.filter(child => child.isDirectory())
  const only = directories[0]
  if (directories.length === 1 && only !== undefined && await exists(join(source, only.name, 'SKILL.md'))) return join(source, only.name)
  throw new Error('Select a Skill folder containing SKILL.md.')
}

async function copySkillTree(source: string, target: string): Promise<void> {
  await mkdir(target, { recursive: true })
  const entries = await readdir(source, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isSymbolicLink()) throw new Error('Skill imports cannot contain symbolic links.')
    const destination = join(target, entry.name)
    if (entry.isDirectory()) await copySkillTree(join(source, entry.name), destination)
    else if (entry.isFile()) await cp(join(source, entry.name), destination)
  }
}

async function readSkillMarkdown(path: string): Promise<string> { return await (await import('node:fs/promises')).readFile(path, 'utf8') }
async function exists(path: string): Promise<boolean> { return await stat(path).then(() => true, () => false) }
async function skillDirectories(root: string): Promise<string[]> {
  if (!(await exists(root))) return []
  return (await readdir(root, { withFileTypes: true })).filter(entry => entry.isDirectory() && isSkillName(entry.name)).map(entry => entry.name).sort()
}

async function disabledSkills(): Promise<ZeroWallSkillSummary[]> {
  const summaries: ZeroWallSkillSummary[] = []
  for (const name of await skillDirectories(disabledSkillDir())) {
    const detail = await disabledSkill(name)
    if (detail !== undefined) summaries.push(detail)
  }
  return summaries
}

async function disabledSkill(name: string): Promise<ZeroWallSkillDetail | undefined> {
  const normalized = validateSkillName(name)
  const path = join(safeSkillPath(disabledSkillDir(), normalized), 'SKILL.md')
  if (!(await exists(path))) return undefined
  const parsed = validateSkillMarkdown(await readSkillMarkdown(path))
  return {
    name: parsed.name,
    description: parsed.description,
    ...(parsed.whenToUse === undefined ? {} : { whenToUse: parsed.whenToUse }),
    source: 'user',
    provider: 'zerowall-user-skills',
    modelInvocable: false,
    userInvocable: false,
    content: parsed.content,
    contentHash: createHash('sha256').update(parsed.content).digest('hex'),
  }
}

function skillSummary(skill: SkillSummary): ZeroWallSkillSummary {
  return {
    name: skill.name,
    description: skill.description,
    ...(skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse }),
    source: skill.source,
    provider: skill.provider,
    modelInvocable: skill.invocation.modelInvocable,
    userInvocable: skill.invocation.userInvocable,
  }
}

function skillDetail(skill: SkillDefinition): ZeroWallSkillDetail {
  const metadata = skill.metadata?.zerowall
  const version = metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>).version : undefined
  return {
    ...skillSummary(skill), content: skill.content,
    contentHash: createHash('sha256').update(skill.content).digest('hex'),
    ...(typeof version === 'string' && /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/u.test(version) ? { declaredVersion: version } : {}),
  }
}

export function apply(ctx: Context): void {
  ctx.plugin(ZeroWallCapabilitiesService)
}

export default { inject, apply }
