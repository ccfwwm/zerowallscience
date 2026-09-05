import type { Context, Fiber } from '@deepseek-ai/cordis'
import * as McpClient from '@deepseek-ai/dsh-mcp-client'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { lstat, mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { homedir } from 'node:os'
import { ToolCallId, type ContentBlock } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
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
export const HUAGONGSHE_URL = 'https://huagongshe.com/mcp'
export const HUAGONGSHE_CREDENTIAL = 'zerowall.mcp.huagongshe_token'
export const HUAGONGSHE_AUTH_ENV = 'HUAGONGSHE_MCP_AUTHORIZATION'
export const RDATALINUX_R_MCP_LEGACY_URL = 'http://103.217.185.141/r-platform/mcp'
export const RDATALINUX_R_MCP_URL = 'http://103.217.185.141:8099/r-platform/mcp'
export const RDATALINUX_SERVER_NAME = 'rmcp'
export const RDATALINUX_BIOMNI_SERVER_NAME = 'rbioagent'
export const RDATALINUX_R_PLATFORM_SERVER_NAME = 'rplatform'
export const RDATALINUX_RPLOTFIGURE_SERVER_NAME = 'rplotfigure'
export const RDATALINUX_R_MCP_AUTHORIZATION_CREDENTIAL = 'zerowall.mcp.rdatalinux_authorization'
export const RDATALINUX_R_MCP_AUTHORIZATION_ENV = 'R_PLATFORM_MCP_AUTHORIZATION'
const MCP_ENVIRONMENT_POLL_INTERVAL_MS = 30_000
const RDATALINUX_UPLOAD_MAX_BYTES = 100 * 1024 * 1024

/** Resolve the AI Cloud group secret key without accepting arbitrary providers. */
export function aiCloudCredentialKey(provider: string): string | undefined {
  const match = /^zerowall-ai-cloud-([1-9]\d*)(?:-(?:responses|messages|completions))?$/u.exec(provider)
  return match?.[1] === undefined ? undefined : `zerowall.ai-cloud.group.${match[1]}`
}

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
  /** Tools observed after the corresponding Fiber completed its initial sync. */
  private readonly registeredTools = new Map<string, string[]>()
  /** Reconcile version whose initial connection and tools/list have settled. */
  private readonly readyVersions = new Map<string, number>()
  private readonly statuses = new Map<string, RuntimeStatus>()
  private readonly reconcileVersions = new Map<string, number>()
  private readonly recordsReady: Promise<void>
  private operation: Promise<void> = Promise.resolve()
  private environmentPoller: NodeJS.Timeout | undefined
  private environmentSignature = ''
  private environmentRefreshInFlight = false
  private readonly secrets = new SecretBrokerClient()
  private readonly mcpToolIndex = new Map<string, { server: string; name: string; description: string }>()

  constructor(ctx: Context) {
    super(ctx, 'zerowallMcp')
    const service = this
    // Biomni execution runs through the DSH MCP bridge, but its model key is
    // owned by ZeroWall AI Cloud rather than the DSH credential-local store.
    // Expose a narrow Host-only resolver so the bridge can inject the active
    // route key into Biomni execution calls without putting it in session
    // messages, connection records, or tool descriptions.
    ctx.provide('zerowallMcpCredentialResolver', {
      resolve: async (provider: string, _model: string): Promise<string | undefined> => {
        const key = aiCloudCredentialKey(provider)
        if (key === undefined) return undefined
        try { return await service.secrets.get(key) } catch { return undefined }
      },
    } as never)
    ctx.tools.register(defineTool({
      name: 'r_upload_workspace_file',
      description: 'Upload a file from the current ZeroWall session workspace to an rdatalinux R project without putting base64 in the conversation. local_path must be a regular file inside the session workspace; remote_path is relative to the rdatalinux project. Requires confirm=true.',
      parameters: {
        project_id: { type: 'string', required: true },
        local_path: { type: 'string', required: true },
        remote_path: { type: 'string', required: true },
        confirm: { type: 'boolean', required: true },
      },
      output: {
        schema: { type: 'object', additionalProperties: true },
        render: (_args: unknown, value: JsonValue) => [{ type: 'text', text: JSON.stringify(value) }],
      },
      async execute(args: { project_id: string; local_path: string; remote_path: string; confirm: boolean }, exec: any) {
        if (args.confirm !== true) throw new Error('Uploading a workspace file requires confirm=true.')
        const sessionCwd = exec.agent?.session.header.cwd
        if (typeof sessionCwd !== 'string' || sessionCwd.trim() === '') throw new Error('The current session has no workspace directory.')
        const workspace = await realpath(resolve(sessionCwd))
        const requested = String(args.local_path ?? '').trim()
        if (requested === '' || isAbsolute(requested)) throw new Error('local_path must be a relative path inside the current workspace.')
        const source = resolve(workspace, requested)
        const containment = relative(workspace, source)
        if (containment === '..' || containment.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(containment)) throw new Error('local_path escapes the current workspace.')
        const info = await lstat(source)
        if (!info.isFile() || info.isSymbolicLink()) throw new Error('local_path must be a regular, non-symbolic-link file.')
        const resolvedSource = await realpath(source)
        if (resolvedSource !== source) throw new Error('local_path must not resolve through a symbolic link.')
        const size = (await stat(source)).size
        if (size < 1 || size > RDATALINUX_UPLOAD_MAX_BYTES) throw new Error('The local file must be between 1 byte and 100 MiB.')
        const bytes = await readFile(source)
        const sha256 = createHash('sha256').update(bytes).digest('hex')
        const remoteName = 'mcp__rmcp__rplatform__r_upload_file'
        if (service.ctx.tools.get(remoteName) === undefined) throw new Error('rdatalinux R MCP is not active; reload the connection before uploading.')
        const nested = await service.ctx.tools.execute({
          signal: exec.signal,
          callId: ToolCallId(`r-upload-workspace-${Date.now()}`),
          name: remoteName,
          arguments: { project_id: args.project_id, path: args.remote_path, data_base64: bytes.toString('base64'), confirm: true },
          parent: exec.token,
          agent: exec.agent,
        })
        if (nested.isError) {
          const message = nested.content.map((block: ContentBlock) => block.type === 'text' ? block.text : '').filter(Boolean).join('\n')
          throw new Error(message || 'rdatalinux R MCP upload failed.')
        }
        return { projectId: args.project_id, localPath: requested, remotePath: args.remote_path, name: basename(source), bytes: bytes.length, sha256, remote: nested.value as JsonValue }
      },
    }) as any)
    ctx.tools.register(defineTool({
      name: 'mcp_search_tools',
      description: 'Search connected MCP tools by keyword and return compact matches.',
      parameters: { query: { type: 'string', required: true }, server: { type: 'string' }, limit: { type: 'number' } },
      output: { schema: { type: 'object', additionalProperties: true }, render: (_args: unknown, value: JsonValue) => [{ type: 'text', text: JSON.stringify(value) }] },
      async execute(args: { query: string; server?: string; limit?: number }) {
        const terms = args.query.trim().toLowerCase().split(/\s+/u).filter(Boolean)
        const limit = Math.max(1, Math.min(20, Math.floor(args.limit ?? 8)))
        const rows = [...service.mcpToolIndex.values()].map(item => ({ item, score: terms.reduce((n, term) => n + (`${item.server} ${item.name} ${item.description}`.toLowerCase().includes(term) ? 1 : 0), 0) }))
          .filter(row => (args.server === undefined || row.item.server === args.server) && (terms.length === 0 || row.score > 0))
          .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name)).slice(0, limit)
        return { query: args.query, tools: rows.map(row => row.item), total: rows.length }
      },
    }) as any)
    ctx.tools.register(defineTool({
      name: 'mcp_enable_tools',
      description: 'Select MCP tools for the current task and return compact metadata.',
      parameters: { tools: { type: 'array', required: true, items: { type: 'string' } } },
      output: { schema: { type: 'object', additionalProperties: true }, render: (_args: unknown, value: JsonValue) => [{ type: 'text', text: JSON.stringify(value) }] },
      async execute(args: { tools: string[] }) {
        const names = [...new Set(args.tools.map(String).map(value => value.trim()).filter(Boolean))].slice(0, 12)
        return { enabled: names.filter(name => service.mcpToolIndex.has(name)), missing: names.filter(name => !service.mcpToolIndex.has(name)), count: names.filter(name => service.mcpToolIndex.has(name)).length }
      },
    }) as any)
    this.recordsReady = this.seedBundledServers().then(() => {
      for (const record of this.projects().listMcpServers()) {
        this.statuses.set(record.id, {
          state: record.enabled ? 'starting' : 'disabled',
          error: '',
          missingEnvironmentVariables: [],
        })
      }
    }).catch((error: unknown) => {
      // Existing user records can outlive several desktop releases. A failed
      // default migration must remain an MCP-domain error instead of becoming
      // an unhandled startup rejection that terminates the whole Host.
      ctx.logger.warn(`zerowall-mcp: default connection migration failed: ${redactError(error)}`)
    })
    this.operation = this.recordsReady.then(() => this.reconcileAll()).catch((error: unknown) => {
      ctx.logger.warn(`zerowall-mcp: initial connection reconciliation failed: ${redactError(error)}`)
    })
    // dsh-mcp-client publishes lifecycle events on the root context so that
    // the service can observe clients created in nested Cordis fibers.
    const applyStatus = (serverName: string, state: 'starting' | 'active' | 'error', error?: string): void => {
      const record = this.projects().listMcpServers().find(candidate => candidate.serverName === serverName)
      if (record === undefined || !record.enabled) return
      // dsh-mcp-client broadcasts on both the nested Fiber and root context.
      // A delayed reconnect/start event must not regress a connection that
      // has already completed its initial tools/list synchronization.
      if (state === 'starting' && this.fibers.has(record.id) && this.registeredTools.has(record.id)) return
      if (state === 'active') { const names = this.toolNames(record.serverName); this.registeredTools.set(record.id, names); this.indexMcpTools(record.serverName, names) }
      this.statuses.set(record.id, {
        state,
        error: error === undefined ? '' : redactError(error),
        missingEnvironmentVariables: [],
      })
    }
    // The MCP client emits on both paths. Listening at root is sufficient for
    // clients created in nested Fibers and avoids duplicate/late transitions.
    const disposeRootStatusListener = ctx.root.on('mcp-client/status', applyStatus, { global: true })
    ctx.effect(() => () => {
      disposeRootStatusListener()
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
    this.convergeReadyStatuses()
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

  @Remote('getHuagongsheCredentialStatus')
  async getHuagongsheCredentialStatus(): Promise<{ configured: boolean }> {
    try {
      if ((await this.secrets.get(HUAGONGSHE_CREDENTIAL))?.trim()) return { configured: true }
    } catch { /* Existing environment references remain supported. */ }
    const record = this.projects().listMcpServers().find(item => item.serverName === 'huagongshe' && item.url === HUAGONGSHE_URL)
    const reference = record?.headerRefs.Authorization
    return { configured: Boolean(reference && process.env[reference]?.trim()) }
  }

  @Remote('setHuagongsheApiKey')
  setHuagongsheApiKey(token: string): Promise<McpServerDto> {
    return this.exclusive(async () => {
      const value = token.trim().replace(/^Bearer\s+/iu, '')
      if (!value || /\s/u.test(value)) throw new Error('请输入有效的化工社 API Token。')
      const previous = this.projects().listMcpServers().find(item => item.serverName === 'huagongshe')
      if (previous && previous.url !== HUAGONGSHE_URL) throw new Error('化工社连接地址已自定义，请先在 MCP 设置中恢复官方地址。')
      await this.secrets.set(HUAGONGSHE_CREDENTIAL, value)
      const record = previous
        ? this.projects().updateMcpServer(previous.id, { headerRefs: { ...previous.headerRefs, Authorization: HUAGONGSHE_AUTH_ENV } })
        : this.projects().createMcpServer({ name: '化工社 AIchem', serverName: 'huagongshe', transport: 'streamable-http', url: HUAGONGSHE_URL, enabled: true, headerRefs: { Authorization: HUAGONGSHE_AUTH_ENV }, failOnStartupError: false })
      await this.reconcile(record)
      return this.dto(record)
    })
  }

  @Remote('clearHuagongsheApiKey')
  clearHuagongsheApiKey(): Promise<void> {
    return this.exclusive(async () => {
      await this.secrets.delete(HUAGONGSHE_CREDENTIAL)
      const record = this.projects().listMcpServers().find(item => item.serverName === 'huagongshe' && item.url === HUAGONGSHE_URL)
      if (!record) return
      const { Authorization: _removed, ...headerRefs } = record.headerRefs
      await this.reconcile(this.projects().updateMcpServer(record.id, { headerRefs }))
    })
  }

  @Remote('getRdatalinuxCredentialStatus')
  async getRdatalinuxCredentialStatus(): Promise<{ configured: boolean; endpoint: string }> {
    try {
      const value = await this.secrets.get(RDATALINUX_R_MCP_AUTHORIZATION_CREDENTIAL)
      return { configured: typeof value === 'string' && value.trim() !== '', endpoint: RDATALINUX_R_MCP_URL }
    } catch {
      return { configured: Boolean(process.env[RDATALINUX_R_MCP_AUTHORIZATION_ENV]?.trim()), endpoint: RDATALINUX_R_MCP_URL }
    }
  }

  @Remote('setRdatalinuxAuthorization')
  setRdatalinuxAuthorization(value: string): Promise<McpServerDto | undefined> {
    return this.exclusive(async () => {
      const authorization = value.trim()
      if (!/^Bearer\s+\S+$/iu.test(authorization)) throw new Error('rdatalinux R MCP Authorization 必须是 Bearer <key>。')
      await this.secrets.set(RDATALINUX_R_MCP_AUTHORIZATION_CREDENTIAL, authorization)
      const record = this.projects().listMcpServers().find(item => item.serverName === RDATALINUX_SERVER_NAME)
      if (record === undefined) return undefined
      let result: McpServerRecord | undefined
      for (const item of [record]) {
        if (item === undefined) continue
        const next = item.transport === 'streamable-http' && item.headerRefs.Authorization !== RDATALINUX_R_MCP_AUTHORIZATION_ENV
          ? this.projects().updateMcpServer(item.id, { headerRefs: { ...item.headerRefs, Authorization: RDATALINUX_R_MCP_AUTHORIZATION_ENV } })
          : item
        await this.reconcile(next)
        result ??= next
      }
      return result === undefined ? undefined : this.dto(result)
    })
  }

  @Remote('clearRdatalinuxAuthorization')
  clearRdatalinuxAuthorization(): Promise<McpServerDto | undefined> {
    return this.exclusive(async () => {
      await this.secrets.delete(RDATALINUX_R_MCP_AUTHORIZATION_CREDENTIAL)
      const record = this.projects().listMcpServers().find(item => item.serverName === RDATALINUX_SERVER_NAME)
      if (record !== undefined) await this.reconcile(record)
      return record === undefined ? undefined : this.dto(record)
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
    // The initial reconcile already reads current.json. Record that generation
    // as the baseline instead of immediately starting every MCP server twice.
    this.environmentSignature = managedEnvironmentSignature()
    const configuredInterval = Number(process.env.ZEROWALL_MCP_ENVIRONMENT_POLL_MS)
    const interval = Number.isFinite(configuredInterval) && configuredInterval >= 100 ? configuredInterval : MCP_ENVIRONMENT_POLL_INTERVAL_MS
    this.environmentPoller = setInterval(() => { void this.pollEnvironment() }, interval)
  }

  private async pollEnvironment(): Promise<void> {
    if (this.environmentRefreshInFlight) return
    const record = managedEnvironmentRecord()
    const signature = managedEnvironmentSignature(record)
    if (signature === this.environmentSignature) return
    this.environmentSignature = signature
    // Never tear down a healthy client because an in-progress download or a
    // transient current.json gap made the new environment unavailable. A
    // later ready/manual signature performs the safe generation swap.
    if (record?.health !== 'ready' || typeof record.root !== 'string' || record.root.trim() === '') return
    this.environmentRefreshInFlight = true
    try {
      await this.exclusive(async () => {
        await this.reconcileAll()
      })
    } catch (error) {
      this.ctx.logger.warn(`zerowall-mcp: managed environment refresh failed: ${redactError(error)}`)
    } finally {
      this.environmentRefreshInFlight = false
    }
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
    // Migrate legacy rdatalinux namespaces while preserving settings.
    for (const server of projects.listMcpServers()) {
      if (['rdatalinux_biomni', 'rdatalinux_r_platform', 'rbioagent', 'rplatform', 'rplotfigure'].includes(server.serverName)) {
        const existing = projects.listMcpServers().find(candidate => candidate.serverName === RDATALINUX_SERVER_NAME)
        if (existing === undefined) projects.updateMcpServer(server.id, { serverName: RDATALINUX_SERVER_NAME, name: RDATALINUX_SERVER_NAME })
        else if (existing.id !== server.id) projects.deleteMcpServer(server.id)
      }
    }
    if (markerVersion < 2) {
      // This was an early product default with a machine-specific path in its
      // arguments. Remove only the known ZeroWall default; user-created MCP
      // records use a different namespace and remain untouched.
      for (const server of projects.listMcpServers()) {
        if (server.serverName === 'zerowall_filesystem') projects.deleteMcpServer(server.id)
      }
    }
    if (markerVersion < 4) {
      // The R Platform MCP service moved from the default HTTP port to 8099.
      // Migrate only the exact retired endpoint so user-managed MCP URLs are
      // never rewritten as part of bundled-server maintenance.
      for (const server of projects.listMcpServers()) {
        if (server.transport === 'streamable-http' && server.url === RDATALINUX_R_MCP_LEGACY_URL) {
          projects.updateMcpServer(server.id, { url: RDATALINUX_R_MCP_URL })
        }
      }
    }
    for (const server of projects.listMcpServers()) {
      if (server.serverName === RDATALINUX_SERVER_NAME && server.transport === 'streamable-http' && server.headerRefs.Authorization === undefined) {
        projects.updateMcpServer(server.id, { headerRefs: { ...server.headerRefs, Authorization: RDATALINUX_R_MCP_AUTHORIZATION_ENV } })
      }
    }
    if (!projects.listMcpServers().some(server => server.serverName === RDATALINUX_SERVER_NAME)) {
      projects.createMcpServer({
        name: 'rmcp', serverName: RDATALINUX_SERVER_NAME, transport: 'streamable-http',
        enabled: true, url: RDATALINUX_R_MCP_URL,
        headerRefs: { Authorization: RDATALINUX_R_MCP_AUTHORIZATION_ENV },
        failOnStartupError: false,
      })
    }
    const bundled = projects.listMcpServers()
    if (!bundled.some(server => server.serverName === 'huagongshe')) {
      projects.createMcpServer({ name: '化工社 AIchem', serverName: 'huagongshe', transport: 'streamable-http', enabled: true, url: HUAGONGSHE_URL, failOnStartupError: false })
    }
    const displayNames: Record<string, string> = {
      zerowall_managed_scimaster: 'Sci',
      [RDATALINUX_SERVER_NAME]: 'rmcp',
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
    await writeFile(marker, '{"version":5}\n', 'utf8')
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
    this.readyVersions.delete(record.id)
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
    let rdatalinuxAuthorization: string | undefined
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
    if (record.serverName === RDATALINUX_SERVER_NAME) {
      try { rdatalinuxAuthorization = await this.secrets.get(RDATALINUX_R_MCP_AUTHORIZATION_CREDENTIAL) } catch { rdatalinuxAuthorization = undefined }
      if (!rdatalinuxAuthorization?.trim()) rdatalinuxAuthorization = process.env[RDATALINUX_R_MCP_AUTHORIZATION_ENV]
    }
    let huagongsheAuthorization: string | undefined
    if (record.serverName === 'huagongshe' && record.url === HUAGONGSHE_URL) {
      try {
        const token = await this.secrets.get(HUAGONGSHE_CREDENTIAL)
        if (token?.trim()) huagongsheAuthorization = `Bearer ${token.trim()}`
      } catch { /* An unavailable vault is reported by reference resolution. */ }
    }
    const environment = record.serverName === RDATALINUX_SERVER_NAME && rdatalinuxAuthorization?.trim()
      ? { ...process.env, [RDATALINUX_R_MCP_AUTHORIZATION_ENV]: rdatalinuxAuthorization }
      : process.env
    const resolved = resolveMcpConfig(record, huagongsheAuthorization ? { ...environment, [HUAGONGSHE_AUTH_ENV]: huagongsheAuthorization } : environment)
    if (resolved.config === undefined) {
      await this.disposeOne(record.id)
      if (current()) this.statuses.set(record.id, {
        state: 'blocked',
        error: 'Required environment variables are not available to the Host.',
        missingEnvironmentVariables: resolved.missingEnvironmentVariables,
      })
      return
    }
    // A generation swap is prepared beside the existing Fiber. Keep the
    // healthy connection usable and visible until its replacement finishes.
    if (current() && !this.fibers.has(record.id)) this.statuses.set(record.id, { state: 'starting', error: '', missingEnvironmentVariables: [] })
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
      { const names = this.toolNames(record.serverName); this.registeredTools.set(record.id, names); this.indexMcpTools(record.serverName, names) }
      this.readyVersions.set(record.id, version)
      if (previous !== undefined && previous !== fiber) await previous.dispose()
      // The fiber resolves after the initial transport handshake and
      // tools/list synchronization.  The lifecycle event normally arrives on
      // the same turn, but it can cross a nested Fiber boundary before this
      // service's listener is attached.  Converge the authoritative Host state
      // here as well so callers never remain stuck at `starting` when tools are
      // already registered.  Later lifecycle events still win and can report
      // reconnect/error transitions.
      if (current()) {
        this.statuses.set(record.id, { state: 'active', error: '', missingEnvironmentVariables: [] })
      }
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

  private async startResolved(record: McpServerRecord, resolvedConfig: RuntimeMcpConfig, version: number, current: () => boolean, sciMasterApiKey?: string): Promise<void> {
    if (current() && !this.fibers.has(record.id)) this.statuses.set(record.id, { state: 'starting', error: '', missingEnvironmentVariables: [] })
    try {
      const config = resolvedConfig as McpClient.Config
      if (sciMasterApiKey !== undefined && config.transport === 'stdio') config.env.ZEROWALL_SCIMASTER_API_KEY = sciMasterApiKey
      const previous = this.fibers.get(record.id)
      const fiber = this.ctx.plugin(McpClient, config)
      await fiber
      if (!current()) { await fiber.dispose(); return }
      { const names = this.toolNames(record.serverName); this.fibers.set(record.id, fiber); this.registeredTools.set(record.id, names); this.indexMcpTools(record.serverName, names); this.readyVersions.set(record.id, version) }
      if (previous !== undefined && previous !== fiber) await previous.dispose()
      this.statuses.set(record.id, { state: 'active', error: '', missingEnvironmentVariables: [] })
    } catch (error) {
      if (!current()) return
      if (this.fibers.has(record.id)) { this.ctx.logger.warn(`zerowall-mcp: retained healthy ${record.serverName} connection after refresh failure: ${redactError(error)}`); return }
      this.statuses.set(record.id, { state: 'error', error: redactError(error), missingEnvironmentVariables: [] })
    }
  }

  private dto(record: McpServerRecord): McpServerDto {
    const status = this.statuses.get(record.id) ?? { state: 'disabled' as const, error: '', missingEnvironmentVariables: [] }
    // Prefer the snapshot captured for this connection generation. Reading the
    // global registry during a concurrent refresh can otherwise expose a
    // different server's tools in this DTO.
    const tools = [...(this.registeredTools.get(record.id) ?? this.toolNames(record.serverName))]
    const runtimeState = status.state === 'starting' && this.fibers.has(record.id) && this.registeredTools.has(record.id)
      ? 'active'
      : status.state
    return {
      ...record,
      runtimeState,
      runtimeError: runtimeState === 'active' ? '' : status.error,
      missingEnvironmentVariables: [...status.missingEnvironmentVariables],
      tools,
    }
  }

  /**
   * Lifecycle events are deliberately best-effort notifications and can cross
   * Cordis Fiber boundaries. The reconcile operation is authoritative: once
   * its Fiber resolved, the MCP handshake and tools/list synchronization have
   * completed. Re-assert that state before projecting a DTO so a late
   * `starting` event cannot leave the settings UI stuck forever.
   */
  private convergeReadyStatuses(): void {
    for (const record of this.projects().listMcpServers()) {
      const version = this.readyVersions.get(record.id)
      if (!record.enabled || version === undefined || this.reconcileVersions.get(record.id) !== version || !this.fibers.has(record.id)) continue
      const status = this.statuses.get(record.id)
      if (status?.state === 'starting' || status?.state === undefined) {
        this.statuses.set(record.id, { state: 'active', error: '', missingEnvironmentVariables: [] })
      }
    }
  }

  private indexMcpTools(serverName: string, names: string[]): void {
    for (const name of names) this.mcpToolIndex.set(name, { server: serverName, name, description: name.replace(/^mcp__[^_]+__/u, '').replaceAll('_', ' ') })
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
    this.registeredTools.delete(id)
    this.readyVersions.delete(id)
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

function managedEnvironmentSignature(record = managedEnvironmentRecord()): string {
  return record === undefined
    ? 'missing'
    : `${record.health ?? 'unknown'}:${record.environmentVersion ?? record.version ?? 'unknown'}:${record.contentRevision ?? ''}:${record.archiveSha256?.slice(0, 12) ?? ''}:${record.root ?? ''}`
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
