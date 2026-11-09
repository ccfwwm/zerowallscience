/** Curated skills, inert imports and one persistent enablement policy for every skill consumer. */
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type {} from '@deepseek-ai/dsh-working-directory'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { BUNDLED_SKILL_RANK, type SkillCandidate, type SkillProviderControl, type SkillViewOptions } from '@deepseek-ai/dsh-skill'
import type SkillRegistry from './registry.js'
import { z } from 'zod'
import configSchema from '@deepseek-ai/schemastery'
import type { CatalogSkill, ManagedSkill, SkillsRequest, SkillsResponse } from '../shared/types.js'
import { parseInstruction, prepareImport, publishImport, type PreparedImport } from './importer.js'

export const name = 'zerowall-skills'
export const inject = ['skills']
/** Skill management stores only data below the selected Harness home. */
export const Config = configSchema.object({ home: configSchema.string(), resources: configSchema.string(), providerOwners: configSchema.dict(configSchema.string()), searchLimit: configSchema.natural().min(1).max(50).default(10) })
/** Configured storage and shipped resource roots; neither depends on an installation directory. */
export interface Config { home?: string; resources?: string; providerOwners?: Record<string, string>; searchLimit?: number }

const requestSchema = z.object({ action: z.enum(['list', 'detail', 'set-enabled', 'set-topic', 'preview', 'install', 'remove', 'activate']), cwd: z.string().optional(), id: z.string().optional(), name: z.string().optional(), enabled: z.boolean().optional(), topic: z.string().optional(), source: z.string().optional(), scope: z.enum(['workspace', 'global']).optional(), replace: z.boolean().optional() })
const importSchema = z.object({ id: z.string(), name: z.string(), description: z.string(), path: z.string(), root: z.string(), source: z.string(), cwd: z.string().optional(), commit: z.string().optional() })
const stateSchema = z.object({ version: z.literal(1), overrides: z.record(z.string(), z.boolean()), workspaceOverrides: z.record(z.string(), z.record(z.string(), z.boolean())), topics: z.array(z.string()), imports: z.array(importSchema) })
type State = z.infer<typeof stateSchema>
type Imported = State['imports'][number]

declare module '@deepseek-ai/cordis' { interface Context { zerowallSkills: SkillsManagement } }

/** Owns durable management changes and the lifecycle of its provider and registry policy. */
export class SkillsManagement extends TypertRemoteService {
  static inject = ['skills']
  private state: State = { version: 1, overrides: {}, workspaceOverrides: {}, topics: [], imports: [] }
  private catalog: CatalogSkill[] = []
  private readonly root: string
  private readonly resources: string
  private readonly providerOwners: Readonly<Record<string, string>>
  private readonly ready: Promise<void>
  private policyControl?: SkillProviderControl
  private providerControl?: SkillProviderControl
  private queue: Promise<void> = Promise.resolve()
  private readonly previews = new Map<string, PreparedImport>()
  private disposed = false
  private readonly automatic = new Map<string, Set<string>>()
  private readonly registry: Pick<SkillRegistry, 'registerProvider' | 'registerEnablementPolicy' | 'inventory' | 'get'>

  constructor(private readonly host: Context, config: Config) {
    super(host, 'zerowallSkills')
    this.providerOwners = config.providerOwners ?? {}
    this.registry = host.get('skills') as typeof this.registry
    this.root = join(resolve(config.home ?? resolveDshHome()), 'zerowall-skills')
    const ownFile = fileURLToPath(import.meta.url).replace(/\.asar([\\/])/u, '.asar.unpacked$1')
    const packageRoot = ownFile.endsWith('.ts') ? resolve(dirname(ownFile), '../..') : resolve(dirname(ownFile), '..')
    this.resources = resolve(config.resources ?? join(packageRoot, 'resources'))
    this.ready = this.initialize()
    void this.ready.catch(error => host.logger.error(`Skill management could not initialize: ${String(error)}`))
    host.effect(() => this.registry.registerProvider(control => {
      this.providerControl = control
      return { name: 'zerowall-curated', list: async options => { await this.ready; return this.candidates(options) }, get: async candidate => {
        await this.ready
        if (typeof candidate.locator !== 'string') throw new Error('Skill locator must be a local instruction path.')
        const parsed = parseInstruction(await readFile(candidate.locator, 'utf8'))
        return { ...candidate, content: await this.runtimeContent(candidate, parsed.content), metadata: parsed.metadata }
      } }
    }))
    host.effect(() => this.registry.registerEnablementPolicy(control => {
      this.policyControl = control
      return (candidate, options) => this.enabled(candidate, options)
    }))
    host.effect(() => async () => {
      this.disposed = true
      await this.queue
      await this.ready.catch(() => undefined)
      for (const staged of this.previews.values()) await rm(staged.directory, { recursive: true, force: true })
      this.previews.clear()
    })
  }

  private async initialize(): Promise<void> {
    await mkdir(this.root, { recursive: true })
    const parsed: unknown = JSON.parse(await readFile(join(this.resources, 'catalog.json'), 'utf8'))
    this.catalog = z.array(z.object({ name: z.string(), path: z.string(), description: z.string(), topic: z.string(), core: z.boolean(), license: z.string(), capabilityId: z.string(), requirements: z.array(z.string()) })).parse(parsed)
    try { this.state = stateSchema.parse(JSON.parse(await readFile(join(this.root, 'state.json'), 'utf8'))) }
    catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error }
    this.providerControl?.invalidate()
    this.policyControl?.invalidate()
  }

  private enabled(candidate: SkillCandidate, options: SkillViewOptions): boolean {
    const cwd = options.cwd ? resolve(options.cwd) : undefined
    const override = cwd ? this.state.workspaceOverrides[cwd]?.[candidate.name] : undefined
    if (override !== undefined) return override
    const global = this.state.overrides[candidate.name]
    if (global !== undefined) return global
    if (candidate.provider !== 'zerowall-curated') return true
    const curated = this.catalog.find(row => row.name === candidate.name)
    if (curated) return curated.core || this.state.topics.includes(curated.topic) || (cwd !== undefined && this.automatic.get(cwd)?.has(candidate.name) === true)
    return false
  }

  private async candidates(options: SkillViewOptions): Promise<SkillCandidate[]> {
    const entries = await Promise.all(this.catalog.map(row => this.candidate(row.name, row.description, join(this.resources, row.path), 'bundled', BUNDLED_SKILL_RANK, { topic: row.topic, license: row.license })))
    const cwd = options.cwd ? resolve(options.cwd) : undefined
    for (const row of this.state.imports) {
      if (row.cwd && row.cwd !== cwd) continue
      entries.push(await this.candidate(row.name, row.description, row.path, row.cwd ? 'project-dsh' : 'user-dsh', row.cwd ? 100 : 400, { importedId: row.id, topic: 'imported' }))
    }
    return entries
  }

  private async candidate(name: string, description: string, path: string, source: string, rank: number, metadata: Record<string, unknown>): Promise<SkillCandidate> {
    const { invocation } = parseInstruction(await readFile(path, 'utf8'))
    return { name, description, path, source, provider: 'zerowall-curated', rank, locator: path, resourceBase: { kind: 'directory', path: dirname(path) }, invocation, metadata }
  }

  private async save(next: State): Promise<void> {
    const path = join(this.root, 'state.json')
    const temporary = `${path}.${randomUUID()}.tmp`
    await writeFile(temporary, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 })
    try { await rename(temporary, path) }
    catch (error) { await rm(temporary, { force: true }); throw error }
    this.state = next
    this.policyControl?.invalidate()
    this.providerControl?.invalidate()
  }

  private async dependencies(rows: CatalogSkill[]): Promise<void> {
    const requirements = rows.filter(row => row.requirements.length)
    if (!requirements.length) return
    const management = this.host.get('zerowallPythonManagement')
    if (!management || typeof management !== 'object' || !('ensureCapability' in management) || typeof management.ensureCapability !== 'function') throw new Error('Python dependency management is unavailable. Enable the Python plugin and retry.')
    for (const id of new Set(requirements.map(row => row.capabilityId))) await management.ensureCapability(id)
  }

  private async runtimeContent(candidate: SkillCandidate, content: string): Promise<string> {
    const row = this.catalog.find(entry => join(this.resources, entry.path) === candidate.path)
    const notes: string[] = []
    if (row?.requirements.length) {
      const management = this.host.get('zerowallPythonManagement')
      if (!management || typeof management !== 'object' || !('resolveCapability' in management) || typeof management.resolveCapability !== 'function') throw new Error('Python dependency management is unavailable. Enable the Python plugin and retry.')
      const paths: unknown = await management.resolveCapability(row.capabilityId)
      const runtime = z.object({ executable: z.string(), sitePackages: z.string(), root: z.string() }).parse(paths)
      notes.push(`Python capability: ${JSON.stringify(row.capabilityId)}. Pass this id as capability_id to the python tool, or use this capability's interpreter explicitly: ${JSON.stringify(runtime.executable)}. Its dependency directory is ${JSON.stringify(runtime.sitePackages)} and environment root is ${JSON.stringify(runtime.root)}. These resolved paths override process-wide Python variables for this skill. Pass the executable explicitly when launching a resource script; do not install into another environment.`)
    }
    if (row?.topic === 'academic-research') notes.push(`Academic Research shared resources and scripts resolve from ${JSON.stringify(join(this.resources, 'skills', 'academic-research-shared'))}. Paths starting with scripts/ or shared/ refer to that root. Upstream hooks are not enabled.`)
    return notes.length ? `${notes.join('\n\n')}\n\n${content}` : content
  }

  /**
   * Read or change management state after validating the untrusted wire request.
   * @param request - operation and explicit workspace/import selection.
   * @returns committed state or a read-only import preview; imported code is never executed.
   */
  @Remote('request')
  async request(request: SkillsRequest): Promise<SkillsResponse> {
    const input = requestSchema.parse(request)
    await this.ready
    if (input.action === 'list' || input.action === 'detail') return this.read(input)
    let answer: SkillsResponse = {}
    const operation = this.queue.then(async () => {
      if (this.disposed) throw new Error('Skill management is shutting down.')
      answer = await this.mutate(input)
    })
    this.queue = operation.catch(() => undefined)
    await operation
    return answer
  }

  private async read(input: SkillsRequest): Promise<SkillsResponse> {
    const snapshot = await this.registry.inventory({ cwd: input.cwd })
    const entries: ManagedSkill[] = snapshot.entries.map(entry => {
      const imported = this.state.imports.find(row => row.path === entry.skill.path)
      const curated = entry.skill.provider === 'zerowall-curated' ? this.catalog.find(row => row.name === entry.skill.name) : undefined
      const owner = entry.skill.source === 'bundled' && !imported && !curated
        ? (typeof entry.metadata?.ownerPackage === 'string' ? entry.metadata.ownerPackage : this.providerOwners[entry.skill.provider]) : undefined
      const cwd = input.cwd ? resolve(input.cwd) : undefined
      const explicit = cwd ? this.state.workspaceOverrides[cwd]?.[entry.skill.name] ?? this.state.overrides[entry.skill.name] : this.state.overrides[entry.skill.name]
      const onDemand = curated !== undefined && !curated.core && explicit === undefined && !this.state.topics.includes(curated.topic)
        && entry.skill.invocation.modelInvocable
      return { id: imported?.id ?? `${entry.skill.provider}:${entry.skill.path ?? entry.skill.name}`, name: entry.skill.name, description: entry.skill.description, source: entry.skill.source, provider: entry.skill.provider, kind: owner ? 'plugin-instructions' : 'standalone', ...(owner ? { ownerPackage: owner } : {}), topic: curated?.topic ?? (imported ? 'imported' : 'plugin'), enabled: entry.enabled, onDemand, effective: entry.effective, removable: imported !== undefined, ...(entry.skill.path ? { path: entry.skill.path } : {}), ...(curated ? { license: curated.license } : {}), requirements: curated?.requirements ?? [] }
    })
    if (input.action === 'detail') {
      const item = entries.find(row => row.id === input.id)
      if (!item) throw new Error('Skill is no longer available. Refresh the catalog.')
      if (item.path) return { entries: [item], content: await readFile(item.path, 'utf8'), complete: snapshot.complete }
      const loaded = await this.registry.get(item.name, { cwd: input.cwd })
      return { entries: [item], content: loaded?.content ?? '', complete: snapshot.complete }
    }
    return { entries, complete: snapshot.complete }
  }

  private async mutate(input: SkillsRequest): Promise<SkillsResponse> {
    const next = structuredClone(this.state)
    if (input.action === 'activate') {
      if (!input.cwd || !input.name) throw new Error('A current workspace and exact skill name are required.')
      const candidate = (await this.registry.inventory({ cwd: input.cwd })).entries.find(entry => entry.effective && entry.skill.name === input.name)
      if (!candidate?.skill.invocation.modelInvocable) throw new Error('This skill does not permit automatic model invocation.')
      const row = (await this.read({ action: 'list', cwd: input.cwd })).entries?.find(entry => entry.name === input.name && entry.effective)
      if (!row || (!row.onDemand && !row.enabled)) throw new Error('This skill is disabled. Enable it manually in Skills settings before using it.')
      if (row.enabled) return { status: 'already-enabled' }
      const curated = this.catalog.find(entry => entry.name === input.name)
      if (!curated) throw new Error('Only bundled optional skills support automatic activation.')
      await this.dependencies([curated])
      const cwd = resolve(input.cwd)
      const selected = this.automatic.get(cwd) ?? new Set<string>()
      selected.add(input.name)
      this.automatic.set(cwd, selected)
      this.policyControl?.invalidate()
      return { status: 'activated' }
    }
    if (input.action === 'preview') {
      if (!input.source?.trim()) throw new Error('Select a skill source.')
      if (this.previews.size >= 8) throw new Error('Finish or restart the existing import previews before adding more.')
      const names = new Set((await this.registry.inventory({ cwd: input.cwd })).entries.map(row => row.skill.name))
      const prepared = await prepareImport(input.source, join(this.root, 'staging'), names)
      this.previews.set(prepared.preview.id, prepared)
      return { preview: prepared.preview }
    }
    if (input.action === 'set-topic') {
      if (!input.topic || !this.catalog.some(row => row.topic === input.topic && !row.core)) throw new Error('Unknown optional skill topic.')
      const rows = this.catalog.filter(row => row.topic === input.topic)
      if (input.enabled) await this.dependencies(rows)
      if (input.scope === 'workspace') {
        if (!input.cwd) throw new Error('Choose a workspace before changing its skill policy.')
        const cwd = resolve(input.cwd)
        next.workspaceOverrides[cwd] = { ...next.workspaceOverrides[cwd], ...Object.fromEntries(rows.map(row => [row.name, Boolean(input.enabled)])) }
      } else {
        next.topics = input.enabled ? [...new Set([...next.topics, input.topic])] : next.topics.filter(topic => topic !== input.topic)
        for (const row of rows) {
          if (input.enabled) delete next.overrides[row.name]
          else next.overrides[row.name] = false
        }
      }
    } else if (input.action === 'set-enabled') {
      if (!input.name) throw new Error('Choose a skill to enable or disable.')
      const row = this.catalog.find(item => item.name === input.name)
      if (input.enabled && row && !row.core) {
        await this.dependencies([row])
      }
      const cwd = input.scope === 'workspace' && input.cwd ? resolve(input.cwd) : undefined
      if (input.scope === 'workspace' && !cwd) throw new Error('Choose a workspace before changing its skill policy.')
      if (cwd) next.workspaceOverrides[cwd] = { ...next.workspaceOverrides[cwd], [input.name]: Boolean(input.enabled) }
      else next.overrides[input.name] = Boolean(input.enabled)
    } else if (input.action === 'install') {
      const prepared = input.id ? this.previews.get(input.id) : undefined
      if (!prepared) throw new Error('Import preview expired. Preview the source again.')
      const currentNames = new Set((await this.registry.inventory({ cwd: input.cwd })).entries.map(row => row.skill.name))
      const conflicts = prepared.preview.skills.filter(row => row.conflict || currentNames.has(row.name))
      if (conflicts.length && !input.replace) throw new Error('Import has name conflicts. Review and explicitly replace or cancel.')
      const cwd = input.scope === 'workspace' ? input.cwd ? resolve(input.cwd) : undefined : undefined
      if (input.scope === 'workspace' && !cwd) throw new Error('Choose a workspace before importing into it.')
      const installedRoot = await publishImport(prepared, join(this.root, 'imports'))
      this.previews.delete(prepared.preview.id)
      const imported: Imported[] = prepared.preview.skills.map(row => ({ id: randomUUID(), name: row.name, description: row.description, root: installedRoot, path: join(installedRoot, row.relativePath), source: prepared.preview.source, ...(cwd ? { cwd } : {}), ...(prepared.preview.commit ? { commit: prepared.preview.commit } : {}) }))
      const names = new Set(imported.map(row => row.name))
      next.imports = [...next.imports.filter(row => !(names.has(row.name) && row.cwd === cwd)), ...imported]
      const disabled = Object.fromEntries([...names].map(name => [name, false]))
      if (cwd) next.workspaceOverrides[cwd] = { ...next.workspaceOverrides[cwd], ...disabled }
      else next.overrides = { ...next.overrides, ...disabled }
      try { await this.save(next) }
      catch (error) { throw new Error('Import files were retained but management state could not be saved. Preview and retry.', { cause: error }) }
      return { installed: [...names], status: 'installed-disabled' }
    } else if (input.action === 'remove') {
      const row = next.imports.find(entry => entry.id === input.id)
      if (!row) throw new Error('Only user-imported skills can be removed here.')
      next.imports = next.imports.filter(entry => entry.id !== row.id)
      const backup = join(this.root, 'backups', `${Date.now()}-${row.id}.json`)
      await mkdir(dirname(backup), { recursive: true })
      await writeFile(backup, JSON.stringify(row, null, 2) + '\n', { mode: 0o600 })
    } else throw new Error('Unsupported skill operation.')
    await this.save(next)
    return { status: 'saved' }
  }
}

/**
 * Mount management using the Host registry shared by standard and Claude sessions.
 * @param ctx - plugin lifecycle context.
 * @param config - selected Harness home and optional resources root.
 * @returns completion after service registration.
 */
export function apply(ctx: Context, config: Config): void {
  const searchLimit = config.searchLimit ?? 10
  ctx.plugin(SkillsManagement, config)
  ctx.inject(['zerowallSkills', 'tools', 'workingDirectory'], scope => {
    scope.effect(() => scope.tools.register(defineTool({
      name: 'skills_manage',
      description: 'Search optional scientific workflows by task or capability before starting specialized work. Activate a matching on-demand skill for the current workspace, then load its full instructions with the skill tool. Manually disabled skills remain unavailable.',
      parameters: {
        action: { type: 'string', enum: ['search', 'activate'], required: true },
        query: { type: 'string', description: 'Capability keywords used to find a workflow.' },
        name: { type: 'string', description: 'Exact skill name to activate after searching.' },
      },
      output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
      async execute(args, exec): Promise<Record<string, JsonValue>> {
        if (exec.agent === undefined) throw new Error('Skill discovery requires a conversation workspace.')
        const cwd = await scope.workingDirectory.ensure(exec.agent, exec.signal)
        if (args.action === 'activate') return { status: (await scope.zerowallSkills.request({ action: 'activate', name: args.name, cwd })).status ?? 'activated' }
        const terms = (args.query ?? '').toLowerCase().split(/\s+/u).filter(Boolean)
        const entries = (await scope.zerowallSkills.request({ action: 'list', cwd })).entries ?? []
        const invocable = new Set((await scope.skills.inventory({ cwd })).entries.filter(entry => entry.effective && entry.skill.invocation.modelInvocable).map(entry => entry.skill.name))
        return { matches: entries.filter(row => row.effective && invocable.has(row.name) && (row.enabled || row.onDemand)
          && terms.every(term => `${row.name} ${row.description} ${row.topic}`.toLowerCase().includes(term)))
          .slice(0, searchLimit).map(row => ({ name: row.name, description: row.description, topic: row.topic,
            state: row.onDemand && !row.enabled ? 'on-demand' : 'enabled', requirements: row.requirements })) }
      },
    })), 'zerowall-skills: demand activation tool')
  })
}
