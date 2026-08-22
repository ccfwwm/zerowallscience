import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import ZeroWallProjectsService from '../../projects/src/host/index.js'
import ZeroWallMcpService from '../src/host/index.js'

const roots: string[] = []
afterEach(() => {
  delete process.env.ZEROWALL_RESEARCH_DB
  delete process.env.ZEROWALL_DISABLE_DEFAULT_MCP
  delete process.env.DSH_HOME
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('ZeroWall MCP Cordis lifecycle', () => {
  it('mounts tools from a real local stdio server and unregisters them when disabled', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zerowall-mcp-lifecycle-'))
    roots.push(root)
    process.env.ZEROWALL_RESEARCH_DB = join(root, 'zerowall-research.sqlite')
    process.env.ZEROWALL_DISABLE_DEFAULT_MCP = '1'
    const fixtureServer = fileURLToPath(new URL(
      '../../../dsh/source/packages/mcp/mcp-client/tests/fixture-server.ts',
      import.meta.url,
    ))
    const fixtureDirectory = fileURLToPath(new URL(
      '../../../dsh/source/packages/mcp/mcp-client/',
      import.meta.url,
    ))

    const ctx = new Context()
    try {
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      await ctx.plugin(ZeroWallProjectsService)
      await ctx.plugin(ZeroWallMcpService)

      const created = await ctx.zerowallMcp.create({
        name: 'Fixture tools',
        serverName: 'fixture',
        transport: 'stdio',
        enabled: true,
        command: process.execPath,
        args: [fixtureServer],
        cwd: fixtureDirectory,
        failOnStartupError: true,
      })
      expect(created.runtimeState, created.runtimeError).toBe('active')
      expect(ctx.tools.get('mcp__fixture__add')).toBeDefined()
      expect(ctx.tools.get('mcp__fixture__greet')).toBeDefined()

      const disabled = await ctx.zerowallMcp.update({ id: created.id, changes: { enabled: false } })
      expect(disabled.runtimeState).toBe('disabled')
      expect(ctx.tools.get('mcp__fixture__add')).toBeUndefined()
      expect(await ctx.zerowallMcp.list()).toHaveLength(1)
    } finally {
      await ctx.fiber.dispose()
    }
  }, 30_000)

  it('loads the bundled scientific workspace MCP on a fresh 3.x profile', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zerowall-default-mcp-'))
    roots.push(root)
    process.env.ZEROWALL_RESEARCH_DB = join(root, 'zerowall-research.sqlite')
    process.env.DSH_HOME = join(root, 'harness')

    const ctx = new Context()
    try {
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      await ctx.plugin(ZeroWallProjectsService)
      await ctx.plugin(ZeroWallMcpService)
      const servers = await ctx.zerowallMcp.list()
      expect(servers).toHaveLength(3)
      expect(servers.find(server => server.serverName === 'zerowall_filesystem')).toMatchObject({
        name: '科研工作区文件',
        serverName: 'zerowall_filesystem',
        enabled: true,
        runtimeState: 'active',
      })
      expect(ctx.tools.get('mcp__zerowall_filesystem__read_text_file')).toBeDefined()
      expect(servers.find(server => server.serverName === 'zerowall_managed_bio_tools')).toMatchObject({ runtimeState: 'blocked' })
      expect(servers.find(server => server.serverName === 'zerowall_managed_ketcher')).toMatchObject({ runtimeState: 'blocked' })
    } finally {
      await ctx.fiber.dispose()
    }
  }, 30_000)
})
