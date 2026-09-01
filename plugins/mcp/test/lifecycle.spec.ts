import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import ZeroWallProjectsService from '../../projects/src/host/index.js'
import ZeroWallMcpService, {
  RDATALINUX_R_MCP_LEGACY_URL,
  RDATALINUX_R_MCP_URL,
} from '../src/host/index.js'

const roots: string[] = []
afterEach(() => {
  delete process.env.ZEROWALL_RESEARCH_DB
  delete process.env.ZEROWALL_DISABLE_DEFAULT_MCP
  delete process.env.DSH_HOME
  delete process.env.ZEROWALL_MCP_ENVIRONMENT_ROOT
  delete process.env.ZEROWALL_MCP_ENVIRONMENT_POLL_MS
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('ZeroWall MCP Cordis lifecycle', () => {
  it('contains a failed default migration instead of terminating Host startup', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zerowall-mcp-contained-startup-'))
    roots.push(root)
    process.env.ZEROWALL_RESEARCH_DB = join(root, 'zerowall-research.sqlite')
    process.env.DSH_HOME = join(root, 'blocked-harness-home')
    writeFileSync(process.env.DSH_HOME, 'not a directory')

    const ctx = new Context()
    try {
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      await ctx.plugin(ZeroWallProjectsService)
      await ctx.plugin(ZeroWallMcpService)

      await expect(ctx.zerowallMcp.list()).resolves.toEqual(expect.any(Array))
      expect(ctx.fiber.state).toBe(2)
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('migrates only the retired R Platform endpoint to port 8099', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zerowall-mcp-r-platform-'))
    roots.push(root)
    process.env.ZEROWALL_RESEARCH_DB = join(root, 'zerowall-research.sqlite')
    process.env.DSH_HOME = join(root, 'harness')

    const ctx = new Context()
    try {
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      await ctx.plugin(ZeroWallProjectsService)
      const migrated = ctx.zerowallProjects.createMcpServer({
        name: 'rdatalinux R',
        serverName: 'rdatalinux_r_platform',
        transport: 'streamable-http',
        enabled: false,
        url: RDATALINUX_R_MCP_LEGACY_URL,
      })
      const custom = ctx.zerowallProjects.createMcpServer({
        name: 'Custom R',
        serverName: 'custom_r_platform',
        transport: 'streamable-http',
        enabled: false,
        url: 'http://103.217.185.141:9000/r-platform/mcp',
      })

      await ctx.plugin(ZeroWallMcpService)
      const servers = await ctx.zerowallMcp.list()
      expect(servers.find(server => server.id === migrated.id)?.url).toBe(RDATALINUX_R_MCP_URL)
      expect(servers.find(server => server.id === custom.id)?.url).toBe('http://103.217.185.141:9000/r-platform/mcp')
    } finally {
      await ctx.fiber.dispose()
    }
  }, 30_000)

  it('mounts tools from a real local stdio server and unregisters them when disabled', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zerowall-mcp-lifecycle-'))
    roots.push(root)
    process.env.ZEROWALL_RESEARCH_DB = join(root, 'zerowall-research.sqlite')
    process.env.ZEROWALL_DISABLE_DEFAULT_MCP = '1'
    const fixtureServer = fileURLToPath(new URL(
      '../../../deepseek-harness/packages/mcp/mcp-client/tests/fixture-server.ts',
      import.meta.url,
    ))
    const fixtureDirectory = fileURLToPath(new URL(
      '../../../deepseek-harness/packages/mcp/mcp-client/',
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
      expect(created.tools).toEqual(expect.arrayContaining(['mcp__fixture__add', 'mcp__fixture__greet']))
      expect(created.tools.every(name => name.startsWith('mcp__fixture__'))).toBe(true)
      expect(ctx.tools.get('mcp__fixture__add')).toBeDefined()
      expect(ctx.tools.get('mcp__fixture__greet')).toBeDefined()

      ctx.root.emit('mcp-client/status', 'fixture', 'starting')
      const afterDelayedStarting = (await ctx.zerowallMcp.list()).find(server => server.id === created.id)
      expect(afterDelayedStarting?.runtimeState).toBe('active')
      expect(afterDelayedStarting?.tools).toEqual(expect.arrayContaining(['mcp__fixture__add', 'mcp__fixture__greet']))

      const disabled = await ctx.zerowallMcp.update({ id: created.id, changes: { enabled: false } })
      expect(disabled.runtimeState).toBe('disabled')
      expect(disabled.tools).toEqual([])
      expect(ctx.tools.get('mcp__fixture__add')).toBeUndefined()
      expect(await ctx.zerowallMcp.list()).toHaveLength(1)
    } finally {
      await ctx.fiber.dispose()
    }
  }, 30_000)

  it('automatically reconciles blocked managed servers after current.json becomes ready', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zerowall-mcp-refresh-'))
    const environmentStore = join(root, 'environment-store')
    const installed = join(environmentStore, 'versions', '4.1.10')
    roots.push(root)
    process.env.ZEROWALL_RESEARCH_DB = join(root, 'zerowall-research.sqlite')
    process.env.DSH_HOME = join(root, 'harness')
    process.env.ZEROWALL_MCP_ENVIRONMENT_ROOT = environmentStore
    // Exercise generation recovery without weakening the production guard
    // against high-frequency environment polling.
    process.env.ZEROWALL_MCP_ENVIRONMENT_POLL_MS = '100'
    const server = `const readline=require('node:readline');const lines=readline.createInterface({input:process.stdin});lines.on('line',(line)=>{let req;try{req=JSON.parse(line)}catch{return}if(req.id===undefined)return;if(req.method==='initialize')process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:req.id,result:{protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'fixture',version:'1'}}})+'\\n');else if(req.method==='tools/list')process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:req.id,result:{tools:[]}})+'\\n');else process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:req.id,result:{}})+'\\n')});`
    for (const relative of ['bio-tools', 'bio-tools/python', 'ketcher-chemistry', 'sci/dist']) mkdirSync(join(installed, relative), { recursive: true })
    copyFileSync(process.execPath, join(installed, 'bio-tools', 'python', 'python.exe'))
    writeFileSync(join(installed, 'bio-tools', 'run_server.py'), server)
    writeFileSync(join(installed, 'ketcher-chemistry', 'server.js'), server)
    writeFileSync(join(installed, 'sci', 'dist', 'mcp.cjs'), server)
    // The fixture launcher is itself a stdio server so disposing the MCP client
    // cannot leave a detached child process behind on Windows.
    writeFileSync(join(installed, 'sci', 'zerowall-mcp-launcher.cjs'), server)

    const ctx = new Context()
    try {
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      await ctx.plugin(ZeroWallProjectsService)
      await ctx.plugin(ZeroWallMcpService)
      expect((await ctx.zerowallMcp.list()).every(item => item.runtimeState === 'starting' || item.runtimeState === 'blocked')).toBe(true)
      await expect.poll(async () => (await ctx.zerowallMcp.list()).every(item => item.runtimeState === 'blocked'), { timeout: 10_000, interval: 25 }).toBe(true)
      mkdirSync(environmentStore, { recursive: true })
      writeFileSync(join(environmentStore, 'current.json'), JSON.stringify({ version: '4.1.10', root: installed, health: 'ready' }))
      await expect.poll(async () => Object.fromEntries((await ctx.zerowallMcp.list()).map(item => [item.serverName, item.runtimeState])), { timeout: 10_000, interval: 100 })
        .toMatchObject({
          zerowall_managed_bio_tools: 'active',
          zerowall_managed_ketcher: 'active',
          zerowall_managed_scimaster: 'blocked',
        })
    } finally {
      await ctx.fiber.dispose()
    }
  }, 30_000)

  it('loads all managed scientific MCP servers without a fixed filesystem server', async () => {
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
      expect(servers).toHaveLength(4)
      expect(servers.map(server => server.name)).toEqual(['Sci', 'Bio Tools', 'Ketcher Chemistry', 'rdatalinux R'])
      expect(servers.find(server => server.serverName === 'zerowall_filesystem')).toBeUndefined()
      expect(servers.every(server => server.runtimeState === 'starting' || server.runtimeState === 'blocked')).toBe(true)
      await expect.poll(async () => Object.fromEntries((await ctx.zerowallMcp.list()).map(server => [server.serverName, server.runtimeState])), { timeout: 10_000, interval: 25 })
        .toMatchObject({
          zerowall_managed_bio_tools: 'blocked',
          zerowall_managed_ketcher: 'blocked',
          zerowall_managed_scimaster: 'blocked',
        })
    } finally {
      await ctx.fiber.dispose()
    }
  }, 30_000)
})
