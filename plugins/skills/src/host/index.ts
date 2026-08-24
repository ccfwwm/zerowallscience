import type { Context } from '@deepseek-ai/cordis'
import { cp, mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import type { SkillDefinition, SkillSummary } from '@deepseek-ai/dsh-skill'
import { isSkillName } from '@deepseek-ai/dsh-skill'
import { apply as applySkillFilesystem } from '@deepseek-ai/dsh-skill-filesystem'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from 'zod'
import type { CopyBundledSkillInput, CreateSkillInput, ImportSkillInput, SkillSourceSnapshot, ZeroWallSkillDetail, ZeroWallSkillSummary } from '../shared/types.js'

export type { CopyBundledSkillInput, CreateSkillInput, ImportSkillInput, SkillSourceSnapshot, ZeroWallSkillDetail, ZeroWallSkillSummary } from '../shared/types.js'

export const inject = ['skills', 'systemPrompt']

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
      })
    }
    const userSkillsDir = userSkillDir()
    if (typeof registry?.registerProvider === 'function') {
      void mkdir(userSkillsDir, { recursive: true })
      applySkillFilesystem(runtimeCtx, {
        providerName: 'zerowall-user-skills',
        includeDefaultRoots: false,
        customSkillDirs: [userSkillsDir],
        // DSH assigns custom roots rank 300 and bundled roots rank 600, so an
        // editable user Skill wins a same-name bundled catalog entry.
        watch: true,
      })
    }
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
    await rename(from, to)
  }
}

function userSkillDir(): string {
  return resolve(process.env.ZEROWALL_USER_SKILLS ?? join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'zerowall-skills', 'enabled'))
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
  return { ...skillSummary(skill), content: skill.content }
}

export function apply(ctx: Context): void {
  ctx.plugin(ZeroWallCapabilitiesService)
}

export default { inject, apply }
