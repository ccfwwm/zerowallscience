import type { Context, Fiber } from '@deepseek-ai/cordis'
import * as McpClient from '@deepseek-ai/dsh-mcp-client'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
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

export type McpRuntimeState = 'disabled' | 'blocked' | 'active' | 'error'

export interface McpServerDto extends McpServerRecord {
  runtimeState: McpRuntimeState
  runtimeError: string
  missingEnvironmentVariables: string[]
}

export interface CreateMcpServerRequest {
  name: string
  serverName: string
  transport: McpTransport
  enabled?: boolean
  command?: string
  args?: string[]
  cwd?: string
  envRefs?: Record<string, string>
  url?: string
  headerRefs?: Record<string, string>
  toolCallTimeoutMs?: number
  failOnStartupError?: boolean
  reconnect?: Partial<McpReconnectPolicy>
}

export interface UpdateMcpServerChanges {
  name?: string
  serverName?: string
  transport?: McpTransport
  enabled?: boolean
  command?: string
  args?: string[]
  cwd?: string
  envRefs?: Record<string, string>
  url?: string
  headerRefs?: Record<string, string>
  toolCallTimeoutMs?: number
  failOnStartupError?: boolean
  reconnect?: Partial<McpReconnectPolicy>
}

export interface UpdateMcpServerRequest {
  id: string
  changes: UpdateMcpServerChanges
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
}

export class ZeroWallMcpService extends TypertRemoteService {
  static inject = ['zerowallProjects', 'tools']

  private readonly fibers = new Map<string, Fiber>()
  private readonly statuses = new Map<string, RuntimeStatus>()
  private operation: Promise<void> = Promise.resolve()

  constructor(ctx: Context) {
    super(ctx, 'zerowallMcp')
    this.operation = this.initialize()
    ctx.effect(() => () => this.disposeAll(), 'zerowall-mcp: dispose dynamic clients')
  }

  @Remote('list')
  list(): Promise<McpServerDto[]> {
    return this.exclusive(async () => this.projects().listMcpServers().map(record => this.dto(record)))
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

  private exclusive<T>(task: () => Promise<T> | T): Promise<T> {
    const run = this.operation.then(task, task)
    this.operation = run.then(() => undefined, () => undefined)
    return run
  }

  private async reconcileAll(): Promise<void> {
    for (const record of this.projects().listMcpServers()) await this.reconcile(record)
  }

  private async initialize(): Promise<void> {
    await this.seedBundledServers()
    await this.reconcileAll()
  }

  private async seedBundledServers(): Promise<void> {
    if (process.env.ZEROWALL_DISABLE_DEFAULT_MCP === '1') return
    const marker = defaultMcpMarkerPath()
    try {
      await readFile(marker, 'utf8')
      return
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    const workspace = defaultMcpWorkspace()
    await mkdir(workspace, { recursive: true })
    if (!this.projects().listMcpServers().some(server => server.serverName === 'zerowall_filesystem')) {
      this.projects().createMcpServer({
        name: '科研工作区文件',
        serverName: 'zerowall_filesystem',
        transport: 'stdio',
        enabled: true,
        command: process.execPath,
        args: [bundledFilesystemServer(), workspace],
        cwd: workspace,
        failOnStartupError: false,
      })
    }
    await mkdir(dirname(marker), { recursive: true })
    await writeFile(marker, '{"version":1}\n', 'utf8')
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
    await this.disposeOne(record.id)
    if (!record.enabled) {
      this.statuses.set(record.id, { state: 'disabled', error: '', missingEnvironmentVariables: [] })
      return
    }
    const resolved = resolveMcpConfig(record, process.env)
    if (resolved.config === undefined) {
      this.statuses.set(record.id, {
        state: 'blocked',
        error: 'Required environment variables are not available to the Host.',
        missingEnvironmentVariables: resolved.missingEnvironmentVariables,
      })
      return
    }
    try {
      const fiber = this.ctx.plugin(McpClient, resolved.config as McpClient.Config)
      await fiber
      this.fibers.set(record.id, fiber)
      this.statuses.set(record.id, { state: 'active', error: '', missingEnvironmentVariables: [] })
    } catch (error) {
      this.statuses.set(record.id, {
        state: 'error',
        error: redactError(error),
        missingEnvironmentVariables: [],
      })
    }
  }

  private dto(record: McpServerRecord): McpServerDto {
    const status = this.statuses.get(record.id) ?? { state: 'disabled' as const, error: '', missingEnvironmentVariables: [] }
    return {
      ...record,
      runtimeState: status.state,
      runtimeError: status.error,
      missingEnvironmentVariables: [...status.missingEnvironmentVariables],
    }
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
function defaultMcpWorkspace(): string { return resolve(process.env.ZEROWALL_DEFAULT_MCP_ROOT ?? join(dshHome(), 'research-workspace')) }
function bundledFilesystemServer(): string {
  const require = createRequire(import.meta.url)
  return join(dirname(require.resolve('@modelcontextprotocol/server-filesystem/package.json')), 'dist', 'index.js')
}

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
