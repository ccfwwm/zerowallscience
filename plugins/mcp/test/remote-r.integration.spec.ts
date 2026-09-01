import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { afterEach, describe, expect, it } from 'vitest'
import ZeroWallProjectsService from '../../projects/src/host/index.js'
import ZeroWallMcpService from '../src/host/index.js'

const roots: string[] = []
afterEach(() => {
  delete process.env.ZEROWALL_RESEARCH_DB
  delete process.env.DSH_HOME
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe.runIf(Boolean(process.env.R_PLATFORM_MCP_AUTHORIZATION))('rdatalinux R MCP live integration', () => {
  it('registers the authenticated remote tools in the ZeroWall Agent registry', async () => {
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
      await expect.poll(async () => (await ctx.zerowallMcp.list()).find(item => item.serverName === 'rdatalinux_r_platform')?.runtimeState, { timeout: 20_000, interval: 100 }).toBe('active')
      const server = (await ctx.zerowallMcp.list()).find(item => item.serverName === 'rdatalinux_r_platform')
      expect(server?.runtimeState, server?.runtimeError).toBe('active')
      expect(server?.tools.length).toBeGreaterThanOrEqual(26)
      expect(server?.tools).toContain('mcp__rdatalinux_r_platform__r_health')
      expect(server?.tools).toContain('mcp__rdatalinux_r_platform__r_read_image')
      expect(server?.tools).toContain('mcp__rdatalinux_r_platform__r_get_job_result')
      expect(ctx.tools.schemas().map(schema => schema.name)).toContain('mcp__rdatalinux_r_platform__r_health')
    } finally {
      await ctx.fiber.dispose()
    }
  }, 30_000)
})
