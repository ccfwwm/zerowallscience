import type { Context, Fiber } from '@deepseek-ai/cordis'
import * as McpClient from '@deepseek-ai/dsh-mcp-client'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import type {
  CreateMcpServerInput,
  McpReconnectPolicy,
  McpServerRecord,
  McpTransport,
  UpdateMcpServerInput,
} from '@zerowallscience/research-store/types'
import type {} from 'zod'
import { SecretBrokerClient } from '@zerowallscience/plugin-secrets'
import type { CreateMcpServerRequest, McpRuntimeState, McpServerDto, UpdateMcpServerRequest } from '../shared/types.js'

export type { CreateMcpServerRequest, McpRuntimeState, McpServerDto, UpdateMcpServerChanges, UpdateMcpServerRequest } from '../shared/types.js'

// Credential vault keys are restricted to the ZeroWall domain and lowercase
// POSIX-style segments. Keep the SciMaster key under the MCP namespace.
export const SCIMASTER_API_KEY_CREDENTIAL = 'zerowall.mcp.scimaster_api_key'
export const SCIMASTER_API_KEY_URL = 'https://scimaster.bohrium.com/vibe-write/home'

type RuntimeMcpConfig = {
  serverName: string
  toolCallTimeoutMs: number
  failOnStartupError: boolean
  reconnect: McpReconnectPolicy
} & ({
  transport: 'stdio'
  command: string
  args: string[]
  env: Record<string, string>
  cwd: string
} | {
  transport: 'streamable-http'
  url: string
  headers: Record<string, string>
})

export interface ResolvedMcpConfig {
  config?: RuntimeMcpConfig
  missingEnvironmentVariables: string[]
}

interface RuntimeStatus {
  state: McpRuntimeState
  error: string
  missingEnvironmentVariables: string[]
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    zerowallMcp: ZeroWallMcpService
  }
  interface Events {
    'mcp-client/status'(serverName: string, state: 'starting' | 'active' | 'error', error?: string): void
  }
}

export class ZeroWallMcpService extends TypertRemoteService {
  static inject = ['zerowallProjects', 'tools']

  private readonly fibers = new Map<string, Fiber>()
  private readonly statuses = new Map<string, RuntimeStatus>()
  private readonly reconcileVersions = new Map<string, number>()
  private readonly recordsReady: Promise<void>
  private operation: Promise<void> = Promise.resolve()
  private environmentPoller: NodeJS.Timeout | undefined
  private environmentSignature = ''
  private readonly secrets = new SecretBrokerClient()

  constructor(ctx: Context) {
    super(ctx, 'zerowallMcp')
    this.recordsReady = this.seedBundledServers().then(() => {
      for (const record of this.projects().listMcpServers()) {
        this.statuses.set(record.id, {
          state: record.enabled ? 'starting' : 'disabled',
          error: '',
          missingEnvironmentVariables: [],
        })
      }
    })
    this.operation = this.recordsReady.then(() => this.reconcileAll())
    // dsh-mcp-client publishes lifecycle events on the root context so that
    // the service can observe clients created in nested Cordis fibers.
    const applyStatus = (serverName: string, state: 'starting' | 'active' | 'error', error?: string): void => {
      const record = this.projects().listMcpServers().find(candidate => candidate.serverName === serverName)
      if (record === undefined || !record.enabled) return
      this.statuses.set(record.id, {
        state,
        error: error === undefined ? '' : redactError(error),
        missingEnvironmentVariables: [],
      })
    }
    const disposeRootStatusListener = ctx.root.on('mcp-client/status', applyStatus, { global: true })
    const disposeLocalStatusListener = ctx.on('mcp-client/status', applyStatus, { global: true })
    ctx.effect(() => () => {
      disposeRootStatusListener()
      disposeLocalStatusListener()
    }, 'zerowall-mcp: lifecycle status listener')
    this.startEnvironmentRefresh()
    ctx.effect(() => () => {
      if (this.environmentPoller !== undefined) clearInterval(this.environmentPoller)
      this.environmentPoller = undefined
      void this.disposeAll()
    }, 'zerowall-mcp: dispose dynamic clients')
  }

  @Remote('list')
  async list(): Promise<McpServerDto[]> {
    await this.recordsReady
    void this.pollEnvironment()
    return this.projects().listMcpServers().sort(compareMcpServers).map(record => this.dto(record))
  }

  @Remote('create')
  create(input: CreateMcpServerRequest): Promise<McpServerDto> {
    return this.exclusive(async () => {
      const record = this.projects().createMcpServer(input as CreateMcpServerInput)
      await this.reconcile(record)
      return this.dto(record)
    })
  }

  @Remote('update')
  update(input: UpdateMcpServerRequest): Promise<McpServerDto> {
    return this.exclusive(async () => {
      const record = this.projects().updateMcpServer(input.id, input.changes as UpdateMcpServerInput)
      await this.reconcile(record)
      return this.dto(record)
    })
  }

  @Remote('deleteConnection')
  deleteConnection(id: string): Promise<void> {
    return this.exclusive(async () => {
      await this.disposeOne(id)
      this.projects().deleteMcpServer(id)
      this.statuses.delete(id)
    })
  }

  @Remote('reload')
  reload(id: string): Promise<McpServerDto> {
    return this.exclusive(async () => {
      const record = this.projects().getMcpServer(id)
      if (record === undefined) throw new Error(`MCP server was not found: ${id}`)
      await this.reconcile(record)
      return this.dto(record)
    })
  }

  @Remote('getSciMasterCredentialStatus')
  async getSciMasterCredentialStatus(): Promise<{ configured: boolean }> {
    try {
      const value = await this.secrets.get(SCIMASTER_API_KEY_CREDENTIAL)
      return { configured: typeof value === 'string' && value.trim() !== '' }
    } catch {
      return { configured: false }
    }
  }

  @Remote('setSciMasterApiKey')
  setSciMasterApiKey(apiKey: string): Promise<McpServerDto | undefined> {
    return this.exclusive(async () => {
      const value = apiKey.trim()
      if (value === '') throw new Error('SciMaster API Key 不能为空。')
      await this.secrets.set(SCIMASTER_API_KEY_CREDENTIAL, value)
      const record = this.projects().listMcpServers().find(item => item.serverName === 'zerowall_managed_scimaster')
      if (record === undefined) return undefined
      await this.reconcile(record)
      return this.dto(record)
    })
  }

  @Remote('clearSciMasterApiKey')
  clearSciMasterApiKey(): Promise<McpServerDto | undefined> {
    return this.exclusive(async () => {
      await this.secrets.delete(SCIMASTER_API_KEY_CREDENTIAL)
      const record = this.projects().listMcpServers().find(item => item.serverName === 'zerowall_managed_scimaster')
      if (record === undefined) return undefined
      await this.reconcile(record)
      return this.dto(record)
    })
  }

  private exclusive<T>(task: () => Promise<T> | T): Promise<T> {
    const run = this.operation.then(task, task)
    this.operation = run.then(() => undefined, () => undefined)
    return run
  }

  private async reconcileAll(): Promise<void> {
    await Promise.allSettled(this.projects().listMcpServers().map(record => this.reconcile(record)))
  }

  /**
   * The desktop installer atomically replaces current.json after a health
   * check. The Host runs in a separate process, so it cannot receive the
   * Electron IPC event directly; polling the small state file handles both
   * atomic replacement and temporary rename gaps without a fragile fs.watch
   * subscription.
   */
  private startEnvironmentRefresh(): void {
    if (this.environmentPoller !== undefined || process.env.ZEROWALL_MCP_ENVIRONMENT_ROOT?.trim() === '') return
    this.environmentPoller = setInterval(() => { void this.pollEnvironment() }, 500)
    void this.pollEnvironment()
  }

  private async pollEnvironment(): Promise<void> {
    const record = managedEnvironmentRecord()
    const signature = record === undefined
      ? 'missing'
      : `${record.health ?? 'unknown'}:${record.environmentVersion ?? record.version ?? 'unknown'}:${record.contentRevision ?? ''}:${record.archiveSha256?.slice(0, 12) ?? ''}:${record.root ?? ''}`
    if (signature === this.environmentSignature) return
    this.environmentSignature = signature
    // Never tear down a healthy client because an in-progress download or a
    // transient current.json gap made the new environment unavailable. A
    // later ready/manual signature performs the safe generation swap.
    if (record?.health !== 'ready' || typeof record.root !== 'string' || record.root.trim() === '') return
    await this.exclusive(async () => {
      await this.reconcileAll()
    }).catch((error) => {
      this.ctx.logger.warn(`zerowall-mcp: managed environment refresh failed: ${redactError(error)}`)
    })
  }

  private async seedBundledServers(): Promise<void> {
    if (process.env.ZEROWALL_DISABLE_DEFAULT_MCP === '1') return
    const marker = defaultMcpMarkerPath()
    let markerVersion = 0
    try {
      const parsed = JSON.parse(await readFile(marker, 'utf8')) as { version?: unknown }
      markerVersion = typeof parsed.version === 'number' ? parsed.version : 0
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    const projects = this.projects()
    if (markerVersion < 2) {
      // This was an early product default with a machine-specific path in its
      // arguments. Remove only the known ZeroWall default; user-created MCP
      // records use a different namespace and remain untouched.
      for (const server of projects.listMcpServers()) {
        if (server.serverName === 'zerowall_filesystem') projects.deleteMcpServer(server.id)
      }
    }
    const bundled = projects.listMcpServers()
    const displayNames: Record<string, string> = {
      zerowall_managed_scimaster: 'Sci',
      zerowall_managed_bio_tools: 'Bio Tools',
      zerowall_managed_ketcher: 'Ketcher Chemistry',
    }
    for (const server of bundled) {
      const desired = displayNames[server.serverName]
      if (desired !== undefined && server.name !== desired) projects.updateMcpServer(server.id, { name: desired })
    }
    if (!bundled.some(server => server.serverName === 'zerowall_managed_bio_tools')) {
      projects.createMcpServer({ name: 'Bio Tools', serverName: 'zerowall_managed_bio_tools', transport: 'stdio', enabled: true, command: 'zerowall-managed:bio-tools', cwd: '', failOnStartupError: false })
    }
    if (!bundled.some(server => server.serverName === 'zerowall_managed_ketcher')) {
      projects.createMcpServer({ name: 'Ketcher Chemistry', serverName: 'zerowall_managed_ketcher', transport: 'stdio', enabled: true, command: 'zerowall-managed:ketcher', cwd: '', failOnStartupError: false })
    }
    if (!bundled.some(server => server.serverName === 'zerowall_managed_scimaster')) {
      projects.createMcpServer({ name: 'Sci', serverName: 'zerowall_managed_scimaster', transport: 'stdio', enabled: true, command: 'zerowall-managed:scimaster', cwd: '', failOnStartupError: false })
    }
    await mkdir(dirname(marker), { recursive: true })
    await writeFile(marker, '{"version":3}\n', 'utf8')
  }

  private projects() {
    type ProjectsService = {
      listMcpServers(): McpServerRecord[]
      getMcpServer(id: string): McpServerRecord | undefined
      createMcpServer(input: CreateMcpServerInput): McpServerRecord
      updateMcpServer(id: string, input: UpdateMcpServerInput): McpServerRecord
      deleteMcpServer(id: string): void
    }
    const projects = this.ctx.get('zerowallProjects') as unknown as ProjectsService | undefined
    if (projects === undefined) throw new Error('ZeroWall projects service is not available.')
    return projects
  }

  private async reconcile(record: McpServerRecord): Promise<void> {
    const version = (this.reconcileVersions.get(record.id) ?? 0) + 1
    this.reconcileVersions.set(record.id, version)
    const current = (): boolean => this.reconcileVersions.get(record.id) === version
    if (!record.enabled) {
      await this.disposeOne(record.id)
      if (current()) this.statuses.set(record.id, { state: 'disabled', error: '', missingEnvironmentVariables: [] })
      return
    }
    if (isManagedMcp(record.serverName) && !managedEnvironmentReady()) {
      if (current() && !this.fibers.has(record.id)) this.statuses.set(record.id, { state: 'blocked', error: 'The Claude Science MCP environment is not ready. Retry initialization or select a user-managed environment in Settings.', missingEnvironmentVariables: [] })
      return
    }
    let sciMasterApiKey: string | undefined
    if (record.serverName === 'zerowall_managed_scimaster') {
      try {
        sciMasterApiKey = await this.secrets.get(SCIMASTER_API_KEY_CREDENTIAL)
      } catch {
        sciMasterApiKey = undefined
      }
      if (!sciMasterApiKey?.trim()) {
        await this.disposeOne(record.id)
        if (current()) this.statuses.set(record.id, { state: 'blocked', error: 'SciMaster 需要配置 API Key。请在设置中保存 Key 后重试。', missingEnvironmentVariables: [] })
        return
      }
    }
    const resolved = resolveMcpConfig(record, process.env)
    if (resolved.config === undefined) {
      await this.disposeOne(record.id)
      if (current()) this.statuses.set(record.id, {
        state: 'blocked',
        error: 'Required environment variables are not available to the Host.',
        missingEnvironmentVariables: resolved.missingEnvironmentVariables,
      })
      return
    }
    if (current()) this.statuses.set(record.id, { state: 'starting', error: '', missingEnvironmentVariables: [] })
    try {
      const config = resolved.config as McpClient.Config
      if (sciMasterApiKey !== undefined && config.transport === 'stdio') config.env.ZEROWALL_SCIMASTER_API_KEY = sciMasterApiKey
      const previous = this.fibers.get(record.id)
      const fiber = this.ctx.plugin(McpClient, config)
      await fiber
      if (!current()) {
        await fiber.dispose()
        return
      }
      this.fibers.set(record.id, fiber)
      if (previous !== undefined && previous !== fiber) await previous.dispose()
      // McpClient publishes active only after transport connection and the
      // initial tools/list synchronization succeed. Keep its event-owned state;
      // a Cordis fiber may also resolve while reconnecting when startup errors
      // are configured as non-fatal.
    } catch (error) {
      if (!current()) return
      if (this.fibers.has(record.id)) {
        this.ctx.logger.warn(`zerowall-mcp: retained healthy ${record.serverName} connection after refresh failure: ${redactError(error)}`)
        return
      }
      this.statuses.set(record.id, {
        state: 'error',
        error: redactError(error),
        missingEnvironmentVariables: [],
      })
    }
  }

  private dto(record: McpServerRecord): McpServerDto {
    const status = this.statuses.get(record.id) ?? { state: 'disabled' as const, error: '', missingEnvironmentVariables: [] }
    const tools = this.toolNames(record.serverName)
    return {
      ...record,
      runtimeState: status.state,
      runtimeError: status.error,
      missingEnvironmentVariables: [...status.missingEnvironmentVariables],
      tools,
    }
  }

  private toolNames(serverName: string): string[] {
    const prefix = `mcp__${serverName}__`
    return this.ctx.tools.schemas()
      .map(schema => schema.name)
      .filter(name => name.startsWith(prefix))
      .sort((left, right) => left.localeCompare(right))
  }

  private async disposeOne(id: string): Promise<void> {
    const fiber = this.fibers.get(id)
    if (fiber === undefined) return
    this.fibers.delete(id)
    await fiber.dispose()
  }

  private async disposeAll(): Promise<void> {
    await Promise.allSettled([...this.fibers.keys()].map(id => this.disposeOne(id)))
  }
}

function dshHome(): string { return resolve(process.env.DSH_HOME ?? join(homedir(), '.dsh')) }
function defaultMcpMarkerPath(): string { return join(dshHome(), 'zerowall-mcp-defaults-v1.json') }
export function resolveMcpConfig(record: McpServerRecord, environment: NodeJS.ProcessEnv, hostCwd = process.cwd()): ResolvedMcpConfig {
  const missing = new Set<string>()
  const resolveRefs = (refs: Record<string, string>): Record<string, string> => Object.fromEntries(
    Object.entries(refs).map(([target, source]) => {
      const value = environment[source]
      if (value === undefined || value === '') missing.add(source)
      return [target, value ?? '']
    }),
  )
  const values = resolveRefs(record.transport === 'stdio' ? record.envRefs : record.headerRefs)
  if (missing.size > 0) return { missingEnvironmentVariables: [...missing].sort() }
  const common = {
    serverName: record.serverName,
    toolCallTimeoutMs: record.toolCallTimeoutMs,
    failOnStartupError: record.failOnStartupError,
    reconnect: record.reconnect,
  }
  const launch = record.transport === 'stdio' ? resolveStdioLaunch(record, hostCwd) : undefined
  return {
    missingEnvironmentVariables: [],
    config: record.transport === 'stdio'
      ? { ...common, transport: 'stdio', command: launch!.command, args: launch!.args, env: values, cwd: launch!.cwd }
      : { ...common, transport: 'streamable-http', url: record.url, headers: values },
  }
}

export function resolveStdioLaunch(record: Pick<McpServerRecord, 'command' | 'args' | 'cwd'>, hostCwd = process.cwd()): { command: string; args: string[]; cwd: string } {
  const managed = resolveManagedLaunch(record.command)
  if (managed !== undefined) return managed
  const expandHome = (value: string): string => value === '~'
    ? homedir()
    : value.startsWith('~/') || value.startsWith('~\\') ? join(homedir(), value.slice(2)) : value
  const cwd = resolve(hostCwd, expandHome(record.cwd.trim() || '.'))
  const pathValue = (value: string): string => {
    const expanded = expandHome(value)
    const candidate = resolve(cwd, expanded)
    const explicit = isAbsolute(expanded) || expanded.startsWith('.') || expanded.startsWith('~')
      || (!expanded.startsWith('@') && (expanded.includes('/') || expanded.includes('\\')))
    return explicit || existsSync(candidate) ? candidate : value
  }
  return {
    command: pathValue(record.command),
    args: record.args.map(value => value.startsWith('-') || /^[A-Za-z][A-Za-z\d+.-]*:\/\//u.test(value) ? value : pathValue(value)),
    cwd,
  }
}

function isManagedMcp(serverName: string): boolean { return serverName === 'zerowall_managed_bio_tools' || serverName === 'zerowall_managed_ketcher' || serverName === 'zerowall_managed_scimaster' }

function managedEnvironmentRecord(): { root?: string; health?: string; version?: string; environmentVersion?: string; contentRevision?: number; archiveSha256?: string; mode?: string } | undefined {
  const root = process.env.ZEROWALL_MCP_ENVIRONMENT_ROOT?.trim()
  if (!root) return undefined
  try { return JSON.parse(readFileSync(join(root, 'current.json'), 'utf8')) as { root?: string; health?: string; version?: string; mode?: string } } catch { return undefined }
}

function managedEnvironmentReady(): boolean {
  const record = managedEnvironmentRecord()
  const root = record?.root
  if (!root || record?.health !== 'ready') return false
  return existsSync(join(root, 'bio-tools', 'python', 'python.exe'))
    && existsSync(join(root, 'bio-tools', 'run_server.py'))
    && existsSync(join(root, 'ketcher-chemistry', 'server.js'))
    && existsSync(join(root, 'sci', 'dist', 'mcp.cjs'))
    && existsSync(join(root, 'sci', 'zerowall-mcp-launcher.cjs'))
}

const MANAGED_ORDER: Record<string, number> = {
  zerowall_managed_scimaster: 0,
  zerowall_managed_bio_tools: 1,
  zerowall_managed_ketcher: 2,
}

function compareMcpServers(left: McpServerRecord, right: McpServerRecord): number {
  const leftOrder = MANAGED_ORDER[left.serverName] ?? 100
  const rightOrder = MANAGED_ORDER[right.serverName] ?? 100
  return leftOrder - rightOrder || left.name.localeCompare(right.name)
}

function resolveManagedLaunch(command: string): { command: string; args: string[]; cwd: string } | undefined {
  const root = managedEnvironmentRecord()?.root
  if (!root || !['zerowall-managed:bio-tools', 'zerowall-managed:ketcher', 'zerowall-managed:scimaster'].includes(command)) return undefined
  if (command === 'zerowall-managed:bio-tools') return { command: join(root, 'bio-tools', 'python', 'python.exe'), args: [join(root, 'bio-tools', 'run_server.py'), 'mcp_bio'], cwd: join(root, 'bio-tools') }
  if (command === 'zerowall-managed:ketcher') return { command: process.execPath, args: [join(root, 'ketcher-chemistry', 'server.js')], cwd: join(root, 'ketcher-chemistry') }
  return { command: process.execPath, args: [join(root, 'sci', 'zerowall-mcp-launcher.cjs')], cwd: join(root, 'sci') }
}

export function redactError(error: unknown): string {
  const messages: string[] = []
  let current: unknown = error
  for (let depth = 0; depth < 4 && current !== undefined; depth += 1) {
    messages.push(current instanceof Error ? current.message : String(current))
    current = current instanceof Error ? current.cause : undefined
  }
  return messages.join(': ')
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9+/=_\-.~]+/gi, '$1 [redacted]')
    .replace(/(authorization|api[-_ ]?key|token|secret|password)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1=[redacted]')
    .replace(/https?:\/\/[^\s)\]}]+/gi, redactUrl)
    .slice(0, 1000)
}

function redactUrl(value: string): string {
  try {
    const url = new URL(value)
    url.username = ''
    url.password = ''
    if (url.search !== '') url.search = '?[redacted]'
    url.hash = ''
    return url.toString()
  } catch {
    return '[redacted-url]'
  }
}

export function apply(ctx: Context): void {
  ctx.plugin(ZeroWallMcpService)
}

export default { apply }
