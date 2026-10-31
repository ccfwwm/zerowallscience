import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SecretBrokerClient } from '@zerowallscience/plugin-secrets'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import McpConfigurationStorePlugin from '../src/host/configuration-store.js'
import { matchMcpCapabilities } from '../src/host/capability-match.js'
import ZeroWallMcpService, {
  ZeroWallMcpService as McpServiceClass,
  RDATALINUX_R_MCP_AUTHORIZATION_ENV,
  RDATALINUX_R_MCP_URL,
  GPSADB_MCP_URL,
  GPSADB_SERVER_NAME,
} from '../src/host/index.js'

const roots: string[] = []
beforeEach(() => {
  // Vitest worker IPC is not the desktop credential broker.
  vi.spyOn(SecretBrokerClient.prototype, 'get').mockResolvedValue(undefined)
})
afterEach(async () => {
  vi.unstubAllEnvs()
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
  it('fuzzy-matches configured server names and live tool descriptions', () => {
    expect(matchMcpCapabilities('化学品检索', 'huagongshe', 'Huagongshe', []).score).toBeGreaterThan(0)
    expect(matchMcpCapabilities('find a drug target', 'opcrd', 'OPCRD', []).score).toBeGreaterThan(0)
    expect(matchMcpCapabilities('search greeting', 'fixture', 'Fixture', [
      { name: 'mcp__fixture__greet', description: 'Greet and search text' },
      { name: 'mcp__fixture__add', description: 'Add two numeric values' },
    ]).tools.map(tool => tool.name)).toEqual(['mcp__fixture__greet'])
  })

  it('keeps saved enabled connections disconnected through desktop mount', async () => {
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
      await ctx.plugin(McpConfigurationStorePlugin)
      ctx.zerowallMcpConfigurationStore.createMcpServer({ name: 'saved', serverName: 'saved', transport: 'streamable-http', enabled: true, url: 'http://127.0.0.1:9/mcp' })
      await ctx.plugin(ZeroWallMcpService)
      expect((await ctx.zerowallMcp.list())[0]?.enabled).toBe(true)
      expect(starts).not.toHaveBeenCalled()
      process.env.ZEROWALL_MCP_ENVIRONMENT_ROOT = root
      writeFileSync(join(root, 'activation.json'), JSON.stringify({ transactionId: 'before-background-start', candidate: { root: join(root, 'candidate'), health: 'ready' }, createdAt: Date.now() }))
      await (ctx.zerowallMcp as any).pollEnvironment()
      expect(() => readFileSync(join(root, 'activation-ready.json'))).toThrow()
      expect(JSON.parse(readFileSync(join(root, 'activation.json'), 'utf8')).transactionId).toBe('before-background-start')
      process.emit('message', { type: 'unrelated' }, undefined)
      expect(starts).not.toHaveBeenCalled()
      process.emit('message', { type: 'zerowall:desktop:workbench-ready' }, undefined)
      await new Promise(resolve => setImmediate(resolve))
      expect(starts).not.toHaveBeenCalled()
      process.emit('message', { type: 'zerowall:desktop:workbench-ready' }, undefined)
      await new Promise(resolve => setImmediate(resolve))
      expect(starts).not.toHaveBeenCalled()
    } finally {
      await ctx.fiber.dispose()
      starts.mockRestore()
      process.send = send
      delete process.env.ZEROWALL_DEFER_DEFAULT_MCP
    }
  })

  it('connects enabled MCP servers before prompt assembly and isolates connection failures', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zerowall-mcp-prompt-connect-'))
    roots.push(root)
    process.env.ZEROWALL_RESEARCH_DB = join(root, 'db.sqlite')
    process.env.DSH_HOME = join(root, 'harness')
    process.env.ZEROWALL_DISABLE_DEFAULT_MCP = '1'
    process.env.ZEROWALL_DEFER_DEFAULT_MCP = '1'
    const fixtureServer = fileURLToPath(new URL(
      '../../../deepseek-harness/packages/mcp/mcp-client/tests/fixture-server.ts',
      import.meta.url,
    ))
    const fixtureDirectory = fileURLToPath(new URL(
      '../../../deepseek-harness/packages/mcp/mcp-client/',
      import.meta.url,
    ))
    const launcher = join(root, 'fixture.mjs')
    writeFileSync(launcher, `await import(${JSON.stringify(pathToFileURL(fixtureServer).href)});`)
    const ctx = new Context()
    const agent = { ctx, id: 'prompt-connect-agent', session: { id: 'prompt-connect-session', header: { cwd: root }, snapshotEvents: () => [], append: () => undefined } } as any
    try {
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      await ctx.plugin(McpConfigurationStorePlugin)
      ctx.zerowallMcpConfigurationStore.createMcpServer({
        name: 'Saved enabled fixture', serverName: 'fixture', transport: 'stdio', enabled: true,
        command: process.execPath, args: [launcher], cwd: fixtureDirectory, failOnStartupError: true,
      })
      ctx.zerowallMcpConfigurationStore.createMcpServer({
        name: 'Second enabled fixture', serverName: 'second_fixture', transport: 'stdio', enabled: true,
        command: process.execPath, args: [launcher], cwd: fixtureDirectory, failOnStartupError: true,
      })
      ctx.zerowallMcpConfigurationStore.createMcpServer({
        name: 'Saved disabled fixture', serverName: 'disabled_fixture', transport: 'stdio', enabled: false,
        command: process.execPath, args: [launcher], cwd: fixtureDirectory, failOnStartupError: true,
      })
      ctx.zerowallMcpConfigurationStore.createMcpServer({
        name: 'Unavailable fixture', serverName: 'unavailable_fixture', transport: 'stdio', enabled: true,
        command: join(root, 'missing-command.exe'), args: [], cwd: fixtureDirectory, failOnStartupError: true,
      })
      await ctx.plugin(ZeroWallMcpService)

      expect((await ctx.zerowallMcp.list()).find(server => server.serverName === 'fixture')?.runtimeState).toBe('idle')
      expect(ctx.tools.get('mcp__fixture__add')).toBeUndefined()
      const assembly = await ctx.systemPrompt.assemble({ scope: agent, agent })
      const after = await ctx.zerowallMcp.list()
      expect(after.find(server => server.serverName === 'fixture')?.runtimeState).toBe('active')
      expect(assembly.tools.some(tool => tool.name === 'mcp__fixture__add')).toBe(true)
      expect(assembly.tools.some(tool => tool.name === 'mcp__fixture__greet')).toBe(true)
      expect(assembly.tools.some(tool => tool.name.startsWith('mcp__disabled_fixture__'))).toBe(false)
      expect(assembly.tools.some(tool => tool.name.startsWith('mcp__unavailable_fixture__'))).toBe(false)
      expect(after.find(server => server.serverName === 'disabled_fixture')?.runtimeState).toBe('disabled')
      expect(after.find(server => server.serverName === 'unavailable_fixture')?.runtimeState).toBe('error')
      expect(assembly.tools.some(tool => tool.name === 'mcp__second_fixture__add')).toBe(true)
      const second = after.find(server => server.serverName === 'second_fixture')!
      const request = ctx.inject(['zerowallMcp'], async scope => {
        await scope.zerowallMcp.reload(second.id)
      })
      await request
      expect(ctx.tools.get('mcp__second_fixture__add')).toBeDefined()
      await request.dispose()
      expect(ctx.tools.get('mcp__fixture__add')).toBeDefined()
      expect(ctx.tools.get('mcp__second_fixture__add')).toBeDefined()
      for (const server of ['fixture', 'second_fixture']) {
        const result = await ctx.tools.execute({ signal: new AbortController().signal, callId: ToolCallId(`parallel-${server}`), name: `mcp__${server}__add`, arguments: { a: 2, b: 3 }, agent })
        expect(result.isError).toBe(false)
      }
      await ctx.zerowallMcp.update({ id: second.id, changes: { enabled: false } })
      expect(ctx.tools.get('mcp__fixture__add')).toBeDefined()
      expect(ctx.tools.get('mcp__second_fixture__add')).toBeUndefined()
    } finally {
      await ctx.fiber.dispose()
    }
  }, 30_000)

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
      await ctx.plugin(McpConfigurationStorePlugin)
      await ctx.plugin(ZeroWallMcpService)

      await expect(ctx.zerowallMcp.list()).resolves.toEqual(expect.any(Array))
      expect(ctx.fiber.state).toBe(2)
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('normalizes the managed R Platform endpoint to HTTPS', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zerowall-mcp-r-platform-'))
    roots.push(root)
    process.env.ZEROWALL_RESEARCH_DB = join(root, 'zerowall-research.sqlite')
    process.env.DSH_HOME = join(root, 'harness')
    mkdirSync(process.env.DSH_HOME, { recursive: true })
    writeFileSync(join(process.env.DSH_HOME, 'zerowall-mcp-defaults-v1.json'), JSON.stringify({ version: 10 }))

    const ctx = new Context()
    try {
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      await ctx.plugin(McpConfigurationStorePlugin)
      const migrated = ctx.zerowallMcpConfigurationStore.createMcpServer({
        name: 'rplatform',
        serverName: 'rmcp',
        transport: 'streamable-http',
        enabled: false,
        url: 'http://103.217.185.141:8099/r-platform/mcp',
        headerRefs: { Authorization: RDATALINUX_R_MCP_AUTHORIZATION_ENV },
      })
      const custom = ctx.zerowallMcpConfigurationStore.createMcpServer({
        name: 'Custom R',
        serverName: 'custom_r_platform',
        transport: 'streamable-http',
        enabled: false,
        url: 'https://custom.example.invalid/r-platform/mcp',
      })

      await ctx.plugin(ZeroWallMcpService)
      const servers = await ctx.zerowallMcp.list()
      expect(servers.find(server => server.id === migrated.id)?.url).toBe(RDATALINUX_R_MCP_URL)
      expect(servers.find(server => server.id === custom.id)?.url).toBe('https://custom.example.invalid/r-platform/mcp')
    } finally {
      await ctx.fiber.dispose()
    }
  }, 30_000)

  it('repairs a disabled legacy RMCP record and refreshes it through the canonical name on demand', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zerowall-rmcp-legacy-demand-'))
    roots.push(root)
    process.env.ZEROWALL_RESEARCH_DB = join(root, 'zerowall-research.sqlite')
    process.env.ZEROWALL_DEFER_DEFAULT_MCP = '1'
    process.env.R_PLATFORM_MCP_AUTHORIZATION = 'fixture-token'
    process.env.DSH_HOME = join(root, 'harness')
    mkdirSync(process.env.DSH_HOME, { recursive: true })
    writeFileSync(join(process.env.DSH_HOME, 'zerowall-mcp-defaults-v1.json'), JSON.stringify({ version: 10 }))
    const fixtureServer = fileURLToPath(new URL(
      '../../../deepseek-harness/packages/mcp/mcp-client/tests/fixture-server.ts',
      import.meta.url,
    ))
    const fixtureDirectory = fileURLToPath(new URL(
      '../../../deepseek-harness/packages/mcp/mcp-client/',
      import.meta.url,
    ))
    const launcher = join(root, 'fixture.mjs')
    writeFileSync(launcher, `await import(${JSON.stringify(pathToFileURL(fixtureServer).href)});`)

    const ctx = new Context()
    try {
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      await ctx.plugin(McpConfigurationStorePlugin)
      const legacy = ctx.zerowallMcpConfigurationStore.createMcpServer({
        name: 'Legacy RMCP', serverName: 'zerowall-rmcp', transport: 'stdio', enabled: false,
        command: process.execPath, args: [launcher], cwd: fixtureDirectory, failOnStartupError: true,
      })
      await ctx.plugin(ZeroWallMcpService)

      const migrated = (await ctx.zerowallMcp.list()).find(server => server.id === legacy.id)
      expect(migrated).toMatchObject({ serverName: 'rmcp', enabled: false, runtimeState: 'disabled' })
      const result = await ctx.tools.execute({
        name: 'mcp_connect', arguments: { server: 'zerowall-rmcp' },
        callId: ToolCallId('legacy-rmcp-demand'), signal: new AbortController().signal,
      })
      expect(result.isError, JSON.stringify(result.content)).toBe(false)
      expect(result.value).toMatchObject({ server: 'rmcp', requestedServer: 'zerowall-rmcp', state: 'active' })
      expect((await ctx.zerowallMcp.list()).find(server => server.id === legacy.id)).toMatchObject({ serverName: 'rmcp', enabled: true, runtimeState: 'active' })
    } finally {
      await ctx.fiber.dispose()
    }
  }, 30_000)

  it('connects RMCP on demand, refreshes after an unknown internal tool, and exposes live RMCP tools to the model', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zerowall-rmcp-internal-demand-'))
    roots.push(root)
    process.env.ZEROWALL_RESEARCH_DB = join(root, 'zerowall-research.sqlite')
    process.env.ZEROWALL_DISABLE_DEFAULT_MCP = '1'
    process.env.DSH_HOME = join(root, 'harness')
    const ctx = new Context()
    const target = 'mcp__rmcp__r_runtime'
    let executions = 0
    let connections = 0
    const agent = { ctx, id: 'rmcp-demand-agent', session: { id: 'rmcp-demand-session', header: { cwd: root }, snapshotEvents: () => [], append: () => undefined } } as any
    try {
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      await ctx.plugin(McpConfigurationStorePlugin)
      await ctx.plugin(ZeroWallMcpService)
      const service = ctx.zerowallMcp as any
      const ensure = vi.spyOn(service, 'ensureConnected').mockImplementation(async (_server: string, _refresh: boolean) => {
        connections += 1
        if (_refresh && ctx.tools.get(target) === undefined) {
          ctx.tools.register(defineTool({
            name: target,
            description: 'Internal RMCP runtime fixture',
            parameters: { action: { type: 'string', required: true }, arguments: { type: 'json' } },
            output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
            execute: async () => {
              executions += 1
              if (executions === 1) throw new Error(`unknown tool "${target}"`)
              return { ok: true }
            },
          }))
        }
      })
      const result = await service.workflowRequest('health', {}, {
        signal: new AbortController().signal,
        callId: 'rmcp-demand-workflow',
        agent,
      })
      expect(result).toMatchObject({ ok: true })
      expect(connections).toBe(3)
      expect(ensure.mock.calls.map(call => call[1])).toEqual([false, true, true])
      expect(executions).toBe(2)
      const assembly = await ctx.systemPrompt.assemble({ scope: agent })
      expect(assembly.tools.some(tool => tool.name === target)).toBe(true)
      expect(assembly.tools.some(tool => tool.name === 'research_workflow')).toBe(true)
    } finally {
      await ctx.fiber.dispose()
    }
  }, 30_000)

  it('routes a bundled RMCP module operation through its live module tool when r_runtime is absent', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zerowall-rmcp-module-fallback-'))
    roots.push(root)
    process.env.ZEROWALL_RESEARCH_DB = join(root, 'zerowall-research.sqlite')
    process.env.ZEROWALL_DISABLE_DEFAULT_MCP = '1'
    process.env.DSH_HOME = join(root, 'harness')
    const ctx = new Context()
    const forwarded: unknown[] = []
    const agent = { ctx, id: 'rmcp-module-agent', session: { id: 'rmcp-module-session', header: { cwd: root }, snapshotEvents: () => [], append: () => undefined } } as any
    try {
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      await ctx.plugin(McpConfigurationStorePlugin)
      await ctx.plugin(ZeroWallMcpService)
      const service = ctx.zerowallMcp as any
      vi.spyOn(service, 'ensureConnected').mockResolvedValue(undefined)
      ctx.tools.register(defineTool({
        name: 'mcp__rmcp__r_faerskit',
        description: 'FAERS module operation fixture',
        parameters: { action: { type: 'string', required: true }, arguments: { type: 'json' } },
        output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
        execute: async args => { forwarded.push(args); return { matching_case_count: 4 } },
      }))
      ctx.tools.register(defineTool({
        name: 'mcp__rmcp__biomni_runtime',
        description: 'Biomni module operation fixture',
        parameters: { action: { type: 'string', required: true }, arguments: { type: 'json' } },
        output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
        execute: async args => { forwarded.push(args); return { status: 'ready' } },
      }))
      ctx.tools.register(defineTool({
        name: 'mcp__rmcp__r_project',
        description: 'Project registration fixture',
        parameters: { action: { type: 'string', required: true }, arguments: { type: 'json' } },
        output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
        execute: async args => {
          forwarded.push(args)
          const parameters = (args as any).arguments
          return { project_id: parameters.project_id, managed: true, scope: 'conversation' }
        },
      }))

      const result = await service.workflowRequest('workflow_query', { workflow_id: 'r.faerskit', operation: 'r.faerskit.lookup', arguments: { drug: 'METFORMIN' } }, {
        signal: new AbortController().signal,
        callId: 'rmcp-direct-module-fallback',
        agent,
      })
      expect(result).toEqual({ matching_case_count: 4 })
      expect(forwarded).toEqual([{ action: 'r.faerskit.lookup', arguments: { drug: 'METFORMIN' } }])
      await expect(service.workflowRequest('workflow_describe', { workflow_id: 'r.faerskit', operation: 'r.faerskit.lookup' }, { signal: new AbortController().signal, callId: 'rmcp-fallback-describe', agent }))
        .resolves.toMatchObject({ id: 'r.faerskit.lookup', schema_source: 'bundled_operation_catalog', live_schema_unavailable: true })
      const catalog = await service.workflowRequest('workflow_catalog', {}, { signal: new AbortController().signal, callId: 'rmcp-fallback-catalog', agent }) as any
      expect(catalog.modules.map((module: any) => module.id)).toEqual(expect.arrayContaining(['r.faerskit', 'r.geo', 'r.nhanes', 'r.compute', 'figureya']))
      await expect(service.workflowRequest('workflow_query', { workflow_id: 'biomni', operation: 'biomni.status', arguments: {} }, { signal: new AbortController().signal, callId: 'rmcp-biomni-fallback', agent }))
        .resolves.toEqual({ status: 'ready' })
      expect(forwarded.at(-1)).toEqual({ action: 'biomni.status', arguments: {} })
      const projectId = await ctx.researchWorkflow.get().resolveProjectId({ agent, signal: new AbortController().signal, callId: 'rmcp-project-bootstrap' } as any)
      expect(projectId).toMatch(/^zw-[a-f0-9]{40}$/u)
      expect(forwarded.at(-1)).toMatchObject({ action: 'r.register.project', arguments: { project_id: projectId } })
    } finally {
      await ctx.fiber.dispose()
    }
  }, 30_000)

  it('mounts tools from a real local stdio server and unregisters them when disabled', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zerowall-mcp-lifecycle-'))
    roots.push(root)
    process.env.ZEROWALL_RESEARCH_DB = join(root, 'zerowall-research.sqlite')
    process.env.DSH_HOME = join(root, 'harness')
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
    const unregisterExtraTools: Array<() => void> = []
    writeFileSync(startsFile, '')
    writeFileSync(launcher, `import { appendFileSync } from 'node:fs'; appendFileSync(${JSON.stringify(startsFile)}, 'start\\n'); await import(${JSON.stringify(pathToFileURL(fixtureServer).href)});`)

    const ctx = new Context()
    try {
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      await ctx.plugin(McpConfigurationStorePlugin)
      const includeTools = vi.fn()
      ctx.provide('zerowallToolAccess', { include: includeTools } as never)
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
      const initialStarts = readFileSync(startsFile, 'utf8')
      // MCP SDK v2 auto-negotiation may probe a stdio server before its
      // active transport. Demand must reuse the settled connection.
      expect(initialStarts.split('start\n').length - 1).toBeGreaterThanOrEqual(1)
      const selectionAgent = {} as never
      const connect = (id: string) => ctx.tools.execute({
        signal: new AbortController().signal, callId: ToolCallId(id), name: 'mcp_connect', arguments: { server: 'fixture' }, agent: selectionAgent,
      })
      const results = await Promise.all([connect('demand-1'), connect('demand-2'), connect('demand-3')])
      expect(results.every(result => !result.isError), JSON.stringify(results.map(result => result.content))).toBe(true)
      // Explicit mcp_connect is a refresh boundary, so concurrent connects
      // may replace the stale client once while the live tools/list settles.
      expect(readFileSync(startsFile, 'utf8').split('start\n').length - 1).toBeGreaterThanOrEqual(initialStarts.split('start\n').length - 1)
      const created = (await ctx.zerowallMcp.list()).find(server => server.id === idle.id)!
      expect(created.runtimeState, created.runtimeError).toBe('active')
      expect(created.tools).toEqual(expect.arrayContaining(['mcp__fixture__add', 'mcp__fixture__greet']))
      expect(created.tools.every(name => name.startsWith('mcp__fixture__'))).toBe(true)
      expect(results.some(result => (result.value as any)?.tools?.includes('mcp__fixture__greet'))).toBe(true)
      expect(includeTools).toHaveBeenCalledWith(selectionAgent, expect.arrayContaining(created.tools))
      expect(ctx.tools.get('mcp__fixture__add')).toBeDefined()
      expect(ctx.tools.get('mcp__fixture__greet')).toBeDefined()
      const connectedTools = [...created.tools].sort((left, right) => left.localeCompare(right))
      const initialAssembly = await ctx.systemPrompt.assemble({ scope: {} })
      const selectedAssembly = await ctx.systemPrompt.assemble({ scope: selectionAgent })
      const unscopedAssembly = await ctx.systemPrompt.assemble({})
      for (const assembly of [initialAssembly, selectedAssembly, unscopedAssembly]) {
        expect(assembly.tools.filter(tool => tool.name.startsWith('mcp__fixture__')).map(tool => tool.name)).toEqual(connectedTools)
      }
      const search = await ctx.tools.execute({ signal: new AbortController().signal, callId: ToolCallId('search-fixture'), name: 'mcp_search', arguments: { query: 'greet' }, agent: selectionAgent })
      expect(search.value).toMatchObject({ matches: [expect.objectContaining({ server: 'fixture', tools: [expect.objectContaining({ name: 'mcp__fixture__greet' })] })] })
      const searchAssembly = await ctx.systemPrompt.assemble({ scope: selectionAgent })
      expect(searchAssembly.tools.filter(tool => tool.name.startsWith('mcp__fixture__')).map(tool => tool.name)).toEqual(connectedTools)

      const service = ctx.zerowallMcp as any
      const extraTools = Array.from({ length: 605 }, (_, index) => `mcp__fixture__extra_${String(index).padStart(3, '0')}`)
      for (const name of extraTools) {
        unregisterExtraTools.push(ctx.tools.register(defineTool({
          name,
          description: `Synthetic capability ${name}`,
          parameters: {},
          output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
          execute: async () => ({ ok: true }),
        })))
      }
      const allNames = [...created.tools, ...extraTools]
      // Remote re-syncs publish new live tools without replacing the service's
      // initial snapshot. Discovery must use the current registry generation.
      expect(service.registeredTools.get(created.id)).toEqual(created.tools)
      service.clearMcpToolIndex('fixture')
      service.indexMcpTools('fixture', allNames)
      vi.spyOn(service, 'ensureConnected').mockResolvedValue(undefined)

      const fullAssembly = await ctx.systemPrompt.assemble({ scope: selectionAgent, agent: selectionAgent })
      expect(fullAssembly.tools.filter(tool => tool.name.startsWith('mcp__fixture__')).map(tool => tool.name)).toEqual([...allNames].sort((left, right) => left.localeCompare(right)))
      const fullConnect = await ctx.tools.execute({ signal: new AbortController().signal, callId: ToolCallId('connect-all-tools'), name: 'mcp_connect', arguments: { server: 'fixture' }, agent: selectionAgent })
      expect(fullConnect.isError, JSON.stringify(fullConnect.content)).toBe(false)
      expect((fullConnect.value as any).tools).toHaveLength(allNames.length)
      expect(fullConnect.value).toMatchObject({ toolCount: allNames.length, toolsOmitted: 0 })
      const fullSearch = await ctx.tools.execute({ signal: new AbortController().signal, callId: ToolCallId('search-all-tools'), name: 'mcp_search', arguments: { query: 'Synthetic capability' }, agent: selectionAgent })
      expect(fullSearch.isError, JSON.stringify(fullSearch.content)).toBe(false)
      expect((fullSearch.value as any).loadedToolNames).toHaveLength(extraTools.length)
      expect((fullSearch.value as any).matches[0].tools).toHaveLength(extraTools.length)
      const tailTool = extraTools.at(-1)!
      const tailSearch = await ctx.tools.execute({ signal: new AbortController().signal, callId: ToolCallId('search-beyond-auto-cap'), name: 'mcp_search', arguments: { query: tailTool }, agent: selectionAgent })
      expect((tailSearch.value as any).loadedToolNames).toContain(tailTool)
      const tailAssembly = await ctx.systemPrompt.assemble({ scope: selectionAgent, agent: selectionAgent })
      expect(tailAssembly.tools.map(tool => tool.name)).toContain(tailTool)
      const otherAssembly = await ctx.systemPrompt.assemble({ scope: {} })
      expect(otherAssembly.tools.filter(tool => tool.name.startsWith('mcp__fixture__'))).toHaveLength(allNames.length)
      expect(otherAssembly.tools.map(tool => tool.name)).toContain(tailTool)
      const tailExecution = await ctx.tools.execute({ signal: new AbortController().signal, callId: ToolCallId('execute-beyond-auto-cap'), name: tailTool, arguments: {}, agent: selectionAgent })
      expect(tailExecution.isError).toBe(false)
      await service.cacheMcpServer(created)
      const cached = JSON.parse(readFileSync(join(root, 'harness', 'zerowall-mcp-tool-index.json'), 'utf8'))
      expect(cached.servers[created.id].tools).toHaveLength(allNames.length)
      service.clearMcpToolIndex('fixture')
      await service.loadMcpToolCache()
      expect(service.mcpToolIndex.has(tailTool)).toBe(true)
      for (const unregister of unregisterExtraTools.splice(0)) unregister()
      service.registeredTools.set(created.id, [...created.tools, 'mcp__fixture__retired_from_remote'])
      service.clearMcpToolIndex('fixture')
      service.indexMcpTools('fixture', [...created.tools, 'mcp__fixture__retired_from_remote'])
      const retiredAssembly = await ctx.systemPrompt.assemble({ scope: selectionAgent })
      expect(retiredAssembly.tools.map(tool => tool.name)).not.toContain(tailTool)

      const staleFilteredConnect = await ctx.tools.execute({ signal: new AbortController().signal, callId: ToolCallId('connect-stale-filter'), name: 'mcp_connect', arguments: { server: 'fixture' }, agent: selectionAgent })
      expect(staleFilteredConnect.isError, JSON.stringify(staleFilteredConnect.content)).toBe(false)
      expect((staleFilteredConnect.value as any).tools).toEqual(connectedTools)
      const staleFilteredSearch = await ctx.tools.execute({ signal: new AbortController().signal, callId: ToolCallId('search-stale-filter'), name: 'mcp_search', arguments: { query: 'retired_from_remote' }, agent: selectionAgent })
      expect(staleFilteredSearch.isError, JSON.stringify(staleFilteredSearch.content)).toBe(false)
      expect(JSON.stringify(staleFilteredSearch.value)).not.toContain('retired_from_remote')

      const unmatched = await ctx.tools.execute({ signal: new AbortController().signal, callId: ToolCallId('search-unmatched'), name: 'mcp_search', arguments: { query: 'fixture' }, agent: selectionAgent })
      expect(unmatched.value).toMatchObject({ matches: [], connectedServer: 'fixture', candidateTools: expect.arrayContaining([expect.objectContaining({ name: 'mcp__fixture__greet' })]) })
      const unmatchedAssembly = await ctx.systemPrompt.assemble({ scope: selectionAgent })
      expect(unmatchedAssembly.tools.filter(tool => tool.name.startsWith('mcp__fixture__')).map(tool => tool.name)).toEqual(connectedTools)
      expect(readFileSync(startsFile, 'utf8')).not.toBe(initialStarts)
      await expect.poll(() => {
        try {
          const cache = JSON.parse(readFileSync(join(root, 'harness', 'zerowall-mcp-tool-index.json'), 'utf8'))
          return cache.servers[created.id]?.tools?.some((tool: { name?: string }) => tool.name === 'mcp__fixture__greet') ?? false
        } catch { return false }
      }).toBe(true)

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
      for (const unregister of unregisterExtraTools) unregister()
      await ctx.fiber.dispose()
    }
  }, 30_000)

  it('reports RMCP credential and discovery states without confusing them with zero tools', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zerowall-rmcp-discovery-'))
    roots.push(root)
    process.env.ZEROWALL_RESEARCH_DB = join(root, 'zerowall-research.sqlite')
    process.env.ZEROWALL_DISABLE_DEFAULT_MCP = '1'
    process.env.DSH_HOME = join(root, 'harness')

    const ctx = new Context()
    try {
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      await ctx.plugin(McpConfigurationStorePlugin)
      const seeded = ctx.zerowallMcpConfigurationStore.createMcpServer({
        name: 'RMCP fixture', serverName: 'rmcp', transport: 'stdio', enabled: false,
        command: process.execPath, args: ['-e', 'process.stdin.resume()'], cwd: root,
      })
      await ctx.plugin(ZeroWallMcpService)

      ctx.zerowallMcpConfigurationStore.updateMcpServer(seeded.id, { enabled: true })
      const missing = await ctx.zerowallMcp.reload(seeded.id)
      expect(missing.runtimeState).toBe('waiting-for-credentials')
      expect(missing.missingEnvironmentVariables).toEqual(['R_PLATFORM_MCP_AUTHORIZATION'])
      expect(missing.tools).toEqual([])

      process.env.R_PLATFORM_MCP_AUTHORIZATION = 'fixture-token'
      const mode = join(root, 'rmcp-mode.txt')
      writeFileSync(mode, 'zero')
      const launcher = join(root, 'rmcp-fixture.mjs')
      writeFileSync(launcher, `import { readFileSync } from 'node:fs'; import { createInterface } from 'node:readline'; const mode=${JSON.stringify(mode)}; createInterface({input:process.stdin}).on('line',line=>{let req;try{req=JSON.parse(line)}catch{return}if(req.id===undefined)return;let result={};if(req.method==='initialize')result={protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'rmcp-fixture',version:'1'}};else if(req.method==='tools/list')result={tools:readFileSync(mode,'utf8').trim()==='one'?[{name:'echo',description:'fixture description',inputSchema:{type:'object',properties:{query:{type:'string',description:'Search phrase'}},required:['query']}}]:[]};process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:req.id,result})+'\\n')});`)
      ctx.zerowallMcpConfigurationStore.updateMcpServer(seeded.id, { command: process.execPath, args: [launcher] })
      const zero = await ctx.zerowallMcp.reload(seeded.id)
      expect(zero.runtimeState, zero.runtimeError).toBe('active-with-zero-tools')
      expect(zero.toolDiscoveryState).toBe('complete')
      expect(zero.lastSuccessfulToolCount).toBe(0)
      expect(zero.tools).toEqual([])

      writeFileSync(mode, 'one')
      const reloaded = await ctx.zerowallMcp.reload(zero.id)
      expect(reloaded.runtimeState, reloaded.runtimeError).toBe('active')
      expect(reloaded.toolDiscoveryState).toBe('complete')
      expect(reloaded.tools).toEqual(['mcp__rmcp__echo'])
      expect(reloaded.toolDetails).toEqual([{
        name: 'mcp__rmcp__echo', description: 'fixture description',
        inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Search phrase' } }, required: ['query'] },
      }])
      expect(ctx.tools.schemas().filter(tool => tool.name === 'mcp__rmcp__echo')).toHaveLength(1)
    } finally {
      await ctx.fiber.dispose()
    }
  }, 30_000)

  it('migrates only the reserved RMCP record to strict startup errors', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zerowall-rmcp-startup-policy-'))
    roots.push(root)
    process.env.ZEROWALL_RESEARCH_DB = join(root, 'zerowall-research.sqlite')
    process.env.DSH_HOME = join(root, 'harness')

    const ctx = new Context()
    try {
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      await ctx.plugin(McpConfigurationStorePlugin)
      const rmcp = ctx.zerowallMcpConfigurationStore.createMcpServer({
        name: 'rmcp', serverName: 'rmcp', transport: 'streamable-http', enabled: false,
        url: 'http://127.0.0.1:9/mcp', failOnStartupError: false,
      })
      const custom = ctx.zerowallMcpConfigurationStore.createMcpServer({
        name: 'User MCP fixture', serverName: 'user-fixture', transport: 'streamable-http', enabled: false,
        url: 'http://127.0.0.1:9/mcp', failOnStartupError: false,
      })
      await ctx.plugin(ZeroWallMcpService)
      await ctx.zerowallMcp.list()
      const records = ctx.zerowallMcpConfigurationStore.listMcpServers()
      expect(records.find(server => server.id === rmcp.id)?.failOnStartupError).toBe(true)
      expect(records.find(server => server.serverName === 'zerowall_managed_bio_tools')?.failOnStartupError).toBe(true)
      expect(records.find(server => server.id === custom.id)?.failOnStartupError).toBe(false)
    } finally {
      await ctx.fiber.dispose()
    }
  }, 30_000)

  it('reports an RMCP HTTP startup failure instead of an active zero-tool connection', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zerowall-rmcp-http-error-'))
    roots.push(root)
    process.env.ZEROWALL_RESEARCH_DB = join(root, 'zerowall-research.sqlite')
    process.env.ZEROWALL_DISABLE_DEFAULT_MCP = '1'
    process.env.DSH_HOME = join(root, 'harness')
    process.env.R_PLATFORM_MCP_AUTHORIZATION = 'Bearer fixture-token'

    const server = createServer((_request, response) => {
      response.writeHead(502, { 'content-type': 'text/plain' })
      response.end('fixture upstream unavailable')
    })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('RMCP fixture server did not bind a TCP port.')

    const ctx = new Context()
    try {
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      await ctx.plugin(McpConfigurationStorePlugin)
      const seeded = ctx.zerowallMcpConfigurationStore.createMcpServer({
        name: 'RMCP fixture', serverName: 'rmcp', transport: 'streamable-http', enabled: false,
        url: `http://127.0.0.1:${address.port}/mcp`,
        headerRefs: { Authorization: 'R_PLATFORM_MCP_AUTHORIZATION' },
        failOnStartupError: true,
        reconnect: { enabled: false, initialDelayMs: 5_000, maxDelayMs: 60_000, maxAttempts: 1 },
      })
      await ctx.plugin(ZeroWallMcpService)
      ctx.zerowallMcpConfigurationStore.updateMcpServer(seeded.id, { enabled: true })
      const failed = await ctx.zerowallMcp.reload(seeded.id)
      expect(failed.runtimeState).toBe('error')
      expect(failed.toolDiscoveryState).toBe('failed')
      expect(failed.runtimeState).not.toBe('active-with-zero-tools')
      expect(failed.tools).toEqual([])
    } finally {
      await ctx.fiber.dispose()
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  }, 30_000)

  it('waits for an explicit connection after the managed environment becomes ready', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zerowall-mcp-refresh-'))
    const environmentStore = join(root, 'Python/.zerowall')
    const installed = join(environmentStore, 'versions', '4.1.10')
    const runtimeRoot = join(root, 'Python')
    roots.push(root)
    process.env.ZEROWALL_RESEARCH_DB = join(root, 'zerowall-research.sqlite')
    process.env.DSH_HOME = join(root, 'harness')
    process.env.ZEROWALL_MCP_ENVIRONMENT_ROOT = environmentStore
    // Exercise generation recovery without weakening the production guard
    // against high-frequency environment polling.
    const timers = vi.spyOn(globalThis, 'setInterval')
    const server = `const readline=require('node:readline');const lines=readline.createInterface({input:process.stdin});lines.on('line',(line)=>{let req;try{req=JSON.parse(line)}catch{return}if(req.id===undefined)return;if(req.method==='initialize')process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:req.id,result:{protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'fixture',version:'1'}}})+'\\n');else if(req.method==='tools/list')process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:req.id,result:{tools:[]}})+'\\n');else process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:req.id,result:{}})+'\\n')});`
    for (const relative of ['bio-tools', 'ketcher-chemistry', 'sci/dist']) mkdirSync(join(installed, relative), { recursive: true })
    writeFileSync(join(installed, 'bio-tools', 'run_server.py'), server)
    writeFileSync(join(installed, 'ketcher-chemistry', 'server.js'), server)
    writeFileSync(join(installed, 'sci', 'dist', 'mcp.cjs'), server)
    // The fixture launcher is itself a stdio server so disposing the MCP client
    // cannot leave a detached child process behind on Windows.
    writeFileSync(join(installed, 'sci', 'zerowall-mcp-launcher.cjs'), server)

    vi.stubEnv('ZEROWALL_PYTHON_RUNTIME_ROOT', runtimeRoot)
    vi.stubEnv('ZEROWALL_BIO_TOOLS_ROOT', join(installed, 'bio-tools'))
    vi.stubEnv('ZEROWALL_KETCHER_ROOT', join(installed, 'ketcher-chemistry'))
    vi.stubEnv('ZEROWALL_SCI_ROOT', join(installed, 'sci'))
    const ctx = new Context()
    try {
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      await ctx.plugin(McpConfigurationStorePlugin)
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
        await expect(ctx.zerowallMcp.ensureConnected(item.serverName)).rejects.toThrow('共享 Python/MCP 环境未就绪')
      }
      await expect.poll(async () => (await ctx.zerowallMcp.list()).filter(item => item.serverName.startsWith('zerowall_managed_')).every(item => item.runtimeState === 'blocked'), { timeout: 10_000, interval: 25 }).toBe(true)
      mkdirSync(environmentStore, { recursive: true })
      copyFileSync(process.execPath, join(runtimeRoot, 'python.exe'))
      writeFileSync(join(environmentStore, 'current.json'), JSON.stringify({ version: '4.1.10', root: runtimeRoot, runtimeRoot, health: 'ready', manifest: { python: { relativeExecutable: 'Python/python.exe', relativeSitePackages: 'Python/Lib/site-packages' } } }))
      const timer = timers.mock.calls.find(call => call[1] === 1000)
      expect(timer).toBeDefined()
      // Fire the production callback to verify the compact-pointer refresh.
      await (timer![0] as () => void)()
      await new Promise(resolve => setImmediate(resolve))
      await expect.poll(async () => (await ctx.zerowallMcp.list()).find(item => item.serverName === 'zerowall_managed_ketcher')?.runtimeState, { timeout: 10_000 }).toBe('blocked')
      await ctx.zerowallMcp.ensureConnected('zerowall_managed_ketcher')
      await expect.poll(async () => (await ctx.zerowallMcp.list()).find(item => item.serverName === 'zerowall_managed_ketcher')?.runtimeState, { timeout: 10_000 }).toBe('active')
      await expect(ctx.zerowallMcp.ensureConnected('zerowall_managed_bio_tools')).rejects.toThrow('核心依赖尚未安装')
      expect((await ctx.zerowallMcp.list()).find(item => item.serverName === 'zerowall_managed_bio_tools')).toMatchObject({ runtimeState: 'blocked', runtimeError: expect.stringContaining('核心依赖尚未安装') })
      mkdirSync(join(runtimeRoot, 'Lib/site-packages/mcp'), { recursive: true })
      writeFileSync(join(runtimeRoot, 'Lib/site-packages/mcp/__init__.py'), '')
      await ctx.zerowallMcp.ensureConnected('zerowall_managed_bio_tools')
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
      await ctx.plugin(McpConfigurationStorePlugin)
      await ctx.plugin(ZeroWallMcpService)
      const servers = await ctx.zerowallMcp.list()
      expect(servers).toHaveLength(6)
      expect(servers.map(server => server.name)).toEqual(expect.arrayContaining(['Sci', 'Bio Tools', 'Ketcher Chemistry', 'rmcp', '化工社 AIchem', 'GPSAdb']))
      expect(servers.find(server => server.serverName === 'zerowall_filesystem')).toBeUndefined()
      expect(servers.every(server => server.enabled)).toBe(true)
      expect(servers.find(server => server.serverName === GPSADB_SERVER_NAME)).toMatchObject({
        transport: 'streamable-http', url: GPSADB_MCP_URL, enabled: true, headerRefs: {},
      })
    } finally {
      await ctx.fiber.dispose()
    }
  }, 30_000)

  it('seeds GPSAdb enabled once and preserves a later user disable across restart', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zerowall-gpsadb-seed-'))
    roots.push(root)
    process.env.ZEROWALL_RESEARCH_DB = join(root, 'zerowall-research.sqlite')
    process.env.DSH_HOME = join(root, 'harness')
    process.env.ZEROWALL_DEFER_DEFAULT_MCP = '1'
    const send = process.send
    process.send = (() => true) as typeof process.send
    const starts = vi.spyOn(McpServiceClass.prototype as any, 'startConnection').mockImplementation(() => undefined)
    const createContext = async () => {
      const ctx = new Context()
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      await ctx.plugin(McpConfigurationStorePlugin)
      await ctx.plugin(ZeroWallMcpService)
      return ctx
    }
    let first: Context | undefined
    let second: Context | undefined
    try {
      first = await createContext()
      const initial = (await first.zerowallMcp.list()).find(server => server.serverName === GPSADB_SERVER_NAME)
      expect(initial).toMatchObject({ enabled: true, url: GPSADB_MCP_URL, headerRefs: {} })
      await first.zerowallMcp.update({ id: initial!.id, changes: { enabled: false } })
      await first.fiber.dispose()
      first = undefined

      second = await createContext()
      const restarted = (await second.zerowallMcp.list()).find(server => server.serverName === GPSADB_SERVER_NAME)
      expect(restarted).toMatchObject({ enabled: false, runtimeState: 'disabled', url: GPSADB_MCP_URL })
      expect(starts).not.toHaveBeenCalled()
      await expect(second.zerowallMcp.update({ id: restarted!.id, changes: { url: 'https://attacker.invalid/mcp' } })).rejects.toThrow('Managed connection fields are read-only')
      const renamed = await second.zerowallMcp.update({ id: restarted!.id, changes: { name: 'GPSAdb renamed' } })
      expect(renamed.name).toBe('GPSAdb renamed')
      await expect(second.zerowallMcp.deleteConnection(restarted!.id)).rejects.toThrow('Built-in MCP connections cannot be deleted')
      expect((await second.zerowallMcp.list()).some(server => server.id === restarted!.id)).toBe(true)
    } finally {
      if (first) await first.fiber.dispose()
      if (second) await second.fiber.dispose()
      starts.mockRestore()
      process.send = send
    }
  }, 30_000)

  it('rejects deletion before disposing any built-in MCP and still deletes custom connections', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zerowall-mcp-protected-'))
    roots.push(root)
    process.env.ZEROWALL_RESEARCH_DB = join(root, 'db.sqlite')
    process.env.ZEROWALL_DISABLE_DEFAULT_MCP = '1'
    const starts = vi.spyOn(McpServiceClass.prototype as any, 'startConnection').mockImplementation(() => undefined)
    const ctx = new Context()
    try {
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      await ctx.plugin(McpConfigurationStorePlugin)
      const names = ['gpsadb', 'rmcp', 'huagongshe', 'zerowall_managed_scimaster', 'zerowall_managed_bio_tools', 'zerowall_managed_ketcher']
      const records = names.map(serverName => ctx.zerowallMcpConfigurationStore.createMcpServer({ name: serverName, serverName, transport: 'streamable-http', enabled: false, url: 'https://example.test/mcp' }))
      await ctx.plugin(ZeroWallMcpService)
      const dispose = vi.spyOn(ctx.zerowallMcp as any, 'disposeOne')
      for (const record of records) {
        await expect(ctx.zerowallMcp.deleteConnection(record.id)).rejects.toThrow('Disable the connection instead')
        expect(ctx.zerowallMcpConfigurationStore.getMcpServer(record.id)).toBeDefined()
      }
      expect(dispose).not.toHaveBeenCalled()
      for (const record of records) {
        expect(await ctx.zerowallMcp.update({ id: record.id, changes: { enabled: true } })).toMatchObject({ enabled: true })
        expect(await ctx.zerowallMcp.update({ id: record.id, changes: { enabled: false } })).toMatchObject({ enabled: false, runtimeState: 'disabled' })
      }
      const custom = await ctx.zerowallMcp.create({ name: 'custom', serverName: 'custom', transport: 'streamable-http', enabled: false, url: 'https://example.test/mcp' })
      await ctx.zerowallMcp.deleteConnection(custom.id)
      expect(ctx.zerowallMcpConfigurationStore.getMcpServer(custom.id)).toBeUndefined()
    } finally {
      await ctx.fiber.dispose()
      starts.mockRestore()
    }
  })

  it('fails closed for GPSAdb tools outside the approved read-only allowlist', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zerowall-gpsadb-guard-'))
    roots.push(root)
    process.env.ZEROWALL_RESEARCH_DB = join(root, 'zerowall-research.sqlite')
    process.env.DSH_HOME = join(root, 'harness')
    process.env.ZEROWALL_DEFER_DEFAULT_MCP = '1'
    const send = process.send
    process.send = (() => true) as typeof process.send
    const starts = vi.spyOn(McpServiceClass.prototype as any, 'startConnection').mockImplementation(() => undefined)
    const ctx = new Context()
    const calls: string[] = []
    try {
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      await ctx.plugin(McpConfigurationStorePlugin)
      await ctx.plugin(ZeroWallMcpService)
      const definition = (name: string) => defineTool({
        name,
        description: 'GPSAdb test tool',
        parameters: {},
        output: { schema: { type: 'object', additionalProperties: true }, render: () => [{ type: 'text', text: 'ok' }] },
        execute: async () => { calls.push(name); return { ok: true } },
      })
      ctx.tools.register(definition('mcp__gpsadb__search_datasets'))
      ctx.tools.register(definition('mcp__gpsadb__delete_dataset'))
      const execute = (name: string) => ctx.tools.execute({
        signal: new AbortController().signal, callId: ToolCallId(`gpsadb-${name}`), name, arguments: {},
      })
      const allowed = await execute('mcp__gpsadb__search_datasets')
      const denied = await execute('mcp__gpsadb__delete_dataset')
      expect(allowed.isError).toBe(false)
      expect(denied.isError).toBe(true)
      expect(denied.content.some(block => block.type === 'text' && block.text.includes('approved read-only allowlist'))).toBe(true)
      expect(calls).toEqual(['mcp__gpsadb__search_datasets'])
    } finally {
      await ctx.fiber.dispose()
      starts.mockRestore()
      process.send = send
    }
  }, 30_000)

  it('never exposes or executes remote R project administration', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zerowall-r-project-retired-'))
    roots.push(root)
    process.env.ZEROWALL_RESEARCH_DB = join(root, 'zerowall-research.sqlite')
    process.env.DSH_HOME = join(root, 'harness')
    process.env.ZEROWALL_DEFER_DEFAULT_MCP = '1'
    const send = process.send
    process.send = (() => true) as typeof process.send
    const starts = vi.spyOn(McpServiceClass.prototype as any, 'startConnection').mockImplementation(() => undefined)
    const ctx = new Context()
    const calls: string[] = []
    try {
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      await ctx.plugin(McpConfigurationStorePlugin)
      await ctx.plugin(ZeroWallMcpService)
      ctx.tools.register(defineTool({
        name: 'mcp__rmcp__r_project',
        description: 'retired remote project administration',
        parameters: {},
        output: { schema: { type: 'object', additionalProperties: true }, render: () => [{ type: 'text', text: 'ok' }] },
        execute: async () => { calls.push('r_project'); return { ok: true } },
      }))
      const assembly = await ctx.systemPrompt.assemble({ scope: {} })
      const denied = await ctx.tools.execute({ name: 'mcp__rmcp__r_project', arguments: {}, callId: ToolCallId('retired-r-project'), signal: new AbortController().signal })
      expect(assembly.tools.some(tool => tool.name === 'mcp__rmcp__r_project')).toBe(false)
      expect(denied.isError).toBe(true)
      expect(denied.content.some(block => block.type === 'text' && block.text.includes('Remote R project administration is Host-managed'))).toBe(true)
      expect(calls).toEqual([])
    } finally {
      await ctx.fiber.dispose()
      starts.mockRestore()
      process.send = send
    }
  }, 30_000)
})

it('restores a metadata-only MCP index after Host restart and invalidates it when the connection changes', async () => {
  const root = mkdtempSync(join(tmpdir(), 'zerowall-mcp-cache-restart-')); roots.push(root)
  vi.stubEnv('ZEROWALL_RESEARCH_DB', join(root, 'db.sqlite'))
  vi.stubEnv('DSH_HOME', join(root, 'harness'))
  vi.stubEnv('ZEROWALL_DISABLE_DEFAULT_MCP', '1')
  const starts = vi.spyOn(McpServiceClass.prototype as any, 'startConnection').mockImplementation(() => undefined)
  const mount = async () => { const ctx = new Context(); await ctx.plugin(SystemPrompt); await ctx.plugin(ToolRuntime); await ctx.plugin(McpConfigurationStorePlugin); return ctx }
  let first: Context | undefined, second: Context | undefined
  try {
    first = await mount()
    const record = first.zerowallMcpConfigurationStore.createMcpServer({ name: 'Fixture', serverName: 'fixture', transport: 'streamable-http', enabled: true, url: 'https://example.test/mcp' })
    await first.plugin(ZeroWallMcpService); await first.zerowallMcp.list()
    first.tools.register(defineTool({ name: 'mcp__fixture__gene_lookup', description: 'kinase gene lookup', parameters: {}, output: { schema: { type: 'string' }, render: () => [] }, execute: async () => 'ok' }))
    // A malformed cache is replaceable metadata, never an executable schema source.
    mkdirSync(join(root, 'harness'), { recursive: true })
    writeFileSync(join(root, 'harness', 'zerowall-mcp-tool-index.json'), JSON.stringify({ schema: 1, servers: null }))
    await (first.zerowallMcp as any).cacheMcpServer(record)
    await first.fiber.dispose(); first = undefined
    second = await mount(); await second.plugin(ZeroWallMcpService); await second.zerowallMcp.list()
    const search = () => second!.tools.execute({ name: 'mcp_search', arguments: { query: 'kinase' }, callId: ToolCallId('cached-search'), signal: new AbortController().signal })
    expect((await search()).value).toMatchObject({ matches: [expect.objectContaining({ server: 'fixture' })] })
    expect(second.tools.get('mcp__fixture__gene_lookup')).toBeUndefined()
    expect(starts).not.toHaveBeenCalled()
    expect((await second.systemPrompt.assemble({ scope: {} })).tools.some(tool => tool.name.startsWith('mcp__fixture__'))).toBe(false)
    await second.zerowallMcp.update({ id: record.id, changes: { url: 'https://other.example.test/mcp' } })
    expect((await search()).value).toMatchObject({ matches: [] })
  } finally { if (first) await first.fiber.dispose(); if (second) await second.fiber.dispose(); starts.mockRestore() }
})
