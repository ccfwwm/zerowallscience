import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { afterEach, describe, expect, it } from 'vitest'
import * as capabilityRegistry from '../../../packages/dsh-capability-menu/src/registry.ts'
import * as capabilityPolicy from '../../../packages/dsh-capability-menu/src/policy.ts'
import * as capabilityInvoke from '../../../packages/dsh-capability-menu/src/invoke.ts'
import * as capabilitySearch from '../../../packages/dsh-capability-menu/src/search.ts'
import ZeroWallProjectsService from '../../projects/src/host/index.js'
import ZeroWallMcpService from '../src/host/index.js'

const roots: string[] = []
afterEach(() => {
  delete process.env.ZEROWALL_RESEARCH_DB
  delete process.env.DSH_HOME
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe.runIf(Boolean(process.env.R_PLATFORM_MCP_AUTHORIZATION))('compact R MCP live integration', () => {
  it('registers only the authenticated compact remote tools in the ZeroWall Agent registry', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zerowall-r-mcp-live-'))
    roots.push(root)
    process.env.ZEROWALL_RESEARCH_DB = join(root, 'zerowall-research.sqlite')
    process.env.DSH_HOME = join(root, 'harness')
    const ctx = new Context()
    try {
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      await ctx.plugin(ZeroWallProjectsService)
      await ctx.plugin(ZeroWallMcpService)
      await expect.poll(async () => (await ctx.zerowallMcp.list()).find(item => item.serverName === 'rmcp')?.runtimeState, { timeout: 20_000, interval: 100 }).toBe('active')
      const server = (await ctx.zerowallMcp.list()).find(item => item.serverName === 'rmcp')
      expect(server?.runtimeState, server?.runtimeError).toBe('active')
      // The compact surface may grow by adding a new aggregate domain, but
      // must remain bounded and never regress to the legacy raw routes.
      expect(server?.tools.length).toBeGreaterThanOrEqual(17)
      expect(server?.tools.length).toBeLessThanOrEqual(24)
      expect(server?.tools).toContain('mcp__rmcp__r_runtime')
      expect(server?.tools).toContain('mcp__rmcp__r_jobs')
      expect(server?.tools).toContain('mcp__rmcp__r_figureya_artifacts')
      expect(server?.tools.some(name => /(?:rplatform__|rbioagent__|rplotfigure__)/u.test(name))).toBe(false)
      expect(ctx.tools.schemas().map(schema => schema.name)).toContain('mcp__rmcp__r_runtime')
    } finally {
      await ctx.fiber.dispose()
    }
  }, 30_000)

  it('searches and executes an internal R capability through the compact control plane', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zerowall-r-capability-live-'))
    roots.push(root)
    process.env.ZEROWALL_RESEARCH_DB = join(root, 'zerowall-research.sqlite')
    process.env.DSH_HOME = join(root, 'harness')
    const ctx = new Context()
    const agent = { session: { header: { cwd: root }, snapshotEvents: () => [], append: () => undefined } } as any
    try {
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      await ctx.plugin(SkillRegistry)
      await ctx.plugin(ZeroWallProjectsService)
      await ctx.plugin(capabilityRegistry, { catalogFile: '' })
      await ctx.plugin(capabilityPolicy)
      await ctx.plugin(capabilityInvoke)
      await ctx.plugin(capabilitySearch)
      await ctx.plugin(ZeroWallMcpService)
      await expect.poll(async () => (await ctx.zerowallMcp.list()).find(item => item.serverName === 'rmcp')?.runtimeState, { timeout: 20_000, interval: 100 }).toBe('active')
      const searched = await ctx.tools.execute({ signal: new AbortController().signal, callId: ToolCallId('compact-search'), name: 'capability_search', arguments: { query: 'FigureYa', kind: 'tool', max_results: 5 }, agent })
      expect(searched.isError, JSON.stringify(searched.content)).toBe(false)
      expect(JSON.stringify(searched.isError ? {} : searched.value)).toContain('figureya.entry')
      const executed = await ctx.tools.execute({ signal: new AbortController().signal, callId: ToolCallId('compact-execute'), name: 'capability_execute', arguments: { id: 'r.health', kind: 'tool', args: {} }, agent })
      expect(executed.isError, JSON.stringify(executed.content)).toBe(false)
      expect(JSON.stringify(executed.isError ? {} : executed.value)).toContain('mcp__rmcp__r_runtime')
      expect(executed.content.map(block => block.type)).toEqual(['text'])
    } finally {
      await ctx.fiber.dispose()
    }
  }, 30_000)
})

