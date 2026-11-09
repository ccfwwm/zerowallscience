import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition, ToolExecution } from '@deepseek-ai/dsh-tools'
import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { createMcpToolDefinition } from '@deepseek-ai/dsh-mcp-client'
import type { StdioConfig } from '@deepseek-ai/dsh-mcp-client'
import { createHash } from 'node:crypto'
import { KetcherBridge } from './ketcher-bridge.js'

interface Generation { client: Client; definitions: Map<string, ToolDefinition>; references: number; retired: boolean; snapshot?: string | undefined }
/** Stable public tool names dispatch to immutable generations. Retiring never kills an in-flight call. */
export class ManagedGenerations {
  readonly ketcher = new KetcherBridge()
  private staged = new Map<string, { snapshot: string; generation: Generation; expires: number }>()
  private active = new Map<string, Generation>()
  private registrations = new Map<string, Map<string, () => void>>()
  private generations = new Set<Generation>()
  constructor(private ctx: Context, private currentSnapshot: () => string | undefined = () => undefined) {}
  async stage(id: string, snapshot: string, generation: Generation): Promise<void> {
    const active = this.active.get(id)
    if (active) {
      const contract = (value: Generation) => JSON.stringify([...value.definitions].sort(([a], [b]) => a.localeCompare(b)))
      // Existing callers hold validated schemas. Reject a changed contract before
      // acknowledging activation rather than route old-schema calls to a new API.
      if (contract(active) !== contract(generation)) throw new Error(`MCP ${id} 的工具接口发生变化，无法安全热切换；当前环境保持可用。`)
    }
    const previous = this.staged.get(id)
    if (previous) await this.close(previous.generation)
    this.staged.set(id, { snapshot, generation, expires: Date.now() + 5 * 60_000 })
  }
  commitStaged(): void {
    for (const [id, staged] of this.staged) {
      if (staged.snapshot === this.currentSnapshot()) { this.activate(id, staged.generation); this.staged.delete(id) }
      else if (Date.now() > staged.expires) { this.staged.delete(id); void this.close(staged.generation) }
    }
  }
  has(id: string): boolean { return this.active.has(id) }
  snapshot(id: string): string | undefined { return this.active.get(id)?.snapshot }
  names(id: string): string[] { return [...(this.active.get(id)?.definitions.keys() ?? [])].sort() }
  async prepare(config: StdioConfig, snapshot?: string): Promise<Generation> {
    const client = new Client({ name: 'zerowall-managed', version: '1' })
    const parent = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined && !['PYTHONHOME', 'PYTHONPATH', 'VIRTUAL_ENV', 'CONDA_PREFIX'].includes(entry[0])))
    const transport = new StdioClientTransport({ command: config.command, args: config.args, cwd: config.cwd, env: { ...parent, ...config.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', ELECTRON_RUN_AS_NODE: '1' }, stderr: 'pipe' })
    const definitions = new Map<string, ToolDefinition>()
    const generation: Generation = { client, definitions, references: 0, retired: false, snapshot }
    let stderr = ''
    let phase = 'initialize'
    transport.stderr?.on('data', chunk => { stderr = (stderr + String(chunk)).slice(-8_000) })
    try {
      await client.connect(transport)
      phase = 'tools/list'
      const response = client.getServerCapabilities()?.tools === undefined ? { tools: [] } : await client.listTools(undefined, { cacheMode: 'refresh' })
      for (const tool of response.tools) {
        const joined = 'mcp__' + config.serverName + '__' + tool.name
        const normalized = joined.replace(/[^A-Za-z0-9_-]/g, '_')
        const digest = createHash('sha256').update(config.serverName + '\0' + tool.name).digest('hex').slice(0, 12)
        const name = normalized === joined && joined.length <= 64 ? joined : normalized.slice(0, 51) + '_' + digest
        if (definitions.has(name)) throw new Error('MCP server listed duplicate tool: ' + tool.name)
        definitions.set(name, createMcpToolDefinition(this.ctx, {
          name, rawName: tool.name, description: tool.description ?? '', inputSchema: tool.inputSchema,
          outputSchema: tool.outputSchema, taskRequired: tool.execution?.taskSupport === 'required',
          call: (args, execution) => client.callTool({ name: tool.name, arguments: args }, { signal: execution.signal, timeout: config.toolCallTimeoutMs, toolDefinition: tool }),
        }))
      }
      this.generations.add(generation)
      return generation
    } catch (error) {
      await client.close().catch(() => undefined)
      const diagnostic = `${error instanceof Error ? error.message : String(error)}${stderr ? `\nMCP stderr: ${stderr}` : ''}`.replace(/\b(Bearer|Basic)\s+\S+/giu, '$1 [redacted]')
        .replace(/(authorization|api[-_ ]?key|token|secret|password)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/giu, '$1=[redacted]')
        .replace(/https?:\/\/[^\s)\]}]+/giu, '[redacted-url]')
      throw new Error(`MCP ${config.serverName} validation failed (${phase}): ${diagnostic}`, { cause: error })
    }
  }
  activate(id: string, generation: Generation): string[] {
    const previous = this.active.get(id)
    const disposers = this.registrations.get(id) ?? new Map<string, () => void>()
    const added: string[] = []
    try {
      for (const [name, definition] of generation.definitions) if (!disposers.has(name)) {
        const executions = new WeakMap<ToolExecution, ToolDefinition>()
        const wrapper: ToolDefinition = { ...definition,
          execute: async (args, exec) => {
            this.commitStaged()
            const selected = this.active.get(id)
            const target = selected?.definitions.get(name)
            if (!selected || !target) throw new Error('该工具在当前环境不可用。')
            selected.references++; executions.set(exec, target)
            try {
              if (name.startsWith('mcp__zerowall_managed_ketcher__')) return await this.ketcher.execute(selected.client, name.slice('mcp__zerowall_managed_ketcher__'.length), args, exec)
              return await target.execute(args, exec)
            }
            finally { selected.references--; if (selected.retired && selected.references === 0) void this.close(selected) }
          },
          finalizeContent: (exec, result) => executions.get(exec)?.finalizeContent?.(exec, result),
        }
        disposers.set(name, this.ctx.tools.register(wrapper)); added.push(name)
      }
    } catch (error) { for (const name of added) { disposers.get(name)?.(); disposers.delete(name) }; void this.close(generation); throw error }
    // A synchronous map swap is the dispatch commit point. No await and no registry gap.
    this.active.set(id, generation); this.registrations.set(id, disposers)
    for (const [name, dispose] of disposers) if (!generation.definitions.has(name)) { dispose(); disposers.delete(name) }
    if (previous) { previous.retired = true; if (previous.references === 0) void this.close(previous) }
    return [...generation.definitions.keys()].sort()
  }
  async discard(generation: Generation): Promise<void> {
    for (const [id, value] of this.staged) if (value.generation === generation) this.staged.delete(id)
    await this.close(generation)
  }
  async remove(id: string): Promise<void> {
    for (const dispose of this.registrations.get(id)?.values() ?? []) dispose()
    this.registrations.delete(id)
    const generation = this.active.get(id); this.active.delete(id)
    if (generation) { generation.retired = true; if (!generation.references) await this.close(generation) }
  }
  async dispose(): Promise<void> {
    for (const id of [...this.active.keys()]) await this.remove(id)
    await Promise.allSettled([...this.generations].map(generation => this.close(generation)))
  }
  private async close(generation: Generation): Promise<void> {
    if (!this.generations.delete(generation)) return
    await generation.client.close().catch(() => undefined)
  }
}
