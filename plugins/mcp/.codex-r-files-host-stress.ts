import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import ZeroWallProjectsService from '../projects/src/host/index.js'
import ZeroWallMcpService from './src/host/index.js'

const durationMs = Number(process.env.STRESS_DURATION_MS ?? 600_000)
const environmentRoot = process.env.STRESS_ENVIRONMENT_ROOT
if (!process.env.R_PLATFORM_MCP_AUTHORIZATION || !environmentRoot) {
  throw new Error('R_PLATFORM_MCP_AUTHORIZATION and STRESS_ENVIRONMENT_ROOT are required')
}

const root = mkdtempSync(join(tmpdir(), 'zerowall-r-files-stress-'))
process.env.ZEROWALL_RESEARCH_DB = join(root, 'zerowall-research.sqlite')
process.env.DSH_HOME = join(root, 'harness')
process.env.ZEROWALL_MCP_ENVIRONMENT_ROOT = environmentRoot
process.env.ZEROWALL_MCP_ENVIRONMENT_POLL_MS = '100'

const ctx = new Context()
const agent = { session: { header: { cwd: root }, snapshotEvents: () => [], append: () => undefined } } as any
let calls = 0
let schemaAssemblies = 0
let maxCatalogMs = 0
let totalCatalogMs = 0
let startHeap = 0

function memory(label: string): void {
  globalThis.gc?.()
  const used = process.memoryUsage()
  console.log(JSON.stringify({
    label,
    elapsed_s: Math.round((performance.now() - startedAt) / 100) / 10,
    calls,
    schema_assemblies: schemaAssemblies,
    heap_mb: Math.round(used.heapUsed / 1024 / 1024 * 10) / 10,
    heap_delta_mb: Math.round((used.heapUsed - startHeap) / 1024 / 1024 * 10) / 10,
    rss_mb: Math.round(used.rss / 1024 / 1024 * 10) / 10,
    catalog_avg_ms: calls === 0 ? 0 : Math.round(totalCatalogMs / calls * 10) / 10,
    catalog_max_ms: Math.round(maxCatalogMs * 10) / 10,
  }))
}

const startedAt = performance.now()
try {
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(ZeroWallProjectsService)
  await ctx.plugin(ZeroWallMcpService)
  const configured = (await ctx.zerowallMcp.list()).find(item => item.serverName === 'rmcp')
  if (configured !== undefined && !configured.enabled) {
    await ctx.zerowallMcp.update({ id: configured.id, changes: { enabled: true } })
  }
  const activeDeadline = Date.now() + 20_000
  while ((await ctx.zerowallMcp.list()).find(item => item.serverName === 'rmcp')?.runtimeState !== 'active') {
    if (Date.now() >= activeDeadline) throw new Error('rmcp did not become active')
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  const visible = ctx.tools.schemas().map(tool => tool.name)
  if (!visible.includes('r_files') || visible.includes('mcp__rmcp__r_files')) {
    throw new Error(`unexpected model tool surface: ${visible.filter(name => name.includes('r_files')).join(',')}`)
  }

  globalThis.gc?.()
  startHeap = process.memoryUsage().heapUsed
  memory('start')
  let nextReport = performance.now() + 30_000
  while (performance.now() - startedAt < durationMs) {
    for (let index = 0; index < 50; index += 1) JSON.stringify(ctx.tools.schemas())
    schemaAssemblies += 50
    const callStartedAt = performance.now()
    const result = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: ToolCallId(`r-files-stress-${calls}`),
      name: 'r_files',
      arguments: { action: 'catalog' },
      agent,
    })
    const elapsed = performance.now() - callStartedAt
    calls += 1
    totalCatalogMs += elapsed
    maxCatalogMs = Math.max(maxCatalogMs, elapsed)
    if (result.isError) throw new Error(result.content.map(block => block.type === 'text' ? block.text : '').join('\n'))
    if (performance.now() >= nextReport) {
      memory('progress')
      nextReport += 30_000
    }
  }
  memory('complete')
} finally {
  await ctx.fiber.dispose()
  rmSync(root, { recursive: true, force: true })
}
