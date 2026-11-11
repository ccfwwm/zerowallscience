import { Service } from '@deepseek-ai/cordis'
import { z as schema } from 'zod'
import type { ProjectionHandle } from '@deepseek-ai/dsh-session-projection'
import type { Context, FiberState } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import { SecretBrokerClient } from '@zerowall/dsh-plugin-ai-cloud/secrets'
import type {} from '@deepseek-ai/dsh-agent'
import { SessionId, appendPluginRecord, pluginRecordOf, type Session, type SessionSeq } from '@deepseek-ai/dsh-session'
import type { EnvironmentSettingsValue, EnvironmentVariableInfo, EnvironmentSyncStatus, ImageGenerationQuality, ImageModelSelection } from '../shared/types.js'
import { fetchOfficialEnvironment } from './official-config.js'
import { installWindowsShellPath } from './windows-shell-path.js'

declare module '@deepseek-ai/dsh-session/types' {
  interface PluginRecordMap { 'plugin:zerowall/context-budget': { tokens: number } }
}

export const name = 'zerowall-environment'
export const ENVIRONMENT_SETTINGS_NS = 'zerowall-environment' as SettingsNamespace
export const EnvironmentSettingsSchema: z<EnvironmentSettingsValue> = z.object({
  retiredVariablesRemoved: z.boolean().default(false),
  variables: z.array(z.object({ name: z.string() })).default([]),
  imageModel: z.object({
    providerId: z.string().default(''),
    groupId: z.string().default(''),
    modelId: z.string().default(''),
    profileId: z.string().default(''),
    resolution: z.string().default(''),
    aspectRatio: z.string().default(''),
    imageSize: z.string().default(''),
  }).default({ providerId: '', groupId: '', modelId: '' }),
  imageQuality: z.union(['auto', 'low', 'medium', 'high', 'xhigh', 'max'] as const).default('medium'),
  contextBudgetTokens: z.number().step(1).min(32_000).max(1_000_000).default(300_000),
})

interface BudgetMeasurement {
  totalTokens: number
  baseline: { kind: string }
  nodes: readonly { seq: SessionSeq; tokens: number }[]
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    tokenMeter: { measure(session: Session): BudgetMeasurement }
    compaction: {
      compactRegion(start: SessionSeq, end: SessionSeq, agent: { session: Session; options: { provider: string; model: string } }, signal?: AbortSignal): Promise<{ shadowedTokenCount: number }>
    }
  }
}

function balancedCuts(session: Session, surface: readonly SessionSeq[]): boolean[] {
  const cuts = [true]
  let pending = 0
  for (const seq of surface) {
    const event = session.eventAt(seq)
    if (event?.type === 'assistant/message') pending += event.data.message.content.filter(block => block.type === 'tool-call').length
    else if (event?.type === 'tool/result') pending -= 1
    if (pending < 0) throw new Error('Context pressure surface has an unmatched tool result.')
    cuts.push(pending === 0)
  }
  return cuts
}

export function selectContextBudgetRange(
  session: Session,
  surface: readonly SessionSeq[],
  tokensBySeq: ReadonlyMap<SessionSeq, number>,
  firstIndex: number,
  neededTokens: number,
): { start: SessionSeq; end: SessionSeq } | undefined {
  const start = surface[firstIndex]
  const cuts = balancedCuts(session, surface)
  if (start === undefined || !cuts[firstIndex]) return undefined
  let selected = 0
  for (let index = firstIndex; index < surface.length - 1; index++) {
    const seq = surface[index]
    if (seq === undefined) continue
    selected += tokensBySeq.get(seq) ?? 0
    if (selected >= neededTokens && cuts[index + 1]) return { start, end: seq }
  }
  return undefined
}

/** The user budget caps prompt input; output is reserved against model capacity. */
export function contextPressureThreshold(budget: number, contextWindow: number, outputReserve: number): number {
  return Math.min(Math.floor(budget * 0.9), contextWindow - outputReserve - 16_000)
}

const CONTEXT_BUDGET_EVENT = 'plugin:zerowall/context-budget' as const

const VARIABLE_NAME = /^[A-Z_][A-Z0-9_]{0,127}$/u
const RESERVED = new Set(['NODE_OPTIONS', 'ELECTRON_RUN_AS_NODE', 'PATH', 'PATHEXT', 'COMSPEC', 'DSH_HOME', 'ZEROWALL_USER_DATA_DIR', 'ZEROWALL_DESKTOP_RUNTIME_ROOT', 'ZEROWALL_DESKTOP_PNPM_ENTRY', 'DSH_DESKTOP_NODE_EXECUTABLE'])
const KEY_PREFIX = 'zerowall.environment.var.'
const METADATA_KEY = 'zerowall.environment.meta'
// These are part of the TSG contract even when an older settings snapshot
// did not persist the variable names alongside the encrypted values.
const WELL_KNOWN_VARIABLES = ['R_PLATFORM_MCP_AUTHORIZATION', 'MINERU_API_TOKEN', 'ZEROWALL_SCIMASTER_API_KEY', 'HUAGONGSHE_MCP_AUTHORIZATION', 'NCBI_API_KEY']
const RETIRED_VARIABLES = ['TSG_PM_JSESSIONID', 'TSG_SESSIONID', 'TSG_SGUSER', 'TSG_TSGUSER', 'TSG_JSESSIONID', 'RESEARCH_SCIDB_SETTLE_MS', 'LITERATURE_OUTPUT_ROOT', 'LITERATURE_DISABLE_PAPER_DOWNLOAD', 'LITERATURE_DOWNLOAD_WORKERS', 'LITERATURE_MAX_PDF_BYTES', 'AUTHORIZED_ADAPTER_MODULE', 'AUTHORIZED_ADAPTER_ALLOWED_DOMAINS', 'ZEROWALL_PAPER_DOWNLOAD_ROOT'] as const
// Cordis publishes FiberState as a const enum, which has no runtime export.
const FIBER_ACTIVE = 2 as FiberState.ACTIVE
type ProvenanceEntry = { source: 'official' | 'user'; version?: string }
type Provenance = { version: 1; variables: Record<string, ProvenanceEntry>; deletedNames?: string[] }

export function validateEnvironmentVariableName(name: string): string {
  const value = name.trim().toUpperCase()
  if (!VARIABLE_NAME.test(value) || RESERVED.has(value)) throw new Error(`环境变量名无效或被保留：${name}`)
  return value
}

function credentialKey(name: string): string { return `${KEY_PREFIX}${name.toLowerCase()}` }
export async function isEnvironmentVariableConfigured(name: string, getCredential: (key: string) => Promise<string | undefined>, environment: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  const value = await getCredential(credentialKey(name))
  return Boolean(value?.trim() || environment[name]?.trim())
}

declare module '@deepseek-ai/cordis' {
  interface Context { zerowallEnvironment: ZeroWallEnvironmentService }
}

export class ZeroWallEnvironmentService extends TypertRemoteService {
  static inject = ['settings', 'llm', 'tokenMeter', 'credentials', 'sessionProjections', 'agents']
  static Config = EnvironmentSettingsSchema
  private readonly secrets: SecretBrokerClient
  private settings: EnvironmentSettingsValue
  private readonly hydration: Promise<void>
  private readonly syncAbort = new AbortController()
  private officialStatus: EnvironmentSyncStatus = { state: 'idle', appliedNames: [] }
  private mutation: Promise<void> = Promise.resolve()
  private budget!: ProjectionHandle<{ tokens: number | null }>

  constructor(private readonly hostCtx: Context, config: EnvironmentSettingsValue) {
    super(hostCtx, 'zerowallEnvironment')
    this.secrets = new SecretBrokerClient(hostCtx.credentials)
    this.settings = config
    hostCtx.on('settings/document-updated', (ns) => {
      if (ns !== ENVIRONMENT_SETTINGS_NS) return
      const value = hostCtx.settings.describe().find(row => row.ns === ENVIRONMENT_SETTINGS_NS)?.value
      if (value !== undefined) this.settings = value as EnvironmentSettingsValue
    })
    hostCtx.on('agent/pre-step', async ({ agent, signal }, next) => {
      const decision = await next()
      if (decision.kind === 'reject' || signal.aborted) return decision
      const route = agent.session.requestHeader()?.config
      const provider = route?.provider || agent.options.provider
      const model = route?.model || agent.options.model
      const requestedBudget = this.budgetTokens(agent.session) ?? this.settings.contextBudgetTokens
      if (!provider || !model || requestedBudget < 32_000) return decision
      try {
        // Web presets isolate compaction per agent; it is not a Host service.
        const presets = hostCtx.get('agentPresets') as { serviceFor(agent: unknown, name: string): unknown } | undefined
        const compaction = (presets?.serviceFor(agent, 'compaction') ?? hostCtx.get('compaction')) as Context['compaction'] | undefined
        if (!compaction) return decision
        const modelInfo = await hostCtx.llm.resolveModelInfo(provider, model, signal)
        const contextWindow = modelInfo.context?.contextWindow
        if (typeof contextWindow !== 'number' || !Number.isSafeInteger(contextWindow) || contextWindow <= 0) {
          hostCtx.logger.warn(`[context-budget] session=${agent.session.id} requested=${requestedBudget} effective=unknown reason=model-window-unavailable`)
          return decision
        }
        const effectiveBudget = Math.min(requestedBudget, contextWindow)
        const measurement = hostCtx.tokenMeter.measure(agent.session)
        const outputReserve = route?.maxTokens ?? agent.options.maxTokens ?? modelInfo.defaultMaxTokens ?? 0
        const threshold = contextPressureThreshold(effectiveBudget, contextWindow, outputReserve)
        if (threshold <= 0) {
          hostCtx.logger.warn(`[context-budget] session=${agent.session.id} requested=${requestedBudget} effective=${effectiveBudget} capacity=${contextWindow} outputReserve=${outputReserve} compacted=false reason=output-reserve-exceeds-budget`)
          return decision
        }
        if (measurement.totalTokens < threshold) return decision
        const pruner = (presets?.serviceFor(agent, 'toolResultPruner') ?? hostCtx.get('toolResultPruner')) as { pruneSession?(session: unknown): unknown } | undefined
        pruner?.pruneSession?.(agent.session)
        const current = hostCtx.tokenMeter.measure(agent.session)
        if (current.totalTokens < threshold) {
          hostCtx.logger.info(`[context-budget] session=${agent.session.id} requested=${requestedBudget} effective=${effectiveBudget} capacity=${contextWindow} estimated=${current.baseline.kind === 'estimated'} pruned=true compacted=false`)
          return decision
        }
        const surface = agent.session.surface.nodes
        const nodeTokens = new Map(current.nodes.map(node => [node.seq, node.tokens]))
        const firstSeq = surface[0]
        const firstIndex = firstSeq !== undefined && agent.session.eventAt(firstSeq)?.type === 'system/message' ? 1 : 0
        const needed = current.totalTokens - threshold + Math.min(24_000, Math.floor(effectiveBudget * 0.08))
        const range = selectContextBudgetRange(agent.session, surface, nodeTokens, firstIndex, needed)
        if (range === undefined) {
          hostCtx.logger.warn(`[context-budget] session=${agent.session.id} requested=${requestedBudget} effective=${effectiveBudget} capacity=${contextWindow} estimated=${current.baseline.kind === 'estimated'} compacted=false reason=no-balanced-range`)
          return decision
        }
        const result = await compaction.compactRegion(range.start, range.end, { session: agent.session, options: { provider, model } }, signal)
        hostCtx.logger.info(`[context-budget] session=${agent.session.id} requested=${requestedBudget} effective=${effectiveBudget} capacity=${contextWindow} before=${current.totalTokens} shadowed=${result.shadowedTokenCount} compacted=true`)
      } catch (error) {
        if (!signal.aborted) hostCtx.logger.warn(`[context-budget] automatic compaction failed: ${error instanceof Error ? error.message : String(error)}`)
      }
      return decision
    })
    // ConfigEditor accepts writes only after the owning Loader fiber is active.
    this.hydration = new Promise<void>((resolve, reject) => {
      let started = false
      const owner = this.hostCtx.fiber.parent.fiber
      const active = () => owner.state === FIBER_ACTIVE && this.hostCtx.fiber.state === FIBER_ACTIVE
      const run = async (): Promise<void> => {
        if (started) return
        started = true
        dispose()
        try {
          await this.removeRetiredVariables()
          await this.hydrate()
          await this.synchronizeOfficial(false)
          resolve()
        } catch (error: unknown) {
          this.officialStatus = { state: 'failed', appliedNames: [], failure: 'secure-storage' }
          reject(error)
        }
      }
      const dispose = this.hostCtx.on('internal/status', (fiber) => {
        if ((fiber === this.hostCtx.fiber || fiber === owner) && active()) void run()
      })
      this.hostCtx.effect(() => async () => {
        this.syncAbort.abort()
        dispose()
        if (!started) reject(new Error('Environment service stopped before initialization.'))
        await this.hydration.catch(() => undefined)
      })
      if (active()) void run()
    })
    // Consumers still receive the rejection through ready(); observe it for
    // installations without a dependent service or an open settings page.
    void this.hydration.catch(() => this.hostCtx.logger.warn('Environment secure storage initialization failed.'))
  }

  /** Wait for secure local recovery and one missing-only official synchronization. */
  ready(): Promise<void> { return this.hydration }

  @Remote('syncStatus')
  syncStatus(): EnvironmentSyncStatus { return { ...this.officialStatus, appliedNames: [...this.officialStatus.appliedNames] } }

  @Remote('syncOfficialDefaults')
  async syncOfficialDefaults(): Promise<EnvironmentVariableInfo[]> {
    await this.hydration
    await this.serializeMutation(() => this.synchronizeOfficial(false))
    return this.listVariables()
  }

  /** Restore the latest validated session budget before exposing its readers. */
  async [Service.init](): Promise<void> {
    const stateSchema = schema.object({ tokens: schema.number().int().min(32_000).max(1_000_000).nullable() })
    this.budget = await this.hostCtx.sessionProjections.register({
      key: 'zerowallContextBudget', stateVersion: 1, stateSchema, init: () => ({ tokens: null }),
      apply(state, event) {
        const record = pluginRecordOf(event)
        if (record?.type !== CONTEXT_BUDGET_EVENT) return state
        const parsed = stateSchema.safeParse(record.data)
        if (!parsed.success) throw new Error('Invalid context budget in session data.')
        return parsed.data
      },
    })
  }

  private budgetTokens(session: Session): number | undefined { return this.budget.stateOf(session).tokens ?? undefined }

  getImageModelSelection(): ImageModelSelection | undefined {
    const selection = this.settings.imageModel
    return selection.providerId && selection.groupId && selection.modelId ? selection : undefined
  }

  @Remote('getImageModelSelection')
  readImageModelSelection(): Promise<ImageModelSelection | undefined> { return Promise.resolve(this.getImageModelSelection()) }

  @Remote('getImageQuality')
  getImageQuality(): ImageGenerationQuality { return this.settings.imageQuality }

  @Remote('getContextBudget')
  getContextBudget(): number { return this.settings.contextBudgetTokens }

  @Remote('setContextBudget')
  async setContextBudget(tokens: number): Promise<void> {
    if (!Number.isSafeInteger(tokens) || tokens < 32_000 || tokens > 1_000_000) throw new Error('上下文预算必须在 32k 到 1,000k token 之间。')
    await this.replaceSettings({ ...this.settings, contextBudgetTokens: tokens })
  }

  @Remote('getSessionContextBudget')
  getSessionContextBudget(sessionId: string): number {
    const agent = this.hostCtx.agents?.get(SessionId(String(sessionId)))
    return agent === undefined ? this.settings.contextBudgetTokens : this.budgetTokens(agent.session) ?? this.settings.contextBudgetTokens
  }

  @Remote('getSessionContextInfo')
  async getSessionContextInfo(sessionId: string): Promise<{ contextWindow?: number; outputReserve?: number; effectiveBudget?: number; pressureThreshold?: number; model?: string }> {
    const agent = this.hostCtx.agents?.get(SessionId(String(sessionId)))
    const header = agent?.session.requestHeader()
    // `model/selection` is a legacy persisted event that is not part of the
    // current SessionEventMap. Read it through a narrow compatibility view so
    // old conversations still report their selected model without widening the
    // DSH event union.
    const recentSelection = (agent?.session.snapshotEvents() as unknown as ReadonlyArray<{ type: string; data?: { provider?: unknown; model?: unknown } }>)
      .findLast(item => item.type === 'model/selection')
    const provider = recentSelection?.data?.provider ?? header?.config.provider ?? agent?.options.provider
    const model = recentSelection?.data?.model ?? header?.config.model ?? agent?.options.model
    if (typeof provider !== 'string' || typeof model !== 'string') return {}
    try {
      const info = await this.hostCtx.llm.resolveModelInfo(provider, model)
      const contextWindow = info.context?.contextWindow
      if (typeof contextWindow !== 'number' || !Number.isSafeInteger(contextWindow) || contextWindow <= 0) return { model }
      const requested = agent === undefined ? this.settings.contextBudgetTokens : this.budgetTokens(agent.session) ?? this.settings.contextBudgetTokens
      const outputReserve = header?.config.maxTokens ?? info.defaultMaxTokens ?? 0
      return {
        model,
        contextWindow,
        outputReserve,
        effectiveBudget: Math.min(requested, contextWindow),
        pressureThreshold: contextPressureThreshold(Math.min(requested, contextWindow), contextWindow, outputReserve),
      }
    } catch {
      return { model }
    }
  }

  @Remote('setSessionContextBudget')
  async setSessionContextBudget(sessionId: string, tokens: number): Promise<void> {
    if (!Number.isSafeInteger(tokens) || tokens < 32_000 || tokens > 1_000_000) throw new Error('上下文预算必须在 32k 到 1,000k token 之间。')
    const agent = this.hostCtx.agents?.get(SessionId(String(sessionId)))
    if (agent === undefined) throw new Error('当前对话不可用，请先打开一个会话。')
    appendPluginRecord(agent.session, CONTEXT_BUDGET_EVENT, { tokens })
  }

  @Remote('getMediaModelSelections')
  async readMediaModelSelections(): Promise<Record<string, { selection: { groupId: string; modelId: string; profileId: string; operation: string }; parameters: { size?: string; quality?: string; resolution?: string; aspect_ratio?: string; duration?: number } }>> {
    const value = await this.secrets.get('zerowall.ai-cloud.media-selections')
    const selections = value ? JSON.parse(value) : {}
    delete selections.image
    return selections
  }
  @Remote('setMediaModelSelections')
  async setMediaModelSelections(value: Record<string, { selection: { groupId: string; modelId: string; profileId: string; operation: string }; parameters: { size?: string; quality?: string; resolution?: string; aspect_ratio?: string; duration?: number } }>): Promise<void> {
    for (const [kind, choice] of Object.entries(value)) {
      const operations = kind === 'video' ? ['video'] : kind === 'music' ? ['chat_music','audio'] : kind === 'speech' ? ['speech'] : []
      if (!operations.includes(choice.selection.operation) || !choice.selection.groupId || !choice.selection.profileId || !choice.selection.modelId) throw new Error('MEDIA_SELECTION_INVALID')
    }
    const legacy = await this.secrets.get('zerowall.ai-cloud.media-selections')
    const previous = legacy ? JSON.parse(legacy) : {}
    await this.secrets.set('zerowall.ai-cloud.media-selections', JSON.stringify({ ...value, ...(previous.image ? { image: previous.image } : {}) }))
  }
  @Remote('listVariables')
  async listVariables(): Promise<EnvironmentVariableInfo[]> {
    await this.hydration
    const metadata = await this.readProvenance()
    const configuredNames = WELL_KNOWN_VARIABLES.filter(name => Boolean(process.env[name]?.trim()))
    const names = [...new Set([...this.settings.variables.map((row: { name: string }) => row.name), ...Object.keys(metadata.variables), ...configuredNames])]
    const values = await Promise.all(names.filter(name => !metadata.deletedNames?.includes(name)).sort().map(async name => {
      const source: EnvironmentVariableInfo['source'] = metadata.variables[name]?.source ?? (process.env[name]?.trim() ? 'environment' : undefined)
      return {
        name,
        // process.env is also a supported source: packaged launches can inject
        // credentials before the settings snapshot is available.
        configured: await isEnvironmentVariableConfigured(name, key => this.secrets.get(key)),
        ...(source === undefined ? {} : { source }),
      }
    }))
    return values
  }

  @Remote('setVariable')
  async setVariable(name: string, value: string): Promise<EnvironmentVariableInfo[]> {
    await this.hydration
    return this.serializeMutation(async () => {
    const key = validateEnvironmentVariableName(name)
    if (!value.trim()) throw new Error('环境变量值不能为空。')
    await this.secrets.set(credentialKey(key), value)
    process.env[key] = value
    const metadata = await this.readProvenance()
    metadata.variables[key] = { source: 'user' }
    metadata.deletedNames = (metadata.deletedNames ?? []).filter(name => name !== key)
    await this.writeProvenance(metadata)
    const current = this.settings.variables.filter((row: { name: string }) => row.name !== key)
    await this.replaceSettings({ ...this.settings, variables: [...current, { name: key }].sort((a, b) => a.name.localeCompare(b.name)) })
    return await this.listVariables()
    })
  }

  @Remote('readVariable')
  async readVariable(name: string): Promise<string | undefined> {
    await this.hydration
    const key = validateEnvironmentVariableName(name)
    if ((await this.readProvenance()).deletedNames?.includes(key)) return undefined
    const value = await this.secrets.get(credentialKey(key))
    return value ?? process.env[key]
  }

  @Remote('deleteVariable')
  async deleteVariable(name: string): Promise<EnvironmentVariableInfo[]> {
    await this.hydration
    return this.serializeMutation(async () => {
    const key = validateEnvironmentVariableName(name)
    await this.secrets.delete(credentialKey(key))
    delete process.env[key]
    const metadata = await this.readProvenance()
    delete metadata.variables[key]
    metadata.deletedNames = [...new Set([...(metadata.deletedNames ?? []), key])]
    await this.writeProvenance(metadata)
    await this.replaceSettings({ ...this.settings, variables: this.settings.variables.filter((row: { name: string }) => row.name !== key) })
    return await this.listVariables()
    })
  }

  private async hydrate(): Promise<void> {
    const metadata = await this.readProvenance()
    const names = [...new Set([...this.settings.variables.map((row: { name: string }) => row.name), ...Object.keys(metadata.variables), ...(metadata.deletedNames ?? []), ...WELL_KNOWN_VARIABLES])]
    for (const name of names) {
      if (metadata.deletedNames?.includes(name)) {
        delete process.env[name]
        await this.secrets.delete(credentialKey(name))
        continue
      }
      const value = await this.secrets.get(credentialKey(name))
      if (value !== undefined) process.env[name] = value
    }
    await this.writeProvenance(metadata)
    const retained = this.settings.variables.filter(row => !metadata.deletedNames?.includes(row.name))
    const known = new Set(retained.map(row => row.name))
    const added = Object.keys(metadata.variables).filter(name => !known.has(name)).map(name => ({ name }))
    if (added.length || retained.length !== this.settings.variables.length) await this.replaceSettings({ ...this.settings, variables: [...retained, ...added].sort((a, b) => a.name.localeCompare(b.name)) })
  }

  @Remote('restoreOfficialDefaults')
  async restoreOfficialDefaults(): Promise<EnvironmentVariableInfo[]> {
    await this.hydration
    await this.serializeMutation(() => this.synchronizeOfficial(true))
    return this.listVariables()
  }

  private serializeMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutation.then(operation).catch((error: unknown) => {
      if (this.officialStatus.state === 'syncing') this.officialStatus = { state: 'failed', appliedNames: [], failure: 'secure-storage' }
      throw error
    })
    this.mutation = result.then(() => undefined, () => undefined)
    return result
  }

  private async synchronizeOfficial(replace: boolean): Promise<void> {
    this.officialStatus = { state: 'syncing', appliedNames: [] }
    let document
    try {
      document = await fetchOfficialEnvironment(fetch, this.syncAbort.signal)
    } catch (error: unknown) {
      // Signature, network and payload failures cannot change local values.
      this.officialStatus = { state: 'failed', appliedNames: [], failure: 'official-unavailable' }
      if (replace) throw new Error('官方环境配置暂不可用；本地配置未修改。', { cause: error })
      return
    }
    const metadata = await this.readProvenance()
    const names = Object.keys(document.variables)
    const appliedNames: string[] = []
    for (const name of names) {
      if (this.syncAbort.signal.aborted) return
      if (!replace && (metadata.deletedNames?.includes(name) || metadata.variables[name]?.source === 'user'
        || process.env[name]?.trim() || (await this.secrets.get(credentialKey(name)))?.trim())) continue
      await this.secrets.set(credentialKey(name), document.variables[name]!)
      metadata.variables[name] = { source: 'official', version: document.version }
      metadata.deletedNames = (metadata.deletedNames ?? []).filter(deleted => deleted !== name)
      // Persist each committed name so a later storage failure retains its owner.
      await this.writeProvenance(metadata)
      process.env[name] = document.variables[name]
      appliedNames.push(name)
    }
    const current = new Set(this.settings.variables.map(row => row.name))
    const added = appliedNames.filter(name => !current.has(name)).map(name => ({ name }))
    if (added.length) await this.replaceSettings({ ...this.settings, variables: [...this.settings.variables, ...added].sort((a, b) => a.name.localeCompare(b.name)) })
    this.officialStatus = { state: 'synced', version: document.version, appliedNames }
  }

  private async readProvenance(): Promise<Provenance> {
    const value = await this.secrets.get(METADATA_KEY)
    if (value === undefined) return { version: 1, variables: {} }
    try {
      const parsed = schema.object({
        version: schema.literal(1),
        variables: schema.record(schema.string().regex(VARIABLE_NAME), schema.object({ source: schema.enum(['official', 'user']), version: schema.string().optional(), suppressed: schema.boolean().optional() })),
        deletedNames: schema.array(schema.string().regex(VARIABLE_NAME)).optional(),
      }).parse(JSON.parse(value))
      {
        const variables: Record<string, ProvenanceEntry & { suppressed?: boolean }> = { ...parsed.variables }
        const deleted = new Set(parsed.deletedNames ?? [])
        for (const [name, entry] of Object.entries(variables)) {
          if ((entry as ProvenanceEntry & { suppressed?: boolean }).suppressed) { deleted.add(name); delete variables[name] }
        }
        return { version: 1, variables, deletedNames: [...deleted] }
      }
    } catch (error: unknown) { throw new Error('环境变量归属记录无法读取；本地配置已保留。', { cause: error }) }
  }

  private async writeProvenance(metadata: Provenance): Promise<void> {
    await this.secrets.set(METADATA_KEY, JSON.stringify(metadata))
  }

  private async removeRetiredVariables(): Promise<void> {
    if (this.settings.retiredVariablesRemoved) return
    for (const name of RETIRED_VARIABLES) {
      await this.secrets.delete(credentialKey(name))
      delete process.env[name]
    }
    const retired = new Set<string>(RETIRED_VARIABLES)
    const variables = this.settings.variables.filter((row: { name: string }) => !retired.has(row.name))
    await this.replaceSettings({ ...this.settings, variables, retiredVariablesRemoved: true })
  }

  private async replaceSettings(next: EnvironmentSettingsValue): Promise<void> {
    await this.hostCtx.settings.replace(ENVIRONMENT_SETTINGS_NS, next)
    this.settings = next
  }
}

// The Loader entry must own its schema for the official profile ConfigEditor.
// A schema only on a nested service cannot be addressed by its entry ID.
export const Config = EnvironmentSettingsSchema.volatile()
export const inject = ['settings', 'llm', 'tokenMeter', 'credentials', 'sessionProjections', 'agents']
export async function apply(ctx: Context, config: { get(): EnvironmentSettingsValue }): Promise<void> {
  ctx.effect(() => installWindowsShellPath(process.env, process.platform), 'zerowall-environment: Windows Shell PATH')
  await ctx.plugin(ZeroWallEnvironmentService, config.get()).await()
}
