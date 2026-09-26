import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SecretBrokerClient } from '@zerowallscience/plugin-secrets'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import ZeroWallProjectsService from '../../projects/src/host/index.js'
import ZeroWallMcpService, {
  ZeroWallMcpService as McpServiceClass,
  RDATALINUX_R_MCP_LEGACY_URL,
  RDATALINUX_R_MCP_URL,
} from '../src/host/index.js'

const roots: string[] = []
beforeEach(() => {
  // Vitest worker IPC is not the desktop credential broker.
  vi.spyOn(SecretBrokerClient.prototype, 'get').mockResolvedValue(undefined)
})
afterEach(async () => {
  delete process.env.ZEROWALL_RESEARCH_DB
  delete process.env.ZEROWALL_DISABLE_DEFAULT_MCP
  delete process.env.R_PLATFORM_MCP_AUTHORIZATION
  delete process.env.DSH_HOME
  delete process.env.ZEROWALL_MCP_ENVIRONMENT_ROOT
  delete process.env.ZEROWALL_MCP_ENVIRONMENT_POLL_MS
  // A managed server's stdio child can still be releasing its handle on the
  // fixture executable when teardown runs. Windows may keep that handle for
  // longer than fs.rmSync's retry window, so retry asynchronously and leave a
  // best-effort cleanup behind rather than turning a passing behavior test into
  // an unrelated teardown failure.
  for (const root of roots.splice(0)) {
    let removed = false
    for (let attempt = 0; attempt < 12 && !removed; attempt += 1) {
      try {
        rmSync(root, { recursive: true, force: true })
        removed = true
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EPERM' && (error as NodeJS.ErrnoException).code !== 'EBUSY') throw error
        await new Promise(resolve => setTimeout(resolve, 50 * (attempt + 1)))
      }
    }
    if (!removed) {
      setTimeout(() => {
        try { rmSync(root, { recursive: true, force: true }) } catch { /* child teardown owns the remaining handle */ }
      }, 1000).unref()
    }
  }
})

describe('ZeroWall MCP Cordis lifecycle', () => {
  it('keeps saved enabled connections out of the boot barrier until the desktop mounts', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zerowall-mcp-boot-gate-'))
    roots.push(root)
    process.env.ZEROWALL_RESEARCH_DB = join(root, 'db.sqlite')
    process.env.ZEROWALL_DISABLE_DEFAULT_MCP = '1'
    process.env.ZEROWALL_DEFER_DEFAULT_MCP = '1'
    const send = process.send
    process.send = (() => true) as typeof process.send
    const ctx = new Context()
    const starts = vi.spyOn(McpServiceClass.prototype as any, 'startConnection').mockImplementation(() => undefined)
    try {
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      await ctx.plugin(ZeroWallProjectsService)
      ctx.zerowallProjects.createMcpServer({ name: 'saved', serverName: 'saved', transport: 'streamable-http', enabled: true, url: 'http://127.0.0.1:9/mcp' })
      await ctx.plugin(ZeroWallMcpService)
      expect((await ctx.zerowallMcp.list())[0]?.enabled).toBe(true)
      expect(starts).not.toHaveBeenCalled()
      process.env.ZEROWALL_MCP_ENVIRONMENT_ROOT = root
      writeFileSync(join(root, 'activation.json'), JSON.stringify({ transactionId: 'before-background-start', candidate: { root: join(root, 'candidate'), health: 'ready' }, createdAt: Date.now() }))
      await expect.poll(() => { try { return JSON.parse(readFileSync(join(root, 'activation-ready.json'), 'utf8')) } catch { return undefined } }, { timeout: 5000 }).toMatchObject({ transactionId: 'before-background-start', ready: true })
      process.emit('message', { type: 'unrelated' }, undefined)
      expect(starts).not.toHaveBeenCalled()
      process.emit('message', { type: 'zerowall:desktop:workbench-ready' }, undefined)
      await new Promise(resolve => setImmediate(resolve))
      expect(starts).toHaveBeenCalledTimes(1)
      process.emit('message', { type: 'zerowall:desktop:workbench-ready' }, undefined)
      await new Promise(resolve => setImmediate(resolve))
      expect(starts).toHaveBeenCalledTimes(1)
    } finally {
      await ctx.fiber.dispose()
      starts.mockRestore()
      process.send = send
      delete process.env.ZEROWALL_DEFER_DEFAULT_MCP
    }
  })

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
        name: 'rplatform',
        serverName: 'rmcp',
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
    const startsFile = join(root, 'starts.log')
    const launcher = join(root, 'fixture.mjs')
    writeFileSync(startsFile, '')
    writeFileSync(launcher, `import { appendFileSync } from 'node:fs'; appendFileSync(${JSON.stringify(startsFile)}, 'start\\n'); await import(${JSON.stringify(pathToFileURL(fixtureServer).href)});`)

    const ctx = new Context()
    try {
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      await ctx.plugin(ZeroWallProjectsService)
      await ctx.plugin(ZeroWallMcpService)

      const idle = await ctx.zerowallMcp.create({
        name: 'Fixture tools',
        serverName: 'fixture',
        transport: 'stdio',
        enabled: true,
        command: process.execPath,
        args: [launcher],
        cwd: fixtureDirectory,
        failOnStartupError: true,
      })
      expect(idle.runtimeState, idle.runtimeError).toBe('active')
      expect(idle.tools).toContain('mcp__fixture__add')
      expect(idle.toolCallTimeoutMs).toBe(300_000)
      expect(idle.reconnect.maxAttempts).toBe(2)
      expect(ctx.tools.get('mcp__fixture__add')).toBeDefined()
      expect(readFileSync(startsFile, 'utf8')).toBe('start\n')
      const connect = (id: string) => ctx.tools.execute({
        signal: new AbortController().signal, callId: ToolCallId(id), name: 'mcp_connect', arguments: { server: 'fixture' },
      })
      const results = await Promise.all([connect('demand-1'), connect('demand-2'), connect('demand-3')])
      expect(results.every(result => !result.isError)).toBe(true)
      expect(readFileSync(startsFile, 'utf8')).toBe('start\n')
      const created = (await ctx.zerowallMcp.list()).find(server => server.id === idle.id)!
      expect(created.runtimeState, created.runtimeError).toBe('active')
      expect(created.tools).toEqual(expect.arrayContaining(['mcp__fixture__add', 'mcp__fixture__greet']))
      expect(created.tools.every(name => name.startsWith('mcp__fixture__'))).toBe(true)
      expect(ctx.tools.get('mcp__fixture__add')).toBeDefined()
      expect(ctx.tools.get('mcp__fixture__greet')).toBeDefined()

      ctx.root.emit('mcp-client/status', 'fixture', 'starting')
      const afterDelayedStarting = (await ctx.zerowallMcp.list()).find(server => server.id === created.id)
      expect(afterDelayedStarting?.runtimeState).toBe('active')
      expect(afterDelayedStarting?.tools).toEqual(expect.arrayContaining(['mcp__fixture__add', 'mcp__fixture__greet']))

      const reloaded = await ctx.zerowallMcp.reload(created.id)
      expect(reloaded.runtimeState, reloaded.runtimeError).toBe('active')
      expect(reloaded.tools).toEqual(created.tools)
      expect(ctx.tools.schemas().filter(tool => tool.name === 'mcp__fixture__add')).toHaveLength(1)

      const disabled = await ctx.zerowallMcp.update({ id: created.id, changes: { enabled: false } })
      expect(disabled.runtimeState).toBe('disabled')
      expect(disabled.tools).toEqual([])
      expect(ctx.tools.get('mcp__fixture__add')).toBeUndefined()
      expect(await ctx.zerowallMcp.list()).toHaveLength(1)
    } finally {
      await ctx.fiber.dispose()
    }
  }, 30_000)

  it('starts enabled managed servers once their environment becomes ready and polls the compact pointer every second', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zerowall-mcp-refresh-'))
    const environmentStore = join(root, 'environment-store')
    const installed = join(environmentStore, 'versions', '4.1.10')
    const runtimeRoot = root
    roots.push(root)
    process.env.ZEROWALL_RESEARCH_DB = join(root, 'zerowall-research.sqlite')
    process.env.DSH_HOME = join(root, 'harness')
    process.env.ZEROWALL_MCP_ENVIRONMENT_ROOT = environmentStore
    // Exercise generation recovery without weakening the production guard
    // against high-frequency environment polling.
    const timers = vi.spyOn(globalThis, 'setInterval')
    const server = `const readline=require('node:readline');const lines=readline.createInterface({input:process.stdin});lines.on('line',(line)=>{let req;try{req=JSON.parse(line)}catch{return}if(req.id===undefined)return;if(req.method==='initialize')process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:req.id,result:{protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'fixture',version:'1'}}})+'\\n');else if(req.method==='tools/list')process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:req.id,result:{tools:[]}})+'\\n');else process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:req.id,result:{}})+'\\n')});`
    for (const relative of ['bio-tools', 'ketcher-chemistry', 'sci/dist']) mkdirSync(join(installed, relative), { recursive: true })
    mkdirSync(join(runtimeRoot, 'Python'), { recursive: true })
    copyFileSync(process.execPath, join(runtimeRoot, 'Python', 'python.exe'))
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
      const seeded = await ctx.zerowallMcp.list()
      expect(seeded.filter(item => item.serverName.startsWith('zerowall_managed_')).every(item => item.enabled)).toBe(true)
      for (const item of seeded.filter(item => item.serverName.startsWith('zerowall_managed_'))) {
        const saved = await ctx.zerowallMcp.update({ id: item.id, changes: {
          enabled: true, toolCallTimeoutMs: 300_000,
          reconnect: { enabled: true, initialDelayMs: 5_000, maxDelayMs: 60_000, maxAttempts: 2 },
          failOnStartupError: false,
        } })
        expect(saved.runtimeState).toBe('blocked')
        expect(saved.reconnect.maxAttempts).toBe(2)
        await expect(ctx.zerowallMcp.ensureConnected(item.serverName)).rejects.toThrow('environment is not ready')
      }
      await expect.poll(async () => (await ctx.zerowallMcp.list()).filter(item => item.serverName.startsWith('zerowall_managed_')).every(item => item.runtimeState === 'blocked'), { timeout: 10_000, interval: 25 }).toBe(true)
      mkdirSync(environmentStore, { recursive: true })
      writeFileSync(join(environmentStore, 'current.json'), JSON.stringify({ version: '4.1.10', root: installed, runtimeRoot, health: 'ready', manifest: { python: { relativeExecutable: 'Python/python.exe', relativeSitePackages: 'Python/Lib/site-packages' } } }))
      const timer = timers.mock.calls.find(call => call[1] === 1000)
      expect(timer).toBeDefined()
      // Fire the production callback to verify the compact-pointer refresh.
      await (timer![0] as () => void)()
      await new Promise(resolve => setImmediate(resolve))
      await expect.poll(async () => (await ctx.zerowallMcp.list()).find(item => item.serverName === 'zerowall_managed_ketcher')?.runtimeState, { timeout: 10_000 }).toBe('active')
      await expect.poll(async () => (await ctx.zerowallMcp.list()).find(item => item.serverName === 'zerowall_managed_bio_tools')?.runtimeState, { timeout: 10_000 }).toBe('active')
      const beforeInspect = (await ctx.zerowallMcp.list()).map(item => item.tools)
      await (timer![0] as () => void)()
      expect((await ctx.zerowallMcp.list()).map(item => item.tools)).toEqual(beforeInspect)
      expect(Object.fromEntries((await ctx.zerowallMcp.list()).map(item => [item.serverName, item.runtimeState])))
        .toMatchObject({ zerowall_managed_bio_tools: 'active', zerowall_managed_ketcher: 'active', zerowall_managed_scimaster: 'blocked' })

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
      expect(servers).toHaveLength(5)
      expect(servers.map(server => server.name)).toEqual(expect.arrayContaining(['Sci', 'Bio Tools', 'Ketcher Chemistry', 'rmcp', '化工社 AIchem']))
      expect(servers.find(server => server.serverName === 'zerowall_filesystem')).toBeUndefined()
      expect(servers.every(server => server.enabled)).toBe(true)
    } finally {
      await ctx.fiber.dispose()
    }
  }, 30_000)
})
