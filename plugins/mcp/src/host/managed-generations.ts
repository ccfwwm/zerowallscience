import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition, ToolExecution } from '@deepseek-ai/dsh-tools'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { syncTools } from '@deepseek-ai/dsh-mcp-client/src/tools.ts'
import type { StdioConfig } from '@deepseek-ai/dsh-mcp-client'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { KetcherBridge } from './ketcher-bridge.js'

interface Generation { client: Client; definitions: Map<string, ToolDefinition>; references: number; retired: boolean; lease?: string; snapshot?: string | undefined }
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
    const transport = new StdioClientTransport({ command: config.command, args: config.args, cwd: config.cwd, env: { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)), ...config.env, ELECTRON_RUN_AS_NODE: '1' }, stderr: 'pipe' })
    const definitions = new Map<string, ToolDefinition>()
    const generation: Generation = { client, definitions, references: 0, retired: false, snapshot }
    try {
      await client.connect(transport)
      transport.stderr?.on('data', () => undefined)
      // Reuse the established MCP schema/content/attachment bridge. Capture definitions
      // privately until the complete candidate has initialized successfully.
      const tools = new Proxy(this.ctx.tools, { get: (target, property) => property === 'register'
        ? (definition: ToolDefinition) => { definitions.set(definition.name, definition); return () => definitions.delete(definition.name) }
        : Reflect.get(target, property) })
      const context = new Proxy(this.ctx, { get: (target, property) => property === 'tools' ? tools : Reflect.get(target, property) })
      await syncTools(client, context, { registrationFailure: 'throw', serverName: config.serverName, toolCallTimeoutMs: config.toolCallTimeoutMs }, new Map())
      const root = process.env.ZEROWALL_PYTHON_ROOT ?? process.env.ZEROWALL_MCP_ENVIRONMENT_ROOT
      if (root && snapshot) {
        await mkdir(join(root, 'leases'), { recursive: true })
        generation.lease = join(root, 'leases', `${process.pid}-${randomUUID()}.json`)
        await writeFile(generation.lease, JSON.stringify({ pid: process.pid, snapshot, kind: 'mcp', createdAt: new Date().toISOString() }))
      }
      this.generations.add(generation)
      return generation
    } catch (error) { await client.close().catch(() => undefined); throw error }
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
              if (name.startsWith('mcp__zerowall_managed_ketcher__') && process.env.ZEROWALL_KETCHER_ROOT) return await this.ketcher.execute(selected.client, name.slice('mcp__zerowall_managed_ketcher__'.length), args, exec)
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
    if (generation.lease) await rm(generation.lease, { force: true }).catch(() => undefined)
  }
}
