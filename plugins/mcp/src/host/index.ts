import { configuredPythonRuntimeRoot } from '../../../python/src/shared/runtime-path.js'
import { ManagedGenerations } from './managed-generations.js'
import { normalizeJsonArguments, registerResearchWorkflow } from './research-workflow.js'
import { McpConfigurationStoreService } from './configuration-store.js'
import { isBuiltInMcpConnection } from '../shared/connections.js'
import { callToolUniverse, resolveToolUniverseCredentials } from './tooluniverse-transport.js'
import type { Context, Fiber } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-system-prompt'
import * as McpClient from '@deepseek-ai/dsh-mcp-client'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, renameSync, rmSync, statSync, mkdirSync, writeFileSync } from 'node:fs'
import { lstat, link, mkdir, open, readFile, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { homedir } from 'node:os'
import { rootCertificates } from 'node:tls'
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
import type { CreateMcpServerRequest, McpRuntimeState, McpSchemaObject, McpSchemaValue, McpServerDto, McpToolDetail, UpdateMcpServerRequest } from '../shared/types.js'

export type { CreateMcpServerRequest, McpRuntimeState, McpServerDto, McpToolDetail, UpdateMcpServerChanges, UpdateMcpServerRequest } from '../shared/types.js'

// Credential vault keys are restricted to the ZeroWall domain and lowercase
// POSIX-style segments. Keep the SciMaster key under the MCP namespace.
export const SCIMASTER_API_KEY_CREDENTIAL = 'zerowall.mcp.scimaster_api_key'
export const SCIMASTER_API_KEY_URL = 'https://scimaster.bohrium.com/vibe-write/home'
export const HUAGONGSHE_URL = 'https://huagongshe.com/mcp'
export const HUAGONGSHE_CREDENTIAL = 'zerowall.mcp.huagongshe_token'
export const HUAGONGSHE_AUTH_ENV = 'HUAGONGSHE_MCP_AUTHORIZATION'
export const GPSADB_MCP_URL = 'https://gpsadb.gzdlab.com/mcp'
export const GPSADB_SERVER_NAME = 'gpsadb'
/**
 * GPSAdb's MCP annotations are not carried through the DSH bridge into Host.
 * Keep its public integration read-only with a fail-closed tool allowlist.
 */
const GPSADB_READ_ONLY_TOOLS = new Set([
  'get_database_info',
  'search_datasets',
  'get_dataset',
  'get_download_links',
  'get_differential_expression',
  'get_gsea_results',
  'query_gene',
  'query_gene_set',
  'search_gene_sets',
  'run_biotrigger',
  'run_fastgpsa',
  'test_gene_set_in_dataset',
])
export const RDATALINUX_R_MCP_URL = 'https://rmcp.chengxunkeji.cn/r-platform/mcp'
export const RDATALINUX_SERVER_NAME = 'rmcp'
export const RDATALINUX_BIOMNI_SERVER_NAME = 'rbioagent'
export const RDATALINUX_R_PLATFORM_SERVER_NAME = 'rplatform'
export const RDATALINUX_RPLOTFIGURE_SERVER_NAME = 'rplotfigure'
export const RDATALINUX_R_MCP_AUTHORIZATION_CREDENTIAL = 'zerowall.mcp.rdatalinux_authorization'
export const RDATALINUX_R_MCP_AUTHORIZATION_ENV = 'R_PLATFORM_MCP_AUTHORIZATION'
const ENVIRONMENT_SECRET_PREFIX = 'zerowall.environment.var.'
export async function hasEnvironmentCredential(name: string, getCredential: (key: string) => Promise<string | undefined>, environment: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  let value: string | undefined
  try { value = await getCredential(`${ENVIRONMENT_SECRET_PREFIX}${name.toLowerCase()}`) } catch { value = undefined }
  return Boolean(value?.trim() || environment[name]?.trim())
}
// A prepared update waits for Host readiness. Poll the compact transaction and
// pointer frequently; manifest contents remain cached by the file signature.
const MCP_ENVIRONMENT_POLL_INTERVAL_MS = 1000
const MCP_FAILURE_COOLDOWN_MS = 5 * 60_000
const RETIRED_R_PROJECT_TOOL = 'mcp__rmcp__r_project'
const RDATALINUX_UPLOAD_MAX_BYTES = 100 * 1024 * 1024
const FIGUREYA_MODULE_MAX_BYTES = 250 * 1024 * 1024
const HOST_FILE_CAPABILITIES: JsonValue[] = [
  {
    id: 'host.r_files.download_workspace',
    public_tool: 'r_files',
    category: 'workspace_transfer',
    summary: '下载 RMCP 项目产物、Biomni 任务产物或服务器 FigureYa 源文件到当前本地工作区；按 Manifest 和 SHA-256 校验，local_path 可省略并默认保存到 downloads/<文件名>。',
    input_schema: {
      type: 'object',
      properties: {
        action: { const: 'download_workspace' },
        source: { type: 'string', enum: ['project', 'biomni', 'figureya_source'], default: 'project' },
        project_id: { type: 'string', description: '项目产物来源需要' },
        job_id: { type: 'string', description: 'Biomni 任务产物来源需要' },
        module_id: { type: 'string', description: '可用 source=figureya_source 指定服务器 FigureYa 模块' },
        source_path: { type: 'string' },
        remote_path: { type: 'string', description: 'Manifest 中的远程相对路径' },
        local_path: { type: 'string', description: '当前工作区内的相对路径；省略时写入 downloads/<文件名>' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    effects: 'local_workspace_write',
    query_allowed: false,
    execution: 'local_host',
    confirmation_fields: [],
    requires_confirmation: false,
    availability: 'host_registered',
    verification: 'registered',
    output: '本地路径、文件大小、来源路径及 SHA-256；不返回 base64 文件内容。',
  },
  {
    id: 'host.r_download_workspace',
    public_tool: 'r_download_workspace',
    category: 'workspace_transfer',
    summary: '将 RMCP 项目、Biomni 任务或服务器 FigureYa 源文件直接下载到当前本地工作区。按来源提供 remote_path 与 project_id、job_id 或 module_id/source_path；省略 local_path 时保存至 downloads/<文件名>。',
    input_schema: {
      type: 'object',
      properties: {
        source: { type: 'string', enum: ['project', 'biomni', 'figureya_source'], default: 'project' },
        project_id: { type: 'string', description: '项目产物来源需要' },
        job_id: { type: 'string', description: 'Biomni 任务产物来源需要' },
        module_id: { type: 'string', description: 'FigureYa 源文件来源需要' },
        source_path: { type: 'string', description: 'FigureYa 模块内的相对路径' },
        remote_path: { type: 'string', description: 'Manifest 中的远程相对路径' },
        local_path: { type: 'string', description: '当前工作区内的相对路径；省略时写入 downloads/<文件名>' },
      },
      additionalProperties: false,
    },
    effects: 'local_workspace_write',
    query_allowed: false,
    execution: 'local_host',
    confirmation_fields: [],
    requires_confirmation: false,
    availability: 'host_registered',
    verification: 'registered',
    output: '本地路径、文件大小、来源路径及 SHA-256；不返回 base64 文件内容。',
  },
  {
    id: 'host.r_files.upload_workspace',
    public_tool: 'r_files',
    category: 'workspace_transfer',
    summary: '将当前本地工作区文件上传到 RMCP 项目；需要 confirm=true。',
    effects: 'remote_write',
    query_allowed: false,
    execution: 'local_host',
    confirmation_fields: ['confirm'],
    requires_confirmation: true,
    availability: 'host_registered',
    verification: 'registered',
    output: '上传字节数、远程路径、transfer id（大文件）及 SHA-256。',
  },
]

function figureyaSourceRequest(moduleId: unknown, sourcePath: unknown, remotePath: unknown): { moduleId: string; path: string } | undefined {
  if (typeof moduleId === 'string' && moduleId.trim() !== '') {
    const path = typeof sourcePath === 'string' && sourcePath.trim() !== '' ? sourcePath.trim() : typeof remotePath === 'string' ? remotePath.trim() : ''
    return { moduleId: moduleId.trim(), path }
  }
  if (typeof remotePath !== 'string') return undefined
  const normalized = remotePath.trim().replaceAll('\\', '/')
  const absolute = /^\/opt\/rdatalinux-figureya\/current\/([^/]+)\/(.+)$/u.exec(normalized)
  const relative = /^(FigureYa[^/]+)\/(.+)$/u.exec(normalized)
  const match = absolute ?? relative
  if (match?.[1] === undefined || match[2] === undefined) return undefined
  return { moduleId: match[1], path: `${match[1]}/${match[2]}` }
}

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
  enabledTools?: string[]
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
  toolDiscoveryState?: 'unknown' | 'pending' | 'complete' | 'failed'
  toolDiscoveryStartedAt?: string
  toolDiscoveryCompletedAt?: string
  lastSuccessfulToolCount?: number
  lastDiscoveryError?: string
}

/**
 * Resolve a model provider's API key without exposing it to the model or
 * persisting it in an MCP request. Environment credentials are stored by the
 * environment plugin under lowercase names, while hydrate() also mirrors
 * them into process.env for providers that use native discovery.
 */
export function providerCredentialNames(provider: string): string[] {
  const normalized = provider.trim().toLowerCase()
  const names: string[] = []
  const add = (name: string): void => { if (!names.includes(name)) names.push(name) }
  if (/deepseek/u.test(normalized)) add('DEEPSEEK_API_KEY')
  if (/openai|gpt/u.test(normalized)) add('OPENAI_API_KEY')
  if (/anthropic|claude/u.test(normalized)) add('ANTHROPIC_API_KEY')
  if (/google|gemini|vertex/u.test(normalized)) add('GOOGLE_API_KEY')
  if (/moonshot|kimi/u.test(normalized)) { add('MOONSHOT_API_KEY'); add('KIMI_API_KEY') }
  if (/qwen|aliyun|dashscope/u.test(normalized)) add('DASHSCOPE_API_KEY')
  if (/zhipu|glm/u.test(normalized)) add('ZHIPUAI_API_KEY')
  if (/minimax/u.test(normalized)) add('MINIMAX_API_KEY')
  const stem = normalized.replace(/[^a-z0-9]+/gu, '_').replace(/^_+|_+$/gu, '').toUpperCase()
  if (stem) add(`${stem}_API_KEY`)
  add('LLM_API_KEY')
  return names
}

export interface CompactCapabilityRecord {
  id: string
  publicTool: string
  summary: string
  inputSchema?: JsonValue
  backend: 'rmcp' | 'bio'
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
  static inject = ['zerowallMcpConfigurationStore', 'tools']

  private managed!: ManagedGenerations
  private readonly connecting = new Map<string, Promise<void>>()
  private disposed = false
  private backgroundStarted = false
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
  private environmentFileSignature = ''
  private environmentSignature = ''
  private environmentRefreshInFlight = false
  private readonly secrets = new SecretBrokerClient()
  private readonly mcpToolIndex = new Map<string, { server: string; name: string; description: string }>()
  private readonly selectedTools = new WeakMap<object, Set<string>>()
  private toolCacheWrite: Promise<void> = Promise.resolve()
  private readonly failureCooldownUntil = new Map<string, number>()

  constructor(ctx: Context) {
    super(ctx, 'zerowallMcp')
    this.managed = new ManagedGenerations(ctx, () => managedEnvironmentRecord()?.root)
    registerResearchWorkflow(ctx, this)
    ctx.effect(() => ctx.tools.guard(exec => {
      if (exec.name === RETIRED_R_PROJECT_TOOL) return 'Remote R project administration is disabled; use an existing project ID where a backend operation requires one.'
      const prefix = `mcp__${GPSADB_SERVER_NAME}__`
      if (!exec.name.startsWith(prefix)) return undefined
      const remoteToolName = exec.name.slice(prefix.length)
      return GPSADB_READ_ONLY_TOOLS.has(remoteToolName)
        ? undefined
        : `GPSAdb tool is not on the approved read-only allowlist: ${remoteToolName || '(empty name)'}`
    }), 'zerowall-mcp: GPSAdb read-only tool allowlist')
    const service = this
    // Biomni execution runs through the DSH MCP bridge, but its model key is
    // owned by ZeroWall AI Cloud rather than the DSH credential-local store.
    // Expose a narrow Host-only resolver so the bridge can inject the active
    // route key into Biomni execution calls without putting it in session
    // messages, connection records, or tool descriptions.
    ctx.provide('zerowallMcpRuntimeEnvironment', {
      resolve: async (server: string): Promise<Record<string, string>> => {
        if (server !== 'rmcp') return {}
        const record = service.projects().listMcpServers().find(item => item.serverName === server)
        const output: Record<string, string> = {}
        for (const [name, ref] of Object.entries(record?.envRefs ?? {})) {
          if (!/^[A-Z][A-Z0-9_]{0,99}$/u.test(name) || /^(?:BIOMNI_|OMICVERSE_|TOOLUNIVERSE_|R_PLATFORM_|LD_|PYTHON|ZERO|XDG_|LC_)/u.test(name)
            || ['PATH', 'HOME', 'TMPDIR', 'TMP', 'TEMP', 'BASH_ENV', 'ENV', 'SHELLOPTS', 'NODE_OPTIONS', 'LLM_SOURCE'].includes(name)) throw new Error(`INVALID_RUNTIME_ENV: ${name}`)
          const key = `${ENVIRONMENT_SECRET_PREFIX}${ref.toLowerCase()}`
          const value = await service.secrets.get(key) ?? process.env[ref]
          if (typeof value !== 'string' || !value.trim()) throw new Error(`MISSING_RUNTIME_ENV: ${name}`)
          output[name] = value
        }
        return output
      },
    } as never)
    ctx.provide('zerowallMcpCredentialResolver', {
      resolve: async (provider: string, _model: string): Promise<string | undefined> => {
        // Managed ZeroWall AI Cloud routes keep their key in the account
        // broker. Delegate first so a missing restored group key can trigger
        // the account service's single-flight catalog refresh before falling
        // back to generic provider credentials.
        try {
          const aiCloud = service.ctx.get('zerowallAiCloudCredentialResolver') as { resolve?: (provider: string, model: string) => Promise<string | undefined> } | undefined
          if (typeof aiCloud?.resolve === 'function') {
            const value = await aiCloud.resolve(provider, _model)
            if (typeof value === 'string' && value.trim().length > 0) return value.trim()
          }
        } catch {
          // Continue with ambient/DSH/broker credentials below.
        }
        const managedKey = aiCloudCredentialKey(provider)
        const candidates = managedKey === undefined
          ? providerCredentialNames(provider).map(name => `${ENVIRONMENT_SECRET_PREFIX}${name.toLowerCase()}`)
          : [managedKey, ...providerCredentialNames(provider).map(name => `${ENVIRONMENT_SECRET_PREFIX}${name.toLowerCase()}`)]
        for (const name of providerCredentialNames(provider)) {
          const ambient = process.env[name]?.trim()
          if (ambient) return ambient
        }
        // Official DSH providers keep their apiKeyEnv value in the harness
        // credential service rather than ZeroWall's environment namespace.
        // Resolve that service first when this plugin runs inside the DSH Host.
        const dshCredentials = service.ctx.get('credentials') as { resolve?: (ref: string) => Promise<{ value?: string } | undefined> } | undefined
        if (typeof dshCredentials?.resolve === 'function') {
          for (const name of providerCredentialNames(provider)) {
            try {
              const resolved = await dshCredentials.resolve(name)
              if (typeof resolved?.value === 'string' && resolved.value.trim()) return resolved.value.trim()
            } catch { /* continue with the ZeroWall broker */ }
          }
        }
        for (const key of candidates) {
          try {
            const value = await service.secrets.get(key)
            if (typeof value === 'string' && value.trim()) return value.trim()
          } catch { /* try the next provider-specific credential */ }
        }
        return undefined
      },
    } as never)
    ctx.effect(() => ctx.tools.register(defineTool({
      name: 'mcp_connect',
      description: 'List configured MCP connection states without connecting, or pass one enabled server name to connect it on demand and discover its tools. Connections do not start automatically.',
      parameters: { server: { type: 'string' } },
      output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
      async execute(args, exec) {
        await service.recordsReady
        if (args.server === undefined || args.server.trim() === '') {
          return { connections: (await service.list()).map(item => ({ server: item.serverName, name: item.name, enabled: item.enabled, state: item.runtimeState, toolCount: item.tools.length, ...(item.runtimeError ? { error: item.runtimeError } : {}) })) }
        }
        await service.ensureConnected(args.server)
        if (exec.agent && typeof exec.agent === 'object') {
          const selected = service.selectedTools.get(exec.agent) ?? new Set<string>()
          selected.add(args.server)
          service.selectedTools.set(exec.agent, selected)
        }
        const record = (await service.list()).find(item => item.serverName === args.server)
        if (record === undefined) throw new Error(`MCP server disappeared during connection: ${args.server}`)
        return { server: args.server, state: record.runtimeState, tools: record.tools.slice(0, 40), toolCount: record.tools.length }
      },
    })), 'zerowall-mcp: demand connection tool')
    ctx.effect(() => ctx.tools.register(defineTool({
      name: 'mcp_search',
      description: 'Find configured MCP servers and already discovered tools by capability. This search is local and does not start a connection; call mcp_connect with a returned server name to load its live tool schemas.',
      parameters: { query: { type: 'string', required: true } },
      output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
      async execute(args) {
        const query = args.query.trim().toLocaleLowerCase()
        const servers = (await service.list()).filter(item => item.enabled)
        const matches = servers.map(item => ({ server: item.serverName, name: item.name, state: item.runtimeState,
          tools: [...service.mcpToolIndex.values()].filter(tool => tool.server === item.serverName && (!query || `${tool.name} ${tool.description}`.toLocaleLowerCase().includes(query)))
            .slice(0, 5).map(tool => ({ name: tool.name, description: tool.description.slice(0, 180) })),
        })).filter(item => !query || item.server.toLocaleLowerCase().includes(query) || item.name.toLocaleLowerCase().includes(query) || item.tools.length > 0)
          .sort((left, right) => right.tools.length - left.tools.length || left.name.localeCompare(right.name))
          .slice(0, 5)
        return { matches, connectTool: 'mcp_connect' }
      },
    })), 'zerowall-mcp: local capability search')
    ctx.tools.register(defineTool({
      name: 'r_files',
      description: 'Access rdatalinux files through the compact file facade. action=catalog includes remote file operations and local Host transfers. download_workspace saves project artifacts into the current local workspace; pass an existing remote project_id for project files or a job_id for Biomni artifacts. FigureYa source files accept module_id plus source_path without a project. Transfers verify size and SHA-256, use bounded chunks and never return base64 file contents to the conversation. local_path defaults to downloads/<filename>. upload_workspace requires confirm=true and an existing remote project_id; the Host never creates or registers remote projects.',
      parameters: {
        action: { type: 'string', required: true },
        arguments: { type: 'json' },
        source: { type: 'string' },
        project_id: { type: 'string' },
        job_id: { type: 'string' },
        module_id: { type: 'string' },
        source_path: { type: 'string' },
        local_path: { type: 'string' },
        remote_path: { type: 'string' },
        confirm: { type: 'boolean' },
      },
      output: {
        schema: { type: 'object', additionalProperties: true },
        render: (_args: unknown, value: JsonValue) => [{ type: 'text', text: JSON.stringify(value) }],
      },
      isConcurrencySafe(args: unknown) {
        if (args === null || typeof args !== 'object' || Array.isArray(args)) return false
        const action = (args as { action?: unknown }).action
        return typeof action === 'string' && /(?:^catalog$|list|read|manifest|resolve|inspect|status)/iu.test(action)
      },
      async execute(args: { action: string; arguments?: JsonValue; source?: string; project_id?: string; job_id?: string; module_id?: string; source_path?: string; local_path?: string; remote_path?: string; confirm?: boolean }, exec: any) {
        const remoteName = 'mcp__rmcp__r_files'
        const nestedValues = args.arguments !== null && typeof args.arguments === 'object' && !Array.isArray(args.arguments) ? args.arguments : {}
        const values = { ...args, ...nestedValues } as typeof args
        if (args.action === 'catalog') {
          try { await service.ensureConnected(RDATALINUX_SERVER_NAME) }
          catch (error) {
            return { domain: 'r_files', remote_available: false, remote_error: error instanceof Error ? error.message : String(error), capabilities: HOST_FILE_CAPABILITIES, host_capabilities: HOST_FILE_CAPABILITIES }
          }
          if (service.ctx.tools.get(remoteName) === undefined) {
            return { domain: 'r_files', host_capabilities: HOST_FILE_CAPABILITIES, capabilities: HOST_FILE_CAPABILITIES }
          }
          const nested = await service.ctx.tools.execute({
            signal: exec.signal,
            callId: ToolCallId(`r-files-catalog-${Date.now()}`),
            name: remoteName,
            arguments: { action: 'catalog', arguments: nestedValues },
            parent: exec.token,
            agent: exec.agent,
          })
          const remoteCatalog = service.compactPayload(nested, remoteName)
          const remoteCapabilities = Array.isArray(remoteCatalog.capabilities) ? remoteCatalog.capabilities : []
          return { ...remoteCatalog, capabilities: [...remoteCapabilities, ...HOST_FILE_CAPABILITIES], host_capabilities: HOST_FILE_CAPABILITIES }
        }
        await service.ensureConnected(RDATALINUX_SERVER_NAME)
        if (args.action !== 'upload_workspace' && args.action !== 'download_workspace' && args.action !== 'download_figureya_module') {
          if (service.ctx.tools.get(remoteName) === undefined) throw new Error('rdatalinux R MCP is not active; reload the connection before accessing project files.')
          const nested = await service.ctx.tools.execute({
            signal: exec.signal,
            callId: ToolCallId(`r-files-${Date.now()}`),
            name: remoteName,
            arguments: { action: args.action, arguments: nestedValues },
            parent: exec.token,
            agent: exec.agent,
          })
          if (nested.isError) {
            const message = nested.content.map((block: ContentBlock) => block.type === 'text' ? block.text : '').filter(Boolean).join('\n')
            throw new Error(message || 'rdatalinux R MCP file operation failed.')
          }
          return nested.value as Record<string, JsonValue>
        }
        if (args.action === 'upload_workspace' && values.confirm !== true) throw new Error('Uploading a workspace file requires confirm=true.')
        const figureyaRequest = args.action === 'download_workspace' ? figureyaSourceRequest(values.module_id, values.source_path, values.remote_path) : undefined
        const downloadSource = values.source ?? (figureyaRequest === undefined ? 'project' : 'figureya_source')
        if ((args.action === 'upload_workspace' && (typeof values.local_path !== 'string' || typeof values.project_id !== 'string' || typeof values.remote_path !== 'string'))
          || (args.action === 'download_workspace' && downloadSource === 'project' && (typeof values.remote_path !== 'string' || values.remote_path.trim() === '' || typeof values.project_id !== 'string'))
          || (args.action === 'download_workspace' && downloadSource === 'biomni' && (typeof values.remote_path !== 'string' || values.remote_path.trim() === '' || typeof values.job_id !== 'string'))
          || (args.action === 'download_workspace' && downloadSource === 'figureya_source' && (figureyaRequest === undefined || figureyaRequest.path.trim() === ''))
          || (args.action === 'download_workspace' && !['project', 'biomni', 'figureya_source'].includes(downloadSource))) {
          throw new Error(`Invalid ${args.action} request. Provide a source path, use source=project with project_id, source=biomni with job_id, or source=figureya_source with module_id/source_path; local_path is optional for downloads.`)
        }
        const sessionCwd = exec.agent?.session.header.cwd
        if (typeof sessionCwd !== 'string' || sessionCwd.trim() === '') throw new Error('The current session has no workspace directory.')
        const workspace = await realpath(resolve(sessionCwd))
        const remotePath = downloadSource === 'figureya_source' ? figureyaRequest?.path : values.remote_path
        const defaultName = typeof remotePath === 'string' ? basename(remotePath.replaceAll('\\', '/')) : ''
        if (args.action === 'download_workspace' && (defaultName === '' || defaultName === '.' || defaultName === '..')) {
          throw new Error('The remote file path must end with a file name.')
        }
        const requested = String(values.local_path ?? (args.action === 'download_workspace' ? `downloads/${defaultName}` : '')).trim()
        if (requested === '' || isAbsolute(requested)) throw new Error('local_path must be a relative path inside the current workspace.')
        const source = resolve(workspace, requested)
        const containment = relative(workspace, source)
        if (containment === '' || containment === '..' || containment.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(containment)) throw new Error('local_path must name a file inside the current workspace.')
        if (args.action === 'download_figureya_module') {
          if (typeof values.module_id !== 'string' || values.module_id.trim() === '') throw new Error('module_id is required for download_figureya_module.')
          const moduleId = values.module_id.trim()
          const targetRoot = source
          const isOutsideWorkspace = (candidate: string): boolean => {
            const candidateRelative = relative(workspace, candidate)
            return candidateRelative === '..' || candidateRelative.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(candidateRelative)
          }
          const ensureWorkspaceDirectory = async (directory: string): Promise<void> => {
            if (isOutsideWorkspace(directory)) throw new Error('FigureYa artifact path resolves outside the current workspace.')
            const components = relative(workspace, directory).split(/[\\/]/u).filter(Boolean)
            let current = workspace
            for (const component of components) {
              current = join(current, component)
              try {
                const info = await lstat(current)
                if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('FigureYa artifact directories must not be symbolic links.')
              } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
                await mkdir(current)
              }
              const resolvedDirectory = await realpath(current)
              if (isOutsideWorkspace(resolvedDirectory)) throw new Error('FigureYa artifact path resolves outside the current workspace.')
            }
          }
          await ensureWorkspaceDirectory(targetRoot)
          const catalogTool = 'mcp__rmcp__r_figureya_catalog'
          if (service.ctx.tools.get(catalogTool) === undefined) throw new Error('rdatalinux FigureYa catalog tool is not active; reload the connection before downloading a module.')
          const callCatalog = async (action: string, actionArguments: Record<string, JsonValue>): Promise<Record<string, JsonValue>> => {
            const result = await service.ctx.tools.execute({ signal: exec.signal, callId: ToolCallId(`figureya-module-${Date.now()}-${Math.random().toString(16).slice(2)}`), name: catalogTool, arguments: { action, arguments: actionArguments }, parent: exec.token, agent: exec.agent })
            return service.compactPayload(result, `FigureYa ${action}`)
          }
          const listing = await callCatalog('figureya.list.files', { module_id: moduleId })
          const rawEntries: JsonValue[] = []
          const collectEntries = (value: JsonValue): void => {
            if (Array.isArray(value)) { for (const item of value) collectEntries(item); return }
            if (value === null || typeof value !== 'object') return
            const object = value as Record<string, JsonValue>
            if (typeof object.path === 'string' || typeof object.remote_path === 'string' || typeof object.relative_path === 'string' || typeof object.name === 'string') { rawEntries.push(object); return }
            for (const key of ['files', 'artifacts', 'list_files', 'manifest']) collectEntries(object[key] ?? null)
          }
          collectEntries(listing.files ?? listing)
          if (rawEntries.length === 0) throw new Error(`FigureYa module ${moduleId} contains no downloadable files.`)
          const seen = new Set<string>()
          const files: Array<{ path: string; localPath: string; mimeType?: string; bytes: number; sha256: string }> = []
          let totalBytes = 0
          for (const raw of rawEntries) {
            if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) continue
            const item = raw as Record<string, JsonValue>
            const remotePath = [item.path, item.remote_path, item.relative_path, item.name].find(value => typeof value === 'string' && value.trim() !== '')
            if (typeof remotePath !== 'string') continue
            const normalizedPath = remotePath.trim().replaceAll('\\', '/').replace(/^\/+/u, '')
            if (normalizedPath === '' || normalizedPath.split('/').some(part => part === '..' || part === '.')) throw new Error(`FigureYa manifest contains an unsafe path: ${remotePath}`)
            if (seen.has(normalizedPath)) continue
            seen.add(normalizedPath)
            const localModulePath = normalizedPath.startsWith(`${moduleId}/`) ? normalizedPath.slice(moduleId.length + 1) : normalizedPath
            if (localModulePath === '') throw new Error(`FigureYa manifest contains an unsafe path: ${remotePath}`)
            const fileManifest = await callCatalog('figureya.source.file.manifest', { module_id: moduleId, path: normalizedPath })
            const manifest = fileManifest.manifest !== null && typeof fileManifest.manifest === 'object' && !Array.isArray(fileManifest.manifest) ? fileManifest.manifest as Record<string, JsonValue> : fileManifest
            const expectedBytes = Number(manifest.bytes ?? item.bytes ?? item.size)
            const expectedSha256 = typeof manifest.sha256 === 'string' ? manifest.sha256.toLowerCase() : typeof item.sha256 === 'string' ? item.sha256.toLowerCase() : ''
            if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 0 || expectedBytes > RDATALINUX_UPLOAD_MAX_BYTES) throw new Error(`FigureYa file ${normalizedPath} exceeds the 100 MiB per-file limit.`)
            if (!/^[a-f0-9]{64}$/u.test(expectedSha256)) throw new Error(`FigureYa file ${normalizedPath} has no valid SHA-256.`)
            totalBytes += expectedBytes
            if (totalBytes > FIGUREYA_MODULE_MAX_BYTES) throw new Error('The FigureYa module exceeds the 250 MiB total artifact limit.')
            const destination = resolve(targetRoot, localModulePath)
            const destinationContainment = relative(targetRoot, destination)
            if (destinationContainment === '..' || destinationContainment.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(destinationContainment)) throw new Error(`FigureYa manifest contains an unsafe path: ${normalizedPath}`)
            const destinationParent = dirname(destination)
            await ensureWorkspaceDirectory(destinationParent)
            const part = `${destination}.part`
            try {
              const existing = await lstat(destination)
              if (existing.isSymbolicLink() || !existing.isFile()) throw new Error(`FigureYa destination is not a regular file: ${normalizedPath}`)
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
            }
            try {
              await lstat(part)
              throw new Error(`FigureYa temporary file already exists: ${normalizedPath}.part`)
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
            }
            try {
              let offset = 0
              const chunks: Buffer[] = []
              while (offset < expectedBytes) {
                const chunk = await callCatalog('figureya.read.source.file.chunk', {
                  module_id: moduleId,
                  path: typeof fileManifest.path === 'string' ? fileManifest.path : normalizedPath,
                  offset,
                  length: Math.min(4_194_304, expectedBytes - offset),
                  internal_host_download: true,
                })
                if (typeof chunk.data_base64 !== 'string' || chunk.data_base64 === '') throw new Error(`The FigureYa file chunk at offset ${offset} has no data.`)
                const bytes = Buffer.from(chunk.data_base64, 'base64')
                if (bytes.length < 1 || offset + bytes.length > expectedBytes) throw new Error(`The FigureYa file chunk at offset ${offset} has an invalid length.`)
                chunks.push(bytes)
                offset += bytes.length
              }
              const bytes = Buffer.concat(chunks)
              const sha256 = createHash('sha256').update(bytes).digest('hex')
              if (bytes.length !== expectedBytes || sha256 !== expectedSha256) throw new Error(`The downloaded FigureYa file ${normalizedPath} does not match its manifest.`)
              await writeFile(part, bytes)
              await rename(part, destination)
              files.push({ path: normalizedPath, localPath: relative(workspace, destination).replaceAll('\\', '/'), ...(typeof manifest.mime_type === 'string' ? { mimeType: manifest.mime_type } : typeof manifest.mimeType === 'string' ? { mimeType: manifest.mimeType } : {}), bytes: bytes.length, sha256 })
            } finally {
              await unlink(part).catch(() => undefined)
            }
          }
          if (files.length === 0) throw new Error(`FigureYa module ${moduleId} manifest contains no downloadable files.`)
          return { moduleId, localRoot: relative(workspace, targetRoot).replaceAll('\\', '/'), files, totalBytes }
        }
        if (args.action === 'upload_workspace') {
          if (service.ctx.tools.get(remoteName) === undefined) throw new Error('rdatalinux R MCP is not active; reload the connection before uploading project files.')
          const info = await lstat(source)
          if (!info.isFile() || info.isSymbolicLink()) throw new Error('local_path must be a regular, non-symbolic-link file.')
          const resolvedSource = await realpath(source)
          if (resolvedSource !== source) throw new Error('local_path must not resolve through a symbolic link.')
          const size = (await stat(source)).size
          if (size < 1 || size > 20 * 1024 ** 3) throw new Error('The local file must be between 1 byte and 20 GiB.')
          if (size > RDATALINUX_UPLOAD_MAX_BYTES) {
            const handle = await open(source, 'r')
            try {
              const chunk = Buffer.alloc(4_194_304); const hash = createHash('sha256')
              for (let position = 0; position < size;) { const { bytesRead } = await handle.read(chunk, 0, Math.min(chunk.length, size - position), position); if (!bytesRead) throw new Error('Upload source changed'); hash.update(chunk.subarray(0, bytesRead)); position += bytesRead }
              const sha256 = hash.digest('hex')
              const transfer_id = createHash('sha256').update(JSON.stringify([values.project_id, values.remote_path, sha256, size])).digest('hex')
              const transfer = async (action: string, fields: Record<string, unknown> = {}) => {
                const response = await service.ctx.tools.execute({ signal: exec.signal, callId: ToolCallId(`r-transfer-${transfer_id}-${action}`), name: remoteName, arguments: { action: 'r.upload.transfer', arguments: { project_id: values.project_id, transfer_id, action, confirm: true, ...fields } }, parent: exec.token, agent: exec.agent })
                return service.compactPayload(response, remoteName)
              }
              const started = await transfer('start', { path: values.remote_path, bytes: size, sha256 })
              let position = Number(started.offset)
              if (!Number.isSafeInteger(position) || position < 0 || position > size) throw new Error('Invalid upload resume offset')
              while (position < size) {
                exec.signal.throwIfAborted()
                const { bytesRead } = await handle.read(chunk, 0, Math.min(chunk.length, size - position), position)
                if (!bytesRead) throw new Error('Upload source changed')
                const response = await transfer('chunk', { offset: position, data_base64: chunk.subarray(0, bytesRead).toString('base64') })
                if (Number(response.offset) !== position + bytesRead) throw new Error('Upload offset acknowledgement mismatch')
                position += bytesRead
              }
              const committed = await transfer('finish')
              return { projectId: values.project_id!, localPath: requested, remotePath: values.remote_path!, bytes: size, sha256, transferId: transfer_id, remote: committed }
            } finally { await handle.close() }
          }
          const bytes = await readFile(source)
          const sha256 = createHash('sha256').update(bytes).digest('hex')
          const nested = await service.ctx.tools.execute({
            signal: exec.signal,
            callId: ToolCallId(`r-upload-workspace-${Date.now()}`),
            name: remoteName,
            arguments: { action: 'r.upload.file', arguments: { project_id: values.project_id, path: values.remote_path, data_base64: bytes.toString('base64'), confirm: true } },
            parent: exec.token,
            agent: exec.agent,
          })
          if (nested.isError) {
            const message = nested.content.map((block: ContentBlock) => block.type === 'text' ? block.text : '').filter(Boolean).join('\n')
            throw new Error(message || 'rdatalinux R MCP upload failed.')
          }
          return { projectId: values.project_id!, localPath: requested, remotePath: values.remote_path!, name: basename(source), bytes: bytes.length, sha256, remote: nested.value as JsonValue }
        }

        const downloadTool = downloadSource === 'biomni'
          ? 'mcp__rmcp__biomni_artifacts'
          : figureyaRequest === undefined ? remoteName : 'mcp__rmcp__r_figureya_catalog'
        if (service.ctx.tools.get(downloadTool) === undefined) throw new Error(`${downloadSource === 'biomni' ? 'rdatalinux Biomni artifact' : figureyaRequest === undefined ? 'rdatalinux R file' : 'rdatalinux FigureYa catalog'} tool is not active; reload the connection before downloading files.`)
        const resolvedResult = await service.ctx.tools.execute({
          signal: exec.signal,
          callId: ToolCallId(`r-download-resolve-${Date.now()}`),
          name: downloadTool,
          arguments: downloadSource === 'biomni'
            ? { action: 'biomni.get.job.manifest', arguments: { job_id: values.job_id } }
            : figureyaRequest === undefined
              ? { action: 'r.resolve.file', arguments: { project_id: values.project_id, path: values.remote_path } }
              : { action: 'figureya.source.file.manifest', arguments: { module_id: figureyaRequest.moduleId, path: figureyaRequest.path } },
          parent: exec.token,
          agent: exec.agent,
        })
        let resolvedPayload = service.compactPayload(resolvedResult, downloadSource === 'biomni' ? 'Biomni job manifest' : 'rdatalinux file resolver')
        if (downloadSource === 'biomni') {
          const nestedManifest = resolvedPayload.manifest !== null && typeof resolvedPayload.manifest === 'object' && !Array.isArray(resolvedPayload.manifest)
            ? resolvedPayload.manifest as Record<string, JsonValue>
            : resolvedPayload
          const files = Array.isArray(nestedManifest.files)
            ? nestedManifest.files
            : Array.isArray(nestedManifest.outputs) ? nestedManifest.outputs : []
          const file = files.find(item => item !== null && typeof item === 'object' && !Array.isArray(item)
            && [item.path, item.relative_path, item.name].some(candidate => candidate === values.remote_path))
          if (file === undefined || file === null || typeof file !== 'object' || Array.isArray(file)) {
            throw new Error(`Biomni job ${values.job_id} has no artifact at ${values.remote_path}.`)
          }
          const artifact = file as Record<string, JsonValue>
          const artifactPath = [artifact.path, artifact.relative_path, artifact.name].find(candidate => typeof candidate === 'string' && candidate.trim() !== '')
          resolvedPayload = { path: typeof artifactPath === 'string' ? artifactPath : values.remote_path!, manifest: artifact }
        }
        const resolvedRemotePath = typeof resolvedPayload.path === 'string' && resolvedPayload.path.trim() !== ''
          ? resolvedPayload.path
          : figureyaRequest?.path ?? values.remote_path ?? ''
        const manifest = resolvedPayload.manifest !== null && typeof resolvedPayload.manifest === 'object' && !Array.isArray(resolvedPayload.manifest)
          ? resolvedPayload.manifest as Record<string, JsonValue>
          : resolvedPayload
        const expectedBytes = Number(manifest.bytes)
        const expectedSha256 = typeof manifest.sha256 === 'string' ? manifest.sha256.toLowerCase() : ''
        if ((typeof manifest.bytes !== 'number' && typeof manifest.bytes !== 'string') || (typeof manifest.bytes === 'string' && manifest.bytes.trim() === '')
          || !Number.isSafeInteger(expectedBytes) || expectedBytes < 0 || expectedBytes > 20 * 1024 ** 3) throw new Error('The remote file must be between 0 bytes and 20 GiB.')
        if (!/^[a-f0-9]{64}$/u.test(expectedSha256)) throw new Error('The remote file manifest has no valid SHA-256.')
        const parent = dirname(source)
        let currentParent = workspace
        for (const component of relative(workspace, parent).split(/[\\/]/u).filter(Boolean)) {
          currentParent = join(currentParent, component)
          try {
            const info = await lstat(currentParent)
            if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Download directories must not be symbolic links.')
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
            await mkdir(currentParent)
          }
        }
        const parentContainment = relative(workspace, await realpath(parent))
        if (parentContainment === '..' || parentContainment.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(parentContainment)) throw new Error('local_path resolves outside the current workspace.')
        try {
          await lstat(source)
          throw new Error('The download target already exists; choose a new local_path to avoid overwriting it.')
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        }
        const temporary = `${source}.${randomUUID()}.download-partial`
        const output = await open(temporary, 'wx')
        const hash = createHash('sha256')
        let offset = 0
        let sha256: string
        try {
        while (offset < expectedBytes) {
          const chunkResult = await service.ctx.tools.execute({
            signal: exec.signal,
            callId: ToolCallId(`r-download-chunk-${Date.now()}-${offset}`),
            name: downloadTool,
            arguments: downloadSource === 'biomni'
              ? { action: 'biomni.read.file.chunk', arguments: { job_id: values.job_id, path: resolvedRemotePath, offset, length: Math.min(4_194_304, expectedBytes - offset), internal_host_download: true } }
              : figureyaRequest === undefined
                ? { action: 'r.read.file.chunk', arguments: { project_id: values.project_id, path: resolvedRemotePath, offset, length: Math.min(4_194_304, expectedBytes - offset), internal_host_download: true } }
                : { action: 'figureya.read.source.file.chunk', arguments: { module_id: figureyaRequest.moduleId, path: resolvedRemotePath, offset, length: Math.min(4_194_304, expectedBytes - offset), internal_host_download: true } },
            parent: exec.token,
            agent: exec.agent,
          })
          const chunkPayload = service.compactPayload(chunkResult, 'rdatalinux file chunk')
          if (typeof chunkPayload.data_base64 !== 'string' || chunkPayload.data_base64 === '') throw new Error(`The remote file chunk at offset ${offset} has no data.`)
          const encodedChunk = chunkPayload.data_base64
          if (encodedChunk.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(encodedChunk)) {
            throw new Error(`The remote file chunk at offset ${offset} is not valid base64.`)
          }
          const chunk = Buffer.from(encodedChunk, 'base64')
          if (chunk.toString('base64') !== encodedChunk || chunk.length < 1 || chunk.length > 4_194_304 || offset + chunk.length > expectedBytes) {
            throw new Error(`The remote file chunk at offset ${offset} has an invalid length or encoding.`)
          }
          if (chunkPayload.offset !== undefined && Number(chunkPayload.offset) !== offset) throw new Error(`The remote file chunk offset does not match the requested offset ${offset}.`)
          if (chunkPayload.bytes !== undefined && Number(chunkPayload.bytes) !== chunk.length) throw new Error(`The remote file chunk byte count does not match its payload at offset ${offset}.`)
          if (chunkPayload.total_bytes !== undefined && Number(chunkPayload.total_bytes) !== expectedBytes) throw new Error('The remote file chunk reports a different total size than its Manifest.')
          if (chunkPayload.next_offset !== undefined && Number(chunkPayload.next_offset) !== offset + chunk.length) throw new Error(`The remote file chunk next offset is invalid at offset ${offset}.`)
          if (chunkPayload.eof !== undefined && (typeof chunkPayload.eof !== 'boolean' || chunkPayload.eof !== (offset + chunk.length === expectedBytes))) throw new Error(`The remote file chunk EOF marker is invalid at offset ${offset}.`)
          let written = 0
          while (written < chunk.length) {
            const progress = await output.write(chunk, written, chunk.length - written)
            if (progress.bytesWritten === 0) throw new Error('Local download write made no progress.')
            written += progress.bytesWritten
          }
          hash.update(chunk)
          offset += chunk.length
        }
        sha256 = hash.digest('hex')
        if (offset !== expectedBytes || sha256 !== expectedSha256) throw new Error('The downloaded file does not match its remote Manifest.')
        await output.sync()
        await output.close()
        try {
          const existing = await lstat(source)
          if (!existing.isFile() || existing.isSymbolicLink()) throw new Error('local_path must resolve to a regular, non-symbolic-link file.')
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        }
        try {
          await link(temporary, source)
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('The download target already exists; choose a new local_path to avoid overwriting it.')
          throw error
        }
        } finally {
          await output.close()
          await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error })
        }
        return downloadSource === 'biomni'
          ? { source: 'biomni', jobId: values.job_id!, remotePath: resolvedRemotePath, localPath: requested, name: basename(source), bytes: expectedBytes, sha256 }
          : figureyaRequest === undefined
            ? { source: 'project', projectId: values.project_id!, requestedRemotePath: values.remote_path!, remotePath: resolvedRemotePath, localPath: requested, name: basename(source), bytes: expectedBytes, sha256 }
            : { source: 'figureya_source', moduleId: figureyaRequest.moduleId, sourcePath: resolvedRemotePath, localPath: requested, name: basename(source), bytes: expectedBytes, sha256 }
      },
    }) as any)
    ctx.tools.register(defineTool({
      name: 'r_download_workspace',
      description: 'Download a remote RMCP project artifact, Biomni result, or installed FigureYa source file directly into the current local workspace. This creates the real file on disk; it never returns base64 for the user to decode. Give remote_path and project_id (source=project), job_id (source=biomni), or module_id plus source_path (source=figureya_source). local_path is optional and defaults to downloads/<filename>. The Host verifies size and SHA-256 and refuses to overwrite existing files.',
      parameters: {
        source: { type: 'string', enum: ['project', 'biomni', 'figureya_source'] },
        project_id: { type: 'string' },
        job_id: { type: 'string' },
        module_id: { type: 'string' },
        source_path: { type: 'string' },
        remote_path: { type: 'string' },
        local_path: { type: 'string' },
      },
      output: {
        schema: { type: 'object', additionalProperties: true },
        render: (_args: unknown, value: JsonValue) => [{ type: 'text', text: JSON.stringify(value) }],
      },
      async execute(args: { source?: 'project' | 'biomni' | 'figureya_source'; project_id?: string; job_id?: string; module_id?: string; source_path?: string; remote_path?: string; local_path?: string }, exec: any) {
        const nested = await service.ctx.tools.execute({
          signal: exec.signal,
          callId: ToolCallId(`r-download-workspace-${Date.now()}`),
          name: 'r_files',
          arguments: { action: 'download_workspace', ...args },
          parent: exec.token,
          agent: exec.agent,
        })
        if (nested.isError) {
          const message = nested.content.map((block: ContentBlock) => block.type === 'text' ? block.text : '').filter(Boolean).join('\n')
          throw new Error(message || 'Workspace download failed.')
        }
        return nested.value as Record<string, JsonValue>
      },
    }) as any)
    this.recordsReady = this.seedBundledServers().then(() => {
      for (const record of this.projects().listMcpServers()) {
        this.statuses.set(record.id, {
          state: record.enabled ? 'idle' : 'disabled',
          error: '',
          missingEnvironmentVariables: [],
        })
      }
      return this.loadMcpToolCache()
    }).catch((error: unknown) => {
      // Existing user records can outlive several desktop releases. A failed
      // default migration must remain an MCP-domain error instead of becoming
      // an unhandled startup rejection that terminates the whole Host.
      ctx.logger.warn(`zerowall-mcp: startup catalog preparation failed: ${redactError(error)}`)
    })
    this.operation = this.recordsReady
    ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
      const assembly = await next()
      const scope = context.scope
      const scoped = scope !== undefined && typeof scope === 'object' && scope !== null
      const selected = scoped ? this.selectedTools.get(scope) ?? new Set<string>() : new Set<string>()
      if (scoped) {
        const agent = scope as { session?: { surface?: { nodes?: readonly number[] }; eventAt?: (seq: number) => any } }
        for (const seq of [...(agent.session?.surface?.nodes ?? [])].slice(-400)) {
          const event = agent.session?.eventAt?.(seq)
          if (event?.type !== 'assistant/message') continue
          for (const block of event.data.message.content ?? []) {
            if (block.type !== 'tool-call') continue
            if (block.name === 'mcp_connect') {
              try {
                const args = typeof block.arguments === 'string' ? JSON.parse(block.arguments) : block.arguments
                const server = typeof args?.server === 'string' ? args.server : undefined
                if (server) selected.add(server)
              } catch { /* malformed historical arguments do not expose schemas */ }
            }
            for (const record of this.projects().listMcpServers()) {
              if (block.name.startsWith(`mcp__${record.serverName}__`)) selected.add(record.serverName)
            }
          }
        }
        this.selectedTools.set(scope, selected)
      }
      const records = this.projects().listMcpServers()
      return { ...assembly, tools: assembly.tools.filter(schema => {
        if (schema.name === RETIRED_R_PROJECT_TOOL) return false
        if (!schema.name.startsWith('mcp__')) return true
        const record = records.find(item => schema.name.startsWith(`mcp__${item.serverName}__`))
        return record === undefined || selected.has(record.serverName)
      }) }
    })
    // Nested Cordis fibers created during boot join the boot barrier even
    // without an await here. Release optional transports after UI mount.
    this.backgroundStarted = true
    // dsh-mcp-client publishes lifecycle events on the root context so that
    // the service can observe clients created in nested Cordis fibers.
    const applyStatus = (serverName: string, state: 'starting' | 'active' | 'error', error?: string): void => {
      const record = this.projects().listMcpServers().find(candidate => candidate.serverName === serverName)
      if (record === undefined || !record.enabled) return
      // dsh-mcp-client broadcasts on both the nested Fiber and root context.
      // A delayed reconnect/start event must not regress a connection that
      // has already completed its initial tools/list synchronization.
      if (state === 'starting' && (this.fibers.has(record.id) || this.managed.has(record.id)) && this.registeredTools.has(record.id)) return
      let discovered: string[] | undefined
      if (state === 'active') {
        discovered = this.toolNames(record.serverName)
        this.registeredTools.set(record.id, discovered)
        this.clearMcpToolIndex(record.serverName)
        this.indexMcpTools(record.serverName, discovered)
        void this.cacheMcpServer(record)
      }
      this.statuses.set(record.id, {
        state: state === 'active' && record.serverName === RDATALINUX_SERVER_NAME && discovered?.length === 0 ? 'active-with-zero-tools' : state,
        error: error === undefined ? '' : redactError(error),
        missingEnvironmentVariables: [],
        ...(record.serverName === RDATALINUX_SERVER_NAME && state === 'active' ? { toolDiscoveryState: 'complete' as const, toolDiscoveryCompletedAt: new Date().toISOString(), lastSuccessfulToolCount: discovered?.length ?? 0 } : {}),
        ...(record.serverName === RDATALINUX_SERVER_NAME && state === 'error' ? { toolDiscoveryState: 'failed' as const, lastDiscoveryError: error === undefined ? 'unknown' : redactError(error) } : {}),
      })
    }
    // The MCP client emits on both paths. Listening at root is sufficient for
    // clients created in nested Fibers and avoids duplicate/late transitions.
    const disposeRootStatusListener = ctx.root.on('mcp-client/status', applyStatus, { global: true })
    ctx.effect(() => () => {
      disposeRootStatusListener()
    }, 'zerowall-mcp: lifecycle status listener')
    this.startEnvironmentRefresh()
    ctx.effect(() => async () => {
      this.disposed = true
      if (this.environmentPoller !== undefined) clearInterval(this.environmentPoller)
      this.environmentPoller = undefined
      await Promise.allSettled([...this.connecting.values()])
      await this.disposeAll()
    }, 'zerowall-mcp: dispose dynamic clients')
  }

  private compactPayload(result: { value?: unknown; content: ContentBlock[]; isError: boolean }, target: string): Record<string, JsonValue> {
    if (result.isError) throw new Error(result.content.filter(block => block.type === 'text').map(block => block.text).join('\n') || `${target} failed`)
    if (result.value !== null && typeof result.value === 'object' && !Array.isArray(result.value)) {
      const value = result.value as Record<string, JsonValue>
      if (value.structuredContent !== null && typeof value.structuredContent === 'object' && !Array.isArray(value.structuredContent)) return value.structuredContent as Record<string, JsonValue>
      if (!Array.isArray(value.content)) return value
      const nestedText = value.content.find(block => block !== null && typeof block === 'object' && !Array.isArray(block) && block.type === 'text') as { text?: JsonValue } | undefined
      if (typeof nestedText?.text === 'string') {
        const parsed = JSON.parse(nestedText.text) as unknown
        if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, JsonValue>
      }
    }
    const text = result.content.find(block => block.type === 'text')
    if (text?.type !== 'text') throw new Error(`${target} returned no structured catalog`)
    const parsed = JSON.parse(text.text) as unknown
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${target} returned an invalid catalog`)
    return parsed as Record<string, JsonValue>
  }

  async workflowRequest(action: string, args: unknown, exec: any): Promise<unknown> {
    await this.ensureConnected('rmcp')
    const target = 'mcp__rmcp__r_runtime'
    const result = await this.ctx.tools.execute({ callId: ToolCallId(`${exec.callId}:${action}`), name: target, arguments: { action, arguments: normalizeJsonArguments(args) }, agent: exec.agent, parent: exec.token, rootCallId: exec.rootCallId ?? exec.callId, signal: exec.signal })
    if (result.isError) throw new Error(result.content.filter(block => block.type === 'text').map(block => block.text).join('\n'))
    return this.compactPayload(result, target)
  }

  async searchCompactCapabilities(query: string, detailId: string | undefined, limit: number, exec: any): Promise<CompactCapabilityRecord[]> {
    const requests = [
      {
        backend: 'rmcp' as const,
        target: 'mcp__rmcp__r_runtime',
        arguments: { action: 'capability_search', query: detailId ?? query, detail: detailId !== undefined, limit },
      },
      {
        backend: 'bio' as const,
        target: 'mcp__zerowall_managed_bio_tools__bio_search',
        arguments: { query: detailId === undefined ? query : '', ...(detailId === undefined ? {} : { capability_id: detailId }), detail: detailId !== undefined, limit },
      },
    ].filter(request => this.ctx.tools.get(request.target) !== undefined)
    const settled = await Promise.allSettled(requests.map(async request => {
      const result = await this.ctx.tools.execute({
        callId: ToolCallId(`${exec.callId}:catalog:${request.backend}`),
        name: request.target,
        arguments: request.arguments,
        agent: exec.agent,
        parent: exec.token,
        rootCallId: exec.rootCallId ?? exec.callId,
        signal: exec.signal,
      })
      return { request, payload: this.compactPayload(result, request.target) }
    }))
    const records: CompactCapabilityRecord[] = []
    for (const item of settled) {
      if (item.status !== 'fulfilled') continue
      const { request, payload } = item.value
      const exact = payload.capability
      const entries = exact !== undefined ? [exact] : (request.backend === 'bio' ? payload.matches : payload.capabilities)
      if (!Array.isArray(entries)) continue
      for (const value of entries) {
        if (value === null || typeof value !== 'object' || Array.isArray(value)) continue
        const entry = value as Record<string, JsonValue>
        if (typeof entry.id !== 'string' || typeof entry.public_tool !== 'string') continue
        records.push({
          id: entry.id,
          publicTool: entry.public_tool,
          summary: typeof entry.summary === 'string' ? entry.summary : '',
          ...(entry.input_schema === undefined ? {} : { inputSchema: entry.input_schema }),
          backend: request.backend,
        })
      }
    }
    return records.slice(0, limit)
  }

  async executeCompactCapability(id: string, args: unknown, exec: any): Promise<{ target: string; content: ContentBlock[]; value: unknown }> {
    const safeArgs = normalizeJsonArguments(args ?? {})
    const [record] = await this.searchCompactCapabilities('', id, 1, exec)
    if (record === undefined) throw new Error(`UNKNOWN_CAPABILITY: ${id}`)
    if (record.backend === 'rmcp' && (id === 'tooluniverse.run.tool' || id.startsWith('tooluniverse.tool.'))) {
      const connection = this.projects().listMcpServers().find(item => item.serverName === 'rmcp')
      if (!connection) throw new Error('RMCP_CONNECTION_MISSING')
      const credentials = await resolveToolUniverseCredentials(connection, async ref => await this.secrets.get(`${ENVIRONMENT_SECRET_PREFIX}${ref.toLowerCase()}`) ?? process.env[ref])
      const authorization = await this.secrets.get(RDATALINUX_R_MCP_AUTHORIZATION_CREDENTIAL) ?? process.env[RDATALINUX_R_MCP_AUTHORIZATION_ENV]
      if (!authorization?.trim()) throw new Error('RMCP_AUTHORIZATION_MISSING')
      const result = await callToolUniverse({ url: connection.url!, authorization, operation: id, arguments: safeArgs, credentials, signal: exec.signal })
      const content: ContentBlock[] = result.content.filter(item => item.type === 'text').map(item => ({ type: 'text', text: item.text }))
      if (result.isError) throw new Error(content.map(item => item.type === 'text' ? item.text : '').join('\n') || 'ToolUniverse submission failed')
      return { target: 'mcp__rmcp__tooluniverse_execute', content, value: result }
    }
    const target = record.backend === 'bio'
      ? `mcp__zerowall_managed_bio_tools__${record.publicTool}`
      : `mcp__rmcp__${record.publicTool}`
    const argumentsValue = record.backend === 'bio'
      ? { capability_id: id, arguments: safeArgs }
      : { action: id, arguments: safeArgs }
    const result = await this.ctx.tools.execute({
      callId: ToolCallId(`${exec.callId}:compact:${id}`),
      name: target,
      arguments: argumentsValue,
      agent: exec.agent,
      parent: exec.token,
      rootCallId: exec.rootCallId ?? exec.callId,
      signal: exec.signal,
    })
    if (result.isError) throw new Error(result.content.filter(block => block.type === 'text').map(block => block.text).join('\n') || `${id} failed`)
    return { target, content: result.content, value: result.value }
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
      if (isBuiltInMcpConnection(input.serverName)) throw new Error('This connection is managed in Environment settings.')
      const record = this.projects().createMcpServer(input as CreateMcpServerInput)
      await this.reconcile(record)
      return this.dto(record)
    })
  }

  @Remote('update')
  update(input: UpdateMcpServerRequest): Promise<McpServerDto> {
    return this.exclusive(async () => {
      const existing = this.projects().listMcpServers().find(record => record.id === input.id)
      if (existing !== undefined && isBuiltInMcpConnection(existing.serverName)) {
        const allowed = new Set(['enabled', 'name', 'toolCallTimeoutMs', 'reconnect', 'failOnStartupError'])
        if (existing.serverName === 'rmcp') allowed.add('envRefs')
        if (Object.keys(input.changes).some(key => !allowed.has(key))) throw new Error('Managed connection fields are read-only. Use Environment settings.')
      } else if (input.changes.serverName !== undefined && isBuiltInMcpConnection(input.changes.serverName)) {
        throw new Error('Managed connection names are reserved.')
      }
      const record = this.projects().updateMcpServer(input.id, input.changes as UpdateMcpServerInput)
      if (existing !== undefined && this.cacheSignature(existing) !== this.cacheSignature(record)) this.clearMcpToolIndex(existing.serverName)
      await this.reconcile(record)
      return this.dto(record)
    })
  }

  @Remote('deleteConnection')
  deleteConnection(id: string): Promise<void> {
    return this.exclusive(async () => {
      const record = this.projects().getMcpServer(id)
      if (record !== undefined && isBuiltInMcpConnection(record.serverName)) {
        throw new Error('Built-in MCP connections cannot be deleted. Disable the connection instead.')
      }
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
      await this.reconcile(record, true)
      return this.dto(record)
    })
  }

  @Remote('getSciMasterCredentialStatus')
  async getSciMasterCredentialStatus(): Promise<{ configured: boolean }> {
    let value: string | undefined
    try {
      value = await this.secrets.get(SCIMASTER_API_KEY_CREDENTIAL)
    } catch { value = undefined }
    return { configured: Boolean(value?.trim() || await hasEnvironmentCredential('ZEROWALL_SCIMASTER_API_KEY', key => this.secrets.get(key))) }
  }

  @Remote('setSciMasterApiKey')
  setSciMasterApiKey(apiKey: string): Promise<McpServerDto | undefined> {
    return this.exclusive(async () => {
      const value = apiKey.trim()
      if (value === '') throw new Error('SciMaster API Key 不能为空。')
      await this.secrets.set(SCIMASTER_API_KEY_CREDENTIAL, value)
      const record = this.projects().listMcpServers().find(item => item.serverName === 'zerowall_managed_scimaster')
      if (record === undefined) return undefined
      const next = record.enabled ? record : this.projects().updateMcpServer(record.id, { enabled: true })
      await this.reconcile(next)
      return this.dto(next)
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
    let value: string | undefined
    try {
      value = await this.secrets.get(HUAGONGSHE_CREDENTIAL)
    } catch { value = undefined }
    return { configured: Boolean(value?.trim() || await hasEnvironmentCredential(HUAGONGSHE_AUTH_ENV, key => this.secrets.get(key))) }
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
      const next = record.enabled ? record : this.projects().updateMcpServer(record.id, { enabled: true })
      await this.reconcile(next)
      return this.dto(next)
    })
  }

  @Remote('clearHuagongsheApiKey')
  clearHuagongsheApiKey(): Promise<void> {
    return this.exclusive(async () => {
      await this.secrets.delete(HUAGONGSHE_CREDENTIAL)
      const record = this.projects().listMcpServers().find(item => item.serverName === 'huagongshe' && item.url === HUAGONGSHE_URL)
      if (!record) return
      const keepOfficialReference = await hasEnvironmentCredential(HUAGONGSHE_AUTH_ENV, key => this.secrets.get(key))
      const headerRefs = keepOfficialReference ? { ...record.headerRefs, Authorization: HUAGONGSHE_AUTH_ENV } : Object.fromEntries(Object.entries(record.headerRefs).filter(([name]) => name !== 'Authorization'))
      await this.reconcile(this.projects().updateMcpServer(record.id, { headerRefs }))
    })
  }

  @Remote('getRdatalinuxCredentialStatus')
  async getRdatalinuxCredentialStatus(): Promise<{ configured: boolean; endpoint: string }> {
    let value: string | undefined
    try {
      value = await this.secrets.get(RDATALINUX_R_MCP_AUTHORIZATION_CREDENTIAL)
    } catch { value = undefined }
    return { configured: Boolean(value?.trim() || await hasEnvironmentCredential(RDATALINUX_R_MCP_AUTHORIZATION_ENV, key => this.secrets.get(key))), endpoint: RDATALINUX_R_MCP_URL }
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
          ? this.projects().updateMcpServer(item.id, { headerRefs: { ...item.headerRefs, Authorization: RDATALINUX_R_MCP_AUTHORIZATION_ENV }, enabled: true })
          : item.enabled ? item : this.projects().updateMcpServer(item.id, { enabled: true })
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
    this.environmentFileSignature = managedEnvironmentFileSignature()
    this.environmentSignature = managedEnvironmentSignature(managedEnvironmentRecord(this.environmentFileSignature))
    const configuredInterval = Number(process.env.ZEROWALL_MCP_ENVIRONMENT_POLL_MS)
    const interval = Number.isFinite(configuredInterval) && configuredInterval >= 100 ? configuredInterval : MCP_ENVIRONMENT_POLL_INTERVAL_MS
    this.environmentPoller = setInterval(() => { void this.pollEnvironment().catch(error => this.ctx.logger.warn(`zerowall-mcp: environment transaction failed: ${redactError(error)}`)) }, interval)
  }

  private async pollEnvironment(): Promise<void> {
    if (this.environmentRefreshInFlight) return
    const manager = process.env.ZEROWALL_PYTHON_MANAGEMENT_ROOT || process.env.ZEROWALL_PYTHON_ROOT || process.env.ZEROWALL_MCP_ENVIRONMENT_ROOT
    if (manager && existsSync(join(manager, 'write-lock.json'))) {
      this.environmentRefreshInFlight = true
      try { await this.managed.quiesce(); this.environmentFileSignature = ''; this.environmentSignature = '' }
      finally { this.environmentRefreshInFlight = false }
      return
    }
    this.managed.resume()
    this.managed.commitStaged()
    if (!this.backgroundStarted) return
    const fileSignature = managedEnvironmentFileSignature()
    if (fileSignature === this.environmentFileSignature) return
    this.environmentFileSignature = fileSignature
    const record = managedEnvironmentRecord(fileSignature)
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
        this.convergeReadyStatuses()
        if (this.disposed) return
        for (const server of this.projects().listMcpServers()) {
          if (server.enabled && isManagedMcp(server.serverName) && (this.fibers.has(server.id) || this.managed.has(server.id))) await this.reconcile(server)
        }
      })
    } catch (error) {
      this.ctx.logger.warn(`zerowall-mcp: managed environment refresh failed: ${redactError(error)}`)
    } finally {
      this.environmentRefreshInFlight = false
    }
  }

  @Remote('pendingEditors')
  pendingEditors(): Array<{ artifact_id: string; url: string; sessionId: string; cwd: string; createdAt: number }> { return this.managed.ketcher.list() }

  @Remote('acknowledgeEditor')
  acknowledgeEditor(id: string): void { this.managed.ketcher.acknowledge(id) }

  private async seedBundledServers(): Promise<void> {
    if (process.env.ZEROWALL_DISABLE_DEFAULT_MCP === '1') return
    const deferDefaultConnections = process.env.ZEROWALL_DEFER_DEFAULT_MCP === '1'
    // Default MCP records are enabled by policy. Their reconciliation is
    // started asynchronously by the Host, so enabling them here does not
    // block the desktop UI boot and keeps the MCP tab populated immediately.
    const defaultEnabled = true
    const marker = defaultMcpMarkerPath()
    let markerVersion = 0
    try {
      const parsed = JSON.parse(await readFile(marker, 'utf8')) as { version?: unknown }
      markerVersion = typeof parsed.version === 'number' ? parsed.version : 0
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    const projects = this.projects()
    // Migrate legacy rdatalinux namespaces while preserving settings.  The
    // managed RMCP endpoint is now HTTPS and is intentionally not represented
    // by a literal retired IP in the source.  Reserved RMCP records are safe
    // to normalize because their endpoint is product-owned; custom MCP
    // records keep their URL and settings.
    for (const server of projects.listMcpServers()) {
      if (['rdatalinux_biomni', 'rdatalinux_r_platform', 'rbioagent', 'rplatform', 'rplotfigure'].includes(server.serverName)
        && server.transport === 'streamable-http'
        && server.headerRefs?.Authorization === RDATALINUX_R_MCP_AUTHORIZATION_ENV) {
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
    // RMCP is product-owned. Normalize its endpoint on every boot so an
    // existing profile that already passed the old migration marker cannot
    // continue calling the retired IP address. User-created MCP records keep
    // their chosen endpoints because only the reserved rmcp name is managed.
    for (const server of projects.listMcpServers()) {
      if (server.serverName === RDATALINUX_SERVER_NAME
        && server.transport === 'streamable-http'
        && server.url !== RDATALINUX_R_MCP_URL) {
        projects.updateMcpServer(server.id, { url: RDATALINUX_R_MCP_URL })
      }
    }
    if (deferDefaultConnections && markerVersion < 6 && process.env.ZEROWALL_REENABLE_DEFAULT_MCP_MIGRATION === '1') {
      // Releases before the deferred-boot fix persisted the bundled servers
      // as enabled. On an existing install that made the new desktop flag
      // ineffective: every managed server still performed tools/list during
      // boot and could exhaust the Harness heap. Disable only the exact
      // ZeroWall defaults once; custom MCP records and future user choices are
      // left untouched.
      const defaultServerNames = new Set([
        RDATALINUX_SERVER_NAME,
        'huagongshe',
        'zerowall_managed_scimaster',
        'zerowall_managed_bio_tools',
        'zerowall_managed_ketcher',
      ])
      for (const server of projects.listMcpServers()) {
        if (defaultServerNames.has(server.serverName) && server.enabled) {
          projects.updateMcpServer(server.id, { enabled: false })
        }
      }
    }
    if (markerVersion < 9) {
      // Restore the product defaults to enabled after the deferred-connection
      // release. User-created MCP records are left untouched.
      const defaultServerNames = new Set([
        RDATALINUX_SERVER_NAME,
        'huagongshe',
        'zerowall_managed_scimaster',
        'zerowall_managed_bio_tools',
        'zerowall_managed_ketcher',
      ])
      for (const server of projects.listMcpServers()) {
        if (defaultServerNames.has(server.serverName) && !server.enabled) {
          projects.updateMcpServer(server.id, { enabled: true })
        }
      }
    }
    if (markerVersion < 10) {
      // GPSAdb is a public, read-only product connection. Seed it once for
      // existing installations; later boots preserve the user's enabled flag.
      // A conflicting existing record is user data and is never rewritten.
      if (!projects.listMcpServers().some(server => server.serverName === GPSADB_SERVER_NAME)) {
        projects.createMcpServer({
          name: 'GPSAdb', serverName: GPSADB_SERVER_NAME, transport: 'streamable-http',
          enabled: true, url: GPSADB_MCP_URL, failOnStartupError: false,
        })
      }
    }
    for (const server of projects.listMcpServers()) {
      if (server.serverName === RDATALINUX_SERVER_NAME && server.transport === 'streamable-http' && server.headerRefs.Authorization === undefined) {
        projects.updateMcpServer(server.id, { headerRefs: { ...server.headerRefs, Authorization: RDATALINUX_R_MCP_AUTHORIZATION_ENV } })
      }
      if (server.serverName === 'huagongshe' && server.url === HUAGONGSHE_URL && server.headerRefs.Authorization === undefined) {
        projects.updateMcpServer(server.id, { headerRefs: { ...server.headerRefs, Authorization: HUAGONGSHE_AUTH_ENV } })
      }
      // RMCP is the managed remote service. A successful MCP client Fiber is
      // not evidence that the HTTP handshake and tools/list completed when
      // failOnStartupError is false: DSH can resolve the Fiber after a failed
      // startup, which used to be projected as "connected with zero tools".
      // Migrate only this reserved ZeroWall record; user MCP servers keep
      // their chosen startup policy.
      if (server.serverName === RDATALINUX_SERVER_NAME && !server.failOnStartupError) {
        projects.updateMcpServer(server.id, { failOnStartupError: true })
      }
    }
    if (!projects.listMcpServers().some(server => server.serverName === RDATALINUX_SERVER_NAME)) {
      projects.createMcpServer({
        name: 'rmcp', serverName: RDATALINUX_SERVER_NAME, transport: 'streamable-http',
        // Seed the managed record for Settings/Environment, but do not start
        // a remote tools/list request during a clean desktop boot. Saving a
        // credential or explicitly enabling the connection reconciles it.
        enabled: defaultEnabled, url: RDATALINUX_R_MCP_URL,
        headerRefs: { Authorization: RDATALINUX_R_MCP_AUTHORIZATION_ENV },
        failOnStartupError: true,
      })
    }
    const bundled = projects.listMcpServers()
    if (!bundled.some(server => server.serverName === 'huagongshe')) {
      projects.createMcpServer({ name: '化工社 AIchem', serverName: 'huagongshe', transport: 'streamable-http', enabled: defaultEnabled, url: HUAGONGSHE_URL, failOnStartupError: false })
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
      projects.createMcpServer({ name: 'Bio Tools', serverName: 'zerowall_managed_bio_tools', transport: 'stdio', enabled: defaultEnabled, command: 'zerowall-managed:bio-tools', cwd: '', failOnStartupError: false })
    }
    if (!bundled.some(server => server.serverName === 'zerowall_managed_ketcher')) {
      projects.createMcpServer({ name: 'Ketcher Chemistry', serverName: 'zerowall_managed_ketcher', transport: 'stdio', enabled: defaultEnabled, command: 'zerowall-managed:ketcher', cwd: '', failOnStartupError: false })
    }
    if (!bundled.some(server => server.serverName === 'zerowall_managed_scimaster')) {
      projects.createMcpServer({ name: 'Sci', serverName: 'zerowall_managed_scimaster', transport: 'stdio', enabled: defaultEnabled, command: 'zerowall-managed:scimaster', cwd: '', failOnStartupError: false })
    }
    for (const server of projects.listMcpServers()) {
      // This is a first-party server bundled by the signed runtime archive.
      // If the embedded Python lacks its verified MCP closure, let users see
      // the actionable startup error instead of a misleading "0 tools".
      if (server.serverName === 'zerowall_managed_bio_tools' && !server.failOnStartupError) {
        projects.updateMcpServer(server.id, { failOnStartupError: true })
      }
    }
    for (const server of projects.listMcpServers()) {
      const reconnect = { ...server.reconnect }
      if (reconnect.maxAttempts === 10) reconnect.maxAttempts = 2
      if (reconnect.initialDelayMs === 500) reconnect.initialDelayMs = 5_000
      if (reconnect.maxDelayMs === 30_000) reconnect.maxDelayMs = 60_000
      if (server.toolCallTimeoutMs === 60_000 || JSON.stringify(reconnect) !== JSON.stringify(server.reconnect)) {
        projects.updateMcpServer(server.id, { toolCallTimeoutMs: server.toolCallTimeoutMs === 60_000 ? 300_000 : server.toolCallTimeoutMs, reconnect })
      }
    }
    await mkdir(dirname(marker), { recursive: true })
    await writeFile(marker, '{"version":10}\n', 'utf8')
  }

  private projects() {
    type ProjectsService = {
      listMcpServers(): McpServerRecord[]
      getMcpServer(id: string): McpServerRecord | undefined
      createMcpServer(input: CreateMcpServerInput): McpServerRecord
      updateMcpServer(id: string, input: UpdateMcpServerInput): McpServerRecord
      deleteMcpServer(id: string): void
    }
    const projects = this.ctx.get('zerowallMcpConfigurationStore') as unknown as ProjectsService | undefined
    if (projects === undefined) throw new Error('ZeroWall projects service is not available.')
    return projects
  }

  private startConnection(record: McpServerRecord): void {
    if (this.disposed || this.connecting.has(record.id)) return
    const cooldown = this.failureCooldownUntil.get(record.id) ?? 0
    if (cooldown > Date.now()) return
    const pending = this.exclusive(async () => {
      const latest = this.projects().getMcpServer(record.id)
      if (!latest || this.disposed || ['active', 'active-with-zero-tools'].includes(this.statuses.get(record.id)?.state ?? '')) return
      await this.reconcile(latest)
    }).catch((error: unknown) => {
      this.failureCooldownUntil.set(record.id, Date.now() + MCP_FAILURE_COOLDOWN_MS)
      this.ctx.logger.warn(`zerowall-mcp: default connection failed: ${redactError(error)}`)
    }).finally(() => {
      if (this.connecting.get(record.id) === pending) this.connecting.delete(record.id)
    })
    this.connecting.set(record.id, pending)
  }

  /** Coalesce demand for one server; inspection and polling never call this method. */
  async ensureConnected(serverName: string): Promise<void> {
    await this.recordsReady
    if (this.disposed) throw new Error('MCP service is stopping.')
    const record = this.projects().listMcpServers().find(item => item.serverName === serverName)
    if (record === undefined || !record.enabled) throw new Error('MCP connection is disabled or unknown. Enable it in Settings first.')
    if (['active', 'active-with-zero-tools'].includes(this.statuses.get(record.id)?.state ?? '') && (this.fibers.has(record.id) || this.managed.has(record.id))) return
    const cooldown = this.failureCooldownUntil.get(record.id) ?? 0
    if (cooldown > Date.now()) throw new Error('MCP connection is cooling down after a failed start. Retry later or reload it from Settings.')
    let pending = this.connecting.get(record.id)
    if (pending === undefined) {
      pending = this.exclusive(async () => {
        const current = this.projects().getMcpServer(record.id)
        if (current === undefined || !current.enabled) throw new Error('MCP connection is disabled or removed.')
        if (!['active', 'active-with-zero-tools'].includes(this.statuses.get(record.id)?.state ?? '')) await this.reconcile(current)
        const status = this.statuses.get(record.id)
        if (!['active', 'active-with-zero-tools'].includes(status?.state ?? '')) throw new Error(status?.error || 'MCP connection is unavailable.')
      })
      this.connecting.set(record.id, pending)
    }
    try {
      await pending
      this.failureCooldownUntil.delete(record.id)
      const status = this.statuses.get(record.id)
      if (!['active', 'active-with-zero-tools'].includes(status?.state ?? '')) throw new Error(status?.error || 'MCP connection is unavailable.')
    } finally { if (this.connecting.get(record.id) === pending) this.connecting.delete(record.id) }
  }

  private async reconcile(record: McpServerRecord, force = false): Promise<void> {
    const version = (this.reconcileVersions.get(record.id) ?? 0) + 1
    this.reconcileVersions.set(record.id, version)
    this.readyVersions.delete(record.id)
    const current = (): boolean => !this.disposed && this.reconcileVersions.get(record.id) === version
    if (!force && record.enabled && isManagedMcp(record.serverName) && this.managed.has(record.id) && this.managed.snapshot(record.id) === managedEnvironmentRecord()?.root) {
      const names = this.managed.names(record.id)
      this.registeredTools.set(record.id, names); this.indexMcpTools(record.serverName, names)
      this.readyVersions.set(record.id, version)
      this.statuses.set(record.id, { state: 'active', error: '', missingEnvironmentVariables: [] })
      return
    }
    if (!record.enabled) {
      await this.disposeOne(record.id)
      if (current()) this.statuses.set(record.id, { state: 'disabled', error: '', missingEnvironmentVariables: [] })
      return
    }
    if (isManagedMcp(record.serverName) && !managedEnvironmentReady(record.serverName)) {
      if (current() && !(this.fibers.has(record.id) || this.managed.has(record.id))) this.statuses.set(record.id, { state: 'blocked', error: record.serverName === 'zerowall_managed_bio_tools' && managedEnvironmentRecord()?.health === 'ready' && !managedBioDependenciesReady(managedEnvironmentRecord()!) ? '共享 Python 解释器已就绪，但 Bio MCP 核心依赖尚未安装。请在 Python 设置中安装或修复核心层。' : '共享 Python/MCP 环境未就绪，请在 Python 设置中检查运行时和服务资源。', missingEnvironmentVariables: [] })
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
        try { sciMasterApiKey = await this.secrets.get(`${ENVIRONMENT_SECRET_PREFIX}zerowall_scimaster_api_key`) } catch { sciMasterApiKey = undefined }
      }
      if (!sciMasterApiKey?.trim()) sciMasterApiKey = process.env.ZEROWALL_SCIMASTER_API_KEY
      if (!sciMasterApiKey?.trim()) {
        await this.disposeOne(record.id)
        if (current()) this.statuses.set(record.id, { state: 'blocked', error: 'SciMaster 需要配置 API Key。请在设置中保存 Key 后重试。', missingEnvironmentVariables: [] })
        return
      }
    }
    if (record.serverName === RDATALINUX_SERVER_NAME) {
      try { rdatalinuxAuthorization = await this.secrets.get(RDATALINUX_R_MCP_AUTHORIZATION_CREDENTIAL) } catch { rdatalinuxAuthorization = undefined }
      if (!rdatalinuxAuthorization?.trim()) {
        try { rdatalinuxAuthorization = await this.secrets.get(`${ENVIRONMENT_SECRET_PREFIX}r_platform_mcp_authorization`) } catch { rdatalinuxAuthorization = undefined }
      }
      if (!rdatalinuxAuthorization?.trim()) rdatalinuxAuthorization = process.env[RDATALINUX_R_MCP_AUTHORIZATION_ENV]
      if (!rdatalinuxAuthorization?.trim()) {
        await this.disposeOne(record.id)
        if (current()) this.statuses.set(record.id, { state: 'waiting-for-credentials', error: 'RMCP 缺少 Authorization 凭据。请在环境配置中设置 R_PLATFORM_MCP_AUTHORIZATION。', missingEnvironmentVariables: [RDATALINUX_R_MCP_AUTHORIZATION_ENV], toolDiscoveryState: 'failed', lastDiscoveryError: 'missing-credential' })
        return
      }
    }
    let huagongsheAuthorization: string | undefined
    if (record.serverName === 'huagongshe' && record.url === HUAGONGSHE_URL) {
      try {
        const token = await this.secrets.get(HUAGONGSHE_CREDENTIAL)
        if (token?.trim()) huagongsheAuthorization = `Bearer ${token.trim()}`
      } catch { /* An unavailable vault is reported by reference resolution. */ }
      if (!huagongsheAuthorization?.trim()) {
        try { huagongsheAuthorization = await this.secrets.get(`${ENVIRONMENT_SECRET_PREFIX}huagongshe_mcp_authorization`) } catch { huagongsheAuthorization = undefined }
      }
      if (!huagongsheAuthorization?.trim()) huagongsheAuthorization = process.env[HUAGONGSHE_AUTH_ENV]
      if (!huagongsheAuthorization?.trim()) {
        await this.disposeOne(record.id)
        if (current()) this.statuses.set(record.id, { state: 'blocked', error: '请在环境配置中设置化工社 Token。', missingEnvironmentVariables: [] })
        return
      }
    }
    const environment = record.serverName === RDATALINUX_SERVER_NAME && rdatalinuxAuthorization?.trim()
      ? { ...process.env, [RDATALINUX_R_MCP_AUTHORIZATION_ENV]: rdatalinuxAuthorization }
      : process.env
    const resolved = resolveMcpConfig(record, huagongsheAuthorization ? { ...environment, [HUAGONGSHE_AUTH_ENV]: huagongsheAuthorization } : environment, process.cwd())
    if (resolved.config === undefined) {
      await this.disposeOne(record.id)
      if (current()) this.statuses.set(record.id, {
        state: 'blocked',
        error: 'Required environment variables are not available to the Host.',
        missingEnvironmentVariables: resolved.missingEnvironmentVariables,
      })
      return
    }
    if (!current()) return
    if (isManagedMcp(record.serverName) && resolved.config.transport === 'stdio') {
      const config = resolved.config as McpClient.StdioConfig
      if (sciMasterApiKey !== undefined) config.env.ZEROWALL_SCIMASTER_API_KEY = sciMasterApiKey
      try {
        const candidate = await this.managed.prepare(config, managedEnvironmentRecord()?.root)
        if (!current()) { await this.managed.discard(candidate); return }
        const names = this.managed.activate(record.id, candidate)
        this.registeredTools.set(record.id, names)
        this.clearMcpToolIndex(record.serverName)
        this.indexMcpTools(record.serverName, names)
        void this.cacheMcpServer(record)
        this.readyVersions.set(record.id, version)
        this.statuses.set(record.id, { state: 'active', error: '', missingEnvironmentVariables: [] })
      } catch (error) {
        if (!this.managed.has(record.id)) this.statuses.set(record.id, { state: 'error', error: redactError(error), missingEnvironmentVariables: [] })
        else this.ctx.logger.warn(`Managed candidate failed; retaining active generation: ${redactError(error)}`)
        this.environmentFileSignature = ''
        this.environmentSignature = ''
      }
      return
    }
    // DSH reserves a server namespace until the prior client is disposed.
    await this.disposeOne(record.id)
    if (!current()) return
    const toolDiscoveryStartedAt = new Date().toISOString()
    this.statuses.set(record.id, { state: record.serverName === RDATALINUX_SERVER_NAME ? 'discovering-tools' : 'starting', error: '', missingEnvironmentVariables: [], toolDiscoveryState: record.serverName === RDATALINUX_SERVER_NAME ? 'pending' : 'unknown', toolDiscoveryStartedAt })
    let replacement: Fiber | undefined
    try {
      const config = resolved.config as McpClient.Config
      if (sciMasterApiKey !== undefined && config.transport === 'stdio') config.env.ZEROWALL_SCIMASTER_API_KEY = sciMasterApiKey
      const fiber = this.ctx.plugin(McpClient, config)
      replacement = fiber
      await fiber
      if (!current()) {
        await fiber.dispose()
        return
      }
      this.fibers.set(record.id, fiber)
      const names = this.toolNames(record.serverName)
      this.registeredTools.set(record.id, names)
      this.clearMcpToolIndex(record.serverName)
      this.indexMcpTools(record.serverName, names)
      this.readyVersions.set(record.id, version)
      // The fiber resolves after the initial transport handshake and
      // tools/list synchronization.  The lifecycle event normally arrives on
      // the same turn, but it can cross a nested Fiber boundary before this
      // service's listener is attached.  Converge the authoritative Host state
      // here as well so callers never remain stuck at `starting` when tools are
      // already registered.  Later lifecycle events still win and can report
      // reconnect/error transitions.
      if (current()) {
        this.statuses.set(record.id, { state: record.serverName === RDATALINUX_SERVER_NAME && names.length === 0 ? 'active-with-zero-tools' : 'active', error: '', missingEnvironmentVariables: [], toolDiscoveryState: record.serverName === RDATALINUX_SERVER_NAME ? 'complete' : 'unknown', toolDiscoveryStartedAt, toolDiscoveryCompletedAt: new Date().toISOString(), lastSuccessfulToolCount: names.length })
        void this.cacheMcpServer(record)
      }
    } catch (error) {
      await replacement?.dispose()
      if (!current()) return
      this.statuses.set(record.id, {
        state: 'error',
        error: redactError(error),
        missingEnvironmentVariables: [],
        toolDiscoveryState: record.serverName === RDATALINUX_SERVER_NAME ? 'failed' : 'unknown',
        toolDiscoveryStartedAt,
        ...(record.serverName === RDATALINUX_SERVER_NAME ? { lastDiscoveryError: redactError(error) } : {}),
      })
    }
  }

  private dto(record: McpServerRecord): McpServerDto {
    const status = this.statuses.get(record.id) ?? { state: record.enabled ? 'idle' as const : 'disabled' as const, error: '', missingEnvironmentVariables: [] }
    // Prefer the snapshot captured for this connection generation. Reading the
    // global registry during a concurrent refresh can otherwise expose a
    // different server's tools in this DTO.
    const tools = [...(this.registeredTools.get(record.id) ?? this.toolNames(record.serverName))]
    const runtimeState = status.state === 'starting' && (this.fibers.has(record.id) || this.managed.has(record.id)) && this.registeredTools.has(record.id)
      ? 'active'
      : status.state
    const toolDiscoveryState = status.toolDiscoveryState ?? (this.registeredTools.has(record.id) ? 'complete' : 'unknown')
    return {
      ...record,
      runtimeState,
      runtimeError: runtimeState === 'active' ? '' : status.error,
      missingEnvironmentVariables: [...status.missingEnvironmentVariables],
      tools,
      toolDetails: this.toolDetails(record.serverName, tools),
      toolDiscoveryState,
      ...(status.toolDiscoveryStartedAt ? { toolDiscoveryStartedAt: status.toolDiscoveryStartedAt } : {}),
      ...(status.toolDiscoveryCompletedAt ? { toolDiscoveryCompletedAt: status.toolDiscoveryCompletedAt } : {}),
      ...(status.lastSuccessfulToolCount !== undefined ? { lastSuccessfulToolCount: status.lastSuccessfulToolCount } : {}),
      ...(status.lastDiscoveryError ? { lastDiscoveryError: status.lastDiscoveryError } : {}),
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
        if (!record.enabled || version === undefined || this.reconcileVersions.get(record.id) !== version || !(this.fibers.has(record.id) || this.managed.has(record.id))) continue
      const status = this.statuses.get(record.id)
      if (status?.state === 'starting' || status?.state === 'discovering-tools' || status?.state === undefined) {
        const names = this.registeredTools.get(record.id) ?? []
        this.statuses.set(record.id, { state: record.serverName === RDATALINUX_SERVER_NAME && names.length === 0 ? 'active-with-zero-tools' : 'active', error: '', missingEnvironmentVariables: [], ...(record.serverName === RDATALINUX_SERVER_NAME ? { toolDiscoveryState: 'complete' as const, toolDiscoveryCompletedAt: new Date().toISOString(), lastSuccessfulToolCount: names.length } : {}) })
      }
    }
  }

  private indexMcpTools(serverName: string, names: string[]): void {
    const visibleNames = names.filter(name => name !== RETIRED_R_PROJECT_TOOL)
    const schemas = new Map(this.ctx.tools.schemas().filter(schema => visibleNames.includes(schema.name)).map(schema => [schema.name, schema]))
    for (const name of visibleNames) {
      const schema = schemas.get(name)
      const description = typeof schema?.description === 'string' ? schema.description.slice(0, 400) : name.replace(`mcp__${serverName}__`, '').replaceAll('_', ' ')
      this.mcpToolIndex.set(name, { server: serverName, name, description })
    }
  }

  private cacheSignature(record: McpServerRecord): string {
    let endpoint = ''
    if (record.url) {
      try { endpoint = new URL(record.url).href } catch { endpoint = 'invalid-url' }
    }
    return createHash('sha256').update(JSON.stringify([
      record.id, record.serverName, record.transport, endpoint, record.command, record.args, record.cwd,
      Object.entries(record.envRefs).sort(([left], [right]) => left.localeCompare(right)),
      Object.entries(record.headerRefs).sort(([left], [right]) => left.localeCompare(right)),
    ])).digest('hex')
  }

  private async loadMcpToolCache(): Promise<void> {
    const path = join(process.env.DSH_HOME?.trim() || join(homedir(), '.dsh'), 'zerowall-mcp-tool-index.json')
    const cache = await readFile(path, 'utf8').then(JSON.parse).catch(error => {
      if (error.code !== 'ENOENT') this.ctx.logger.warn(`zerowall-mcp: tool index cache unavailable: ${redactError(error)}`)
      return undefined
    }) as { schema?: number; servers?: Record<string, { signature?: string; schemaHash?: string; tools?: { name?: string; description?: string }[] }> } | undefined
    if (cache?.schema !== 1 || !cache.servers || typeof cache.servers !== 'object') return
    for (const record of this.projects().listMcpServers()) {
      const entry = cache.servers[record.id]
      if (!entry || entry.signature !== this.cacheSignature(record) || !/^[a-f0-9]{64}$/u.test(entry.schemaHash ?? '') || !Array.isArray(entry.tools)) continue
      const tools = entry.tools.filter(tool => tool !== null && typeof tool === 'object' && typeof tool.name === 'string' && tool.name !== RETIRED_R_PROJECT_TOOL && tool.name.startsWith(`mcp__${record.serverName}__`) && typeof tool.description === 'string')
        .slice(0, 500).map(tool => ({ name: tool.name!, description: tool.description!.slice(0, 400) }))
      for (const tool of tools) this.mcpToolIndex.set(tool.name, { server: record.serverName, ...tool })
    }
  }

  private async cacheMcpServer(record: McpServerRecord): Promise<void> {
    const schemas = this.ctx.tools.schemas().filter(schema => schema.name.startsWith(`mcp__${record.serverName}__`) && schema.name !== RETIRED_R_PROJECT_TOOL)
      .sort((left, right) => left.name.localeCompare(right.name))
    const tools = schemas.slice(0, 500).map(schema => ({ name: schema.name, description: (schema.description ?? '').slice(0, 400) }))
    const signature = this.cacheSignature(record)
    const schemaHash = createHash('sha256').update(JSON.stringify(schemas)).digest('hex')
    const path = join(process.env.DSH_HOME?.trim() || join(homedir(), '.dsh'), 'zerowall-mcp-tool-index.json')
    const persist = this.toolCacheWrite.then(async () => {
      const existing = await readFile(path, 'utf8').then(JSON.parse).catch(error => { if (error.code !== 'ENOENT') throw error; return { schema: 1, servers: {} } }) as { schema: number; servers: Record<string, unknown> }
      const valid = existing && typeof existing === 'object' && existing.schema === 1 && existing.servers && typeof existing.servers === 'object' && !Array.isArray(existing.servers) ? existing : { schema: 1, servers: {} as Record<string, unknown> }
      valid.servers[record.id] = { signature, schemaHash, tools }
      await mkdir(dirname(path), { recursive: true })
      const temporary = path + '.' + randomUUID() + '.tmp'
      await writeFile(temporary, JSON.stringify(valid, null, 2) + '\n', { mode: 0o600 })
      await rename(temporary, path)
    })
    this.toolCacheWrite = persist.catch(error => { this.ctx.logger.warn(`zerowall-mcp: tool index cache write failed: ${redactError(error)}`) })
    await this.toolCacheWrite
  }

  private clearMcpToolIndex(serverName: string): void {
    for (const [name, entry] of this.mcpToolIndex) if (entry.server === serverName) this.mcpToolIndex.delete(name)
  }

  private toolNames(serverName: string): string[] {
    const prefix = `mcp__${serverName}__`
    return this.ctx.tools.schemas()
      .map(schema => schema.name)
      .filter(name => name.startsWith(prefix) && name !== RETIRED_R_PROJECT_TOOL)
      .sort((left, right) => left.localeCompare(right))
  }

  private toolDetails(serverName: string, names: string[]): McpToolDetail[] {
    const allowed = new Set(names)
    return this.ctx.tools.schemas()
      .filter(schema => allowed.has(schema.name) && schema.name.startsWith(`mcp__${serverName}__`))
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(schema => {
        const bounded = sanitizeMcpToolSchema(schema.parameters)
        return {
          name: schema.name,
          description: schema.description.slice(0, 2_000),
          inputSchema: bounded.schema,
          ...(bounded.truncated ? { schemaTruncated: true } : {}),
        }
      })
  }

  private async disposeOne(id: string): Promise<void> {
    const prior = this.projects().getMcpServer(id)
    if (prior) this.clearMcpToolIndex(prior.serverName)
    await this.managed.remove(id)
    const fiber = this.fibers.get(id)
    if (fiber === undefined) return
    this.fibers.delete(id)
    this.registeredTools.delete(id)
    this.readyVersions.delete(id)
    await fiber.dispose()
  }

  private async disposeAll(): Promise<void> {
    await this.managed.dispose()
    await Promise.allSettled([...this.fibers.keys()].map(id => this.disposeOne(id)))
  }
}

function dshHome(): string { return resolve(process.env.DSH_HOME ?? join(homedir(), '.dsh')) }
function defaultMcpMarkerPath(): string { return join(dshHome(), 'zerowall-mcp-defaults-v1.json') }

/** Keep remotely advertised schemas useful while imposing a strict DTO bound. */
export function sanitizeMcpToolSchema(value: unknown): { schema: McpSchemaObject; truncated: boolean } {
  const limits = { depth: 8, nodes: 500, bytes: 48_000 }
  let nodes = 0
  let truncated = false
  const visit = (candidate: unknown, depth: number): McpSchemaValue | undefined => {
    nodes++
    if (nodes > limits.nodes || depth > limits.depth) { truncated = true; return '[truncated]' }
    if (candidate === null || typeof candidate === 'boolean') return candidate
    if (typeof candidate === 'number') {
      if (Number.isFinite(candidate)) return candidate
      truncated = true
      return undefined
    }
    if (typeof candidate === 'string') {
      const result = truncateJsonString(candidate, 4_096)
      if (result !== candidate) truncated = true
      return result
    }
    if (Array.isArray(candidate)) {
      const result: McpSchemaValue[] = []
      for (const item of candidate.slice(0, 100)) {
        if (nodes >= limits.nodes) { truncated = true; break }
        result.push(visit(item, depth + 1) ?? null)
      }
      if (candidate.length > result.length) truncated = true
      return result
    }
    if (typeof candidate === 'object') {
      const result: McpSchemaObject = {}
      for (const [key, entry] of Object.entries(candidate as Record<string, unknown>).slice(0, 200)) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') { truncated = true; continue }
        if (nodes >= limits.nodes) { truncated = true; break }
        // Bound the JSON-encoded key, not its UTF-16 length. Control characters
        // and quotes can expand substantially when JSON.stringify escapes them.
        const boundedKey = truncateJsonString(key, 128)
        if (boundedKey.length !== key.length) truncated = true
        if (Object.hasOwn(result, boundedKey)) { truncated = true; continue }
        const projected = visit(entry, depth + 1)
        if (projected !== undefined) result[boundedKey] = projected
      }
      if (Object.keys(candidate).length > Object.keys(result).length) truncated = true
      return result
    }
    truncated = true
    return undefined
  }
  const visited = visit(value, 0)
  const sanitized = visited
  if (sanitized === null || typeof sanitized !== 'object' || Array.isArray(sanitized)) return { schema: {}, truncated: true }

  let schema = sanitized
  if (jsonByteLength(schema) <= limits.bytes) return { schema, truncated }

  // String values such as descriptions and examples can dominate a remotely
  // advertised schema. Compact them in progressively smaller JSON-byte
  // budgets, then measure the exact final serialization after escaping UTF-8.
  for (const stringBudget of [2_048, 1_024, 512, 256, 128, 64, 32]) {
    schema = compactSchemaStrings(schema, stringBudget)
    truncated = true
    if (jsonByteLength(schema) <= limits.bytes) return { schema, truncated }
  }

  // The remaining size can only come from structural keys/values. Return a
  // small, valid schema summary rather than allowing an oversized DTO through.
  const summary: McpSchemaObject = { 'x-zerowall-truncated': true }
  if (typeof sanitized.type === 'string') {
    summary.type = truncateJsonString(sanitized.type, 128)
  }
  if (jsonByteLength(summary) > limits.bytes) return { schema: {}, truncated: true }
  return { schema: summary, truncated: true }
}

/** Truncate a string by its JSON-encoded UTF-8 size without splitting code points. */
function truncateJsonString(value: string, maxJsonBytes: number): string {
  let result = ''
  let used = 2 // opening and closing quotes
  if (maxJsonBytes < used) return ''
  for (const character of value) {
    const encoded = JSON.stringify(character)
    const bytes = Buffer.byteLength(encoded, 'utf8') - 2
    if (used + bytes > maxJsonBytes) break
    result += character
    used += bytes
  }
  return result
}

function jsonByteLength(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value) ?? 'null', 'utf8')
}

function compactSchemaStrings(value: McpSchemaObject, maxJsonBytes: number): McpSchemaObject {
  const compact = (candidate: McpSchemaValue): McpSchemaValue => {
    if (typeof candidate === 'string') return truncateJsonString(candidate, maxJsonBytes)
    if (Array.isArray(candidate)) return candidate.map(compact)
    if (candidate !== null && typeof candidate === 'object') {
      const result: McpSchemaObject = {}
      for (const [key, entry] of Object.entries(candidate)) result[key] = compact(entry)
      return result
    }
    return candidate
  }
  return compact(value) as McpSchemaObject
}

/** CA overrides that make `requests`/`pip` abandon their bundled certificates. */
const MANAGED_CA_ENV_KEYS = ['SSL_CERT_FILE', 'REQUESTS_CA_BUNDLE', 'CURL_CA_BUNDLE', 'PIP_CERT'] as const

/**
 * A CA path is only usable when it is a real, non-empty file. A stale value
 * left by a previous runtime layout (for example
 * ``slots\\b\\bio-tools\\python\\site-packages\\certifi\\cacert.pem``) still
 * exists as a string but resolves to nothing, and `requests` raises
 * "Could not find a suitable TLS CA certificate bundle" before any request is
 * attempted. Symlinks are rejected so a junction pointing at a removed slot
 * cannot masquerade as a bundle.
 */
function usableCaFile(path: string | undefined): path is string {
  if (!path) return false
  try {
    if (!existsSync(path)) return false
    const info = statSync(path)
    if (!info.isFile() || info.size === 0) return false
    return !lstatSync(path).isSymbolicLink()
  } catch {
    return false
  }
}

function publicCaBundlePath(): string {
  const appData = process.env.APPDATA?.trim() || join(homedir(), 'AppData', 'Roaming')
  return join(appData, 'zerowall-science', 'certificates', 'zerowall-public-ca.pem')
}

/**
 * Write the application-owned public CA bundle, atomically. An earlier version
 * wrote in place, so a crash mid-write left a truncated PEM that later checks
 * accepted on `size > 0` alone; the temp file plus rename means the bundle is
 * either the previous good copy or the complete new one.
 */
function ensurePublicCaBundle(target: string): boolean {
  if (usableCaFile(target)) return true
  const temporary = `${target}.${process.pid}.tmp`
  try {
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(temporary, `${rootCertificates.join('\n')}\n`, 'utf8')
    if (!usableCaFile(temporary)) return false
    renameSync(temporary, target)
  } catch {
    try { rmSync(temporary, { force: true }) } catch { /* best effort */ }
    return false
  }
  return usableCaFile(target)
}

export function resolveMcpConfig(record: McpServerRecord, environment: NodeJS.ProcessEnv, hostCwd = process.cwd(), enabledTools?: string[], candidate?: ManagedEnvironmentRecord): ResolvedMcpConfig {
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
    ...(enabledTools === undefined ? {} : { enabledTools }),
  }
  const launch = record.transport === 'stdio' ? resolveStdioLaunch(record, hostCwd) : undefined
  if (candidate?.root && record.command.startsWith('zerowall-managed:')) {
    const fixed = configuredPythonRuntimeRoot()
    if (!fixed || resolve(candidate.root) !== resolve(fixed) || candidate.generation) throw new Error('PYTHON_FIXED_PATH_REQUIRED: MCP cannot launch a slot or candidate runtime.')
  }
  if (record.transport === 'stdio' && record.command === 'zerowall-managed:bio-tools') {
    const managed = candidate ?? managedEnvironmentRecord()
    const root = managed?.root
    if (root) {
      // Every managed child uses the one application-wide Python directory.
      // Legacy overlay paths are deliberately ignored after migration so a
      // stale profile cannot shadow the signed shared site-packages.
      const sitePackages = managedPythonSitePackages(managed, candidate !== undefined)
      values.PYTHONPATH = sitePackages
      values.PYTHONNOUSERSITE = '1'
      // The stdio transport merges these values over the inherited parent
      // environment (`{ ...scrubbedParentEnv(), ...extra }`). Assigning only on
      // success left the keys absent from `values`, so a stale CA path that the
      // Electron process itself had inherited survived the spread verbatim and
      // reached Python — the reported `slots\b\...\certifi\cacert.pem` failure.
      // Set or delete, never skip: an absent key is an inherited key.
      const candidateCa = join(sitePackages, 'certifi', 'cacert.pem')
      const fallbackCa = publicCaBundlePath()
      const caFile = usableCaFile(candidateCa) ? candidateCa : ensurePublicCaBundle(fallbackCa) ? fallbackCa : undefined
      for (const key of MANAGED_CA_ENV_KEYS) {
        if (caFile === undefined) delete values[key]
        else values[key] = caFile
      }
    }
  }
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

type ManagedEnvironmentRecord = { root?: string; runtimeRoot?: string; runtimeLayout?: { relativeExecutable?: string; relativeSitePackages?: string }; generation?: boolean; health?: string; version?: string; environmentVersion?: string; contentRevision?: number; archiveSha256?: string; mode?: string; manifest?: { python?: { version?: string; relativeExecutable?: string; relativeSitePackages?: string; bootstrapOnly?: boolean } } }

/**
 * The signed manifest decides where the interpreter lives. An earlier build
 * fell back to the flat ``bio-tools/python/python.exe`` layout whenever the
 * manifest was absent; that layout has no ``Lib`` level and no longer exists in
 * current environments, so the fallback silently produced a path that resolved
 * to nothing and the failure only surfaced much later as an interpreter error.
 * Refusing here names the real problem at the point of use.
 */
function managedPythonExecutable(_record: ManagedEnvironmentRecord): string {
  const root = configuredPythonRuntimeRoot()
  if (!root) throw new Error('PYTHON_ENVIRONMENT_UNAVAILABLE: fixed runtime is not configured.')
  if (_record.root && resolve(_record.root) !== resolve(root) || _record.generation) throw new Error('PYTHON_FIXED_PATH_REQUIRED: stale MCP runtime.')
  return join(root, 'python.exe')
}

function managedCandidatePythonExecutable(record: ManagedEnvironmentRecord): string {
  // MCP must never execute an installation candidate or an old slot.
  return managedPythonExecutable(record)
}

function managedPythonSitePackages(record: ManagedEnvironmentRecord, candidate = false): string {
  const executable = candidate ? managedCandidatePythonExecutable(record) : managedPythonExecutable(record)
  const declared = record.manifest?.python?.relativeSitePackages
  if (declared !== (record.manifest?.python?.relativeExecutable === 'python.exe' ? 'Lib/site-packages' : 'Python/Lib/site-packages')) throw new Error('Managed environment must use the shared Python package layout.')
  return join(dirname(executable), 'Lib', 'site-packages')
}
export function managedBioDependenciesReady(record: ManagedEnvironmentRecord, candidate = false): boolean {
  try { return existsSync(join(managedPythonSitePackages(record, candidate), 'mcp', '__init__.py')) }
  catch { return false }
}
let managedEnvironmentCache: { path: string; fileSignature: string; record: ManagedEnvironmentRecord | undefined } | undefined

function managedEnvironmentPath(): string | undefined {
  const root = process.env.ZEROWALL_PYTHON_MANAGEMENT_ROOT?.trim() || process.env.ZEROWALL_PYTHON_ROOT?.trim() || process.env.ZEROWALL_MCP_ENVIRONMENT_ROOT?.trim()
  return root ? join(root, 'current.json') : undefined
}

/** Cheap identity for the atomically replaced environment state file. */
export function managedEnvironmentFileSignature(): string {
  const path = managedEnvironmentPath()
  if (path === undefined) return 'disabled'
  try {
    const info = statSync(path, { bigint: true })
    const revision = join(dirname(path), 'revision.json')
    const content = existsSync(revision) ? readFileSync(revision, 'utf8') : ''
    return `${path}:${info.size}:${info.mtimeNs}:${content}`
  } catch {
    const root = configuredPythonRuntimeRoot()
    const info = root && existsSync(join(root, 'python.exe')) ? statSync(join(root, 'python.exe'), { bigint: true }) : undefined
    const revision = join(dirname(path), 'revision.json')
    return `${path}:missing:${info ? `${info.size}:${info.mtimeNs}` : 'no-python'}:${existsSync(revision) ? readFileSync(revision, 'utf8') : ''}`
  }
}

/** Parse the multi-megabyte environment record at most once per file generation. */
export function managedEnvironmentRecord(fileSignature = managedEnvironmentFileSignature()): ManagedEnvironmentRecord | undefined {
  const path = managedEnvironmentPath()
  if (path === undefined) return undefined
  if (managedEnvironmentCache?.path === path && managedEnvironmentCache.fileSignature === fileSignature) return managedEnvironmentCache.record
  let record: ManagedEnvironmentRecord | undefined
  const root = configuredPythonRuntimeRoot()
  if (root && existsSync(join(root, 'python.exe'))) {
    try {
      const saved = JSON.parse(readFileSync(path, 'utf8')) as ManagedEnvironmentRecord
      if (!saved.generation && resolve(saved.runtimeRoot ?? saved.root ?? '') === resolve(root)) record = saved
    } catch { /* pointerless runtime */ }
    record = { ...record, root, runtimeRoot: root, generation: false, health: 'ready', runtimeLayout: { relativeExecutable: 'python.exe', relativeSitePackages: 'Lib/site-packages' }, manifest: { python: { ...record?.manifest?.python, relativeExecutable: 'python.exe', relativeSitePackages: 'Lib/site-packages' } } }
  }
  managedEnvironmentCache = { path, fileSignature, record }
  return record
}

function managedEnvironmentSignature(record = managedEnvironmentRecord()): string {
  return record === undefined
    ? 'missing'
    : `${record.health ?? 'unknown'}:${record.environmentVersion ?? record.version ?? 'unknown'}:${record.contentRevision ?? ''}:${record.archiveSha256?.slice(0, 12) ?? ''}:${record.root ?? ''}:${managedEnvironmentFileSignature()}`
}

function managedEnvironmentReady(serverName: string): boolean {
  const record = managedEnvironmentRecord()
  const root = record?.root
  if (!root || record?.health !== 'ready') return false
  const bioToolsRoot = bundledManagedRoot('ZEROWALL_BIO_TOOLS_ROOT', root, 'bio-tools')
  const ketcherRoot = bundledManagedRoot('ZEROWALL_KETCHER_ROOT', root, 'ketcher-chemistry')
  const sciRoot = bundledManagedRoot('ZEROWALL_SCI_ROOT', root, 'sci')
  if (serverName === 'zerowall_managed_ketcher') return existsSync(join(ketcherRoot, 'server.js'))
  if (serverName === 'zerowall_managed_scimaster') return existsSync(join(sciRoot, 'dist', 'mcp.cjs')) && existsSync(join(sciRoot, 'zerowall-mcp-launcher.cjs'))
  try { return managedBioDependenciesReady(record) && existsSync(managedPythonExecutable(record)) && existsSync(join(bioToolsRoot, 'run_server.py')) }
  catch { return false }
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
  const record = managedEnvironmentRecord()
  const root = configuredPythonRuntimeRoot()
  if (!root || !['zerowall-managed:bio-tools', 'zerowall-managed:ketcher', 'zerowall-managed:scimaster'].includes(command)) return undefined
  if (command === 'zerowall-managed:bio-tools') {
    const bioToolsRoot = bundledManagedRoot('ZEROWALL_BIO_TOOLS_ROOT', root, 'bio-tools')
    return { command: managedPythonExecutable(record ?? { root }), args: [join(bioToolsRoot, 'run_server.py'), 'mcp_bio'], cwd: bioToolsRoot }
  }
  if (command === 'zerowall-managed:ketcher') {
    const ketcherRoot = bundledManagedRoot('ZEROWALL_KETCHER_ROOT', root, 'ketcher-chemistry')
    return { command: process.execPath, args: [join(ketcherRoot, 'server.js')], cwd: ketcherRoot }
  }
  const sciRoot = bundledManagedRoot('ZEROWALL_SCI_ROOT', root, 'sci')
  return { command: process.execPath, args: [join(sciRoot, 'zerowall-mcp-launcher.cjs')], cwd: sciRoot }
}

function bundledManagedRoot(variable: string, managedRoot: string, fallbackDirectory: string): string {
  const bundled = process.env[variable]?.trim()
  if (bundled && existsSync(bundled)) return bundled
  return join(managedRoot, fallbackDirectory)
}

export function redactError(error: unknown): string {
  const messages: string[] = []
  let current: unknown = error
  for (let depth = 0; depth < 4 && current !== undefined; depth += 1) {
    messages.push(current instanceof Error ? current.message : String(current))
    current = current instanceof Error ? current.cause : undefined
  }
  const diagnostic = messages.join(': ')
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9+/=_\-.~]+/gi, '$1 [redacted]')
    .replace(/(authorization|api[-_ ]?key|token|secret|password)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1=[redacted]')
    .replace(/https?:\/\/[^\s)\]}]+/gi, redactUrl)
  // Python tracebacks put the actual ImportError at the end. Keep the
  // transport error and that tail after redaction, even for long tracebacks.
  return diagnostic.length <= 4000 ? diagnostic : `${diagnostic.slice(0, 500)}\n[diagnostic truncated]\n${diagnostic.slice(-3400)}`
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
  if (!ctx.get('zerowallMcpConfigurationStore')) {
    ctx.provide('zerowallMcpConfigurationStore', new McpConfigurationStoreService(ctx))
  }
  ctx.plugin(ZeroWallMcpService)
}

export default { apply }
