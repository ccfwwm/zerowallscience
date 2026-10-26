import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { isAgentLoopRequest, markAgentLoopRequest, type GenerateOptions } from '@deepseek-ai/dsh-llm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SkillsProjectionApi, McpServerProjectionInput } from '../src/host/projection.js'
import type { ClaudeSelection, ClaudeRequestHeader } from '../src/host/route.js'
import type { SubagentProvider, SubagentRun } from '@deepseek-ai/dsh-subagent'

const broker = vi.hoisted(() => ({ get: vi.fn() }))
// Transport registration is outside this unit boundary. Run the real Host,
// route resolver and projectors against explicit session-scoped Host services.
vi.mock('@deepseek-ai/dsh-typert-protocol', () => ({
  // Support both `@Remote` and `@Remote('wireName')` without bringing the
  // transport registration into this Host unit boundary.
  Remote: (method: unknown) => typeof method === 'string' ? () => {} : method,
  TypertRemoteService: class {
    constructor(readonly ctx: Context) {}
  },
}))
vi.mock('@zerowallscience/plugin-secrets', () => ({
  SecretBrokerClient: class { get = broker.get },
}))

import { ClaudeCodeService } from '../src/host/index.js'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

type Launch = { argv: string[]; cwd: string; env: Record<string, string>; signal: AbortSignal }
type FakeTerminal = ReturnType<typeof terminal>
type FakeProcess = ReturnType<typeof cliProcess>
function terminal() {
  const completion = deferred<{ exitCode: number }>()
  const output = new PassThrough()
  const terminate = vi.fn(async () => { completion.resolve({ exitCode: 143 }) })
  return { output, done: completion.promise, terminate, finish: (exitCode = 0) => completion.resolve({ exitCode }) }
}
function cliProcess() {
  const completion = deferred<{ exitCode: number | null; signal: NodeJS.Signals | null }>()
  const stdin = new PassThrough(), stdout = new PassThrough(), stderr = new PassThrough()
  let input = ''
  stdin.on('data', chunk => { input += chunk.toString('utf8') })
  const terminate = vi.fn(() => { stdout.end(); stderr.end(); completion.resolve({ exitCode: 143, signal: 'SIGTERM' }) })
  return {
    stdin, stdout, stderr, done: completion.promise, terminate,
    finish: (frames: unknown[], exitCode = 0) => {
      for (const frame of frames) stdout.write(`${JSON.stringify(frame)}\n`)
      stdout.end(); stderr.end(); completion.resolve({ exitCode, signal: null })
    },
    input: () => input,
  }
}

let directory: string
let cleanup: Array<() => Promise<unknown> | unknown>

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'zerowall-claude-host-'))
  cleanup = []
  vi.stubEnv('ZEROWALL_USER_DATA_DIR', directory)
  broker.get.mockReset().mockResolvedValue(undefined)
})
afterEach(async () => {
  await Promise.allSettled(cleanup.map(dispose => Promise.resolve().then(dispose)))
  vi.unstubAllEnvs()
  await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 20 })
})

async function fixture() {
  const configDir = join(directory, 'private-runtime', 'config')
  const cli = join(directory, 'private-runtime', 'versions', 'current', 'claude.js')
  const runtime = {
    configDir,
    status: vi.fn(async () => ({ installed: true, version: '2.1.309', executablePath: cli, previousVersion: '2.1.309' })),
    getExecutablePath: vi.fn(async (): Promise<string | undefined> => cli),
    installOrUpdate: vi.fn(async () => undefined),
    rollback: vi.fn(async () => undefined),
    uninstall: vi.fn(async () => undefined),
    getCliEnvironment: vi.fn((turn: Record<string, string>, _unused: unknown, mcp: Record<string, string>, configured: Record<string, string>) => ({
      CLAUDE_CONFIG_DIR: configDir, HOME: join(directory, 'private-runtime', 'home'), ...configured, ...turn, ...mcp,
    })),
  }
  const selected = new Map<string, ClaudeSelection>()
  const presets = new Map<string, string>()
  const loggedHeaders = new Map<string, ClaudeRequestHeader>()
  const workspaces = new Map<string, string>()
  const terminals: FakeTerminal[] = []
  const processes: FakeProcess[] = []
  const registeredSubagentProviders: SubagentProvider[] = []
  const launches: Launch[] = []
  const servers: McpServerProjectionInput[] = []
  const credentials = vi.fn(async () => ({ value: 'host-only-route-secret-1234567890' }))
  const snapshot = vi.fn<SkillsProjectionApi['snapshot']>(async () => ({ complete: true, skills: [] }))
  const getSkill = vi.fn<SkillsProjectionApi['get']>(async () => undefined)
  const profile = { api: 'anthropic-messages', baseURL: 'https://provider.example.test/v1', apiKeyEnv: 'CLAUDE_TEST_KEY' }
  const managedRoute = vi.fn(async (_provider: string, model: string) => ({
    api: 'anthropic-messages', baseUrl: `https://${model}.example.test`,
  }))
  const managedCredential = vi.fn(async (_provider: string, model: string) => `host-only-key-for-${model}-1234567890`)
  const services: Record<string, unknown> = {
    agentDefaultModel: { currentSelection: vi.fn(() => ({ provider: 'custom-anthropic', model: 'fallback' })) },
    sessionProjections: { stateOf: vi.fn((session: { id: string }, key: string) => key === 'agentPreset'
      ? presets.get(session.id) ?? null : { pending: selected.get(session.id) }) },
    workingDirectory: { get: vi.fn((session: { id: string }) => workspaces.get(session.id)) },
    llm: { listConfigurableProviders: vi.fn(() => [{ provider: 'custom-anthropic', settingsNs: 'provider-settings', settingsPath: ['profile'] }]) },
    settings: { describe: vi.fn(() => [{ ns: 'provider-settings', value: { profile } }]) },
    agentPresets: {},
    subagents: { registerProvider: vi.fn((provider: SubagentProvider) => { registeredSubagentProviders.push(provider); return () => { const i = registeredSubagentProviders.indexOf(provider); if (i >= 0) registeredSubagentProviders.splice(i, 1) } }) },
    credentials: { resolve: credentials },
    skills: { snapshot, get: getSkill },
    zerowallProjects: { listMcpServers: vi.fn(() => servers) },
    zerowallEnvironment: {
      listVariables: vi.fn(async () => [{ name: 'CUSTOM_BUILD_TOKEN' }]),
      readVariable: vi.fn(async () => 'host-only-configured-env-secret-1234567890'),
    },
    zerowallMcpRouteResolver: { resolve: managedRoute },
    zerowallAiCloudCredentialResolver: { resolve: managedCredential },
    subprocess: { spawnTerminal: vi.fn(async (launch: Launch) => {
      launches.push(launch)
      const handle = terminal()
      terminals.push(handle)
      return handle
    }), spawn: vi.fn((spec: Launch) => {
      launches.push(spec)
      const handle = cliProcess()
      processes.push(handle)
      return handle
    }) },
  }
  const effects: Array<() => unknown> = []
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  const context = {
    get: (key: string) => services[key],
    on: (event: string, callback: (...args: unknown[]) => unknown) => { handlers.set(event, callback); return () => handlers.delete(event) },
    inject: (keys: string[], callback: (scope: unknown) => unknown) => {
      if (keys.every(key => key in services)) callback(context)
    },
    effect: (effect: () => unknown) => { effects.push(effect) },
  }
  const host = new ClaudeCodeService(context as unknown as Context)
  // The runtime manager has its own filesystem/install contract tests. Inject
  // its process-free double here without launching pnpm or a real Claude CLI.
  Object.defineProperty(host, 'manager', { value: runtime })
  const agent = async (id: string, preset = 'standard') => {
    const cwd = join(directory, 'projects', id)
    workspaces.set(id, cwd)
    selected.set(id, { provider: 'custom-anthropic', model: `model-${id}` })
    presets.set(id, preset)
    await mkdir(cwd, { recursive: true })
    const events = [{ type: 'step/start', seq: 1, data: { turn: 1, step: 1 } }] as Array<{ type: string; seq: number; data: unknown; ignorable?: boolean }>
    return { id, session: { id, requestHeader: () => loggedHeaders.get(id), snapshotEvents: () => events,
      append: vi.fn(async (type: string, data: unknown, options?: { ignorable?: boolean }) => { events.push({ type, data, seq: events.length + 1, ...options }) }),
    }, ctx: context } as unknown as Agent
  }
  const finish = async (agent: Agent, index: number, code = 0) => {
    terminals[index]!.finish(code)
    await vi.waitFor(() => expect(host.read(agent)?.running).toBe(false))
  }
  cleanup.push(async () => {
    for (const handle of terminals) handle.finish(143)
    for (const handle of processes) handle.finish([], 143)
    for (const effect of effects) {
      const dispose = effect()
      if (typeof dispose === 'function') await dispose()
    }
    await new Promise<void>(resolve => setImmediate(resolve))
  })
  return { host, runtime, agent, selected, presets, loggedHeaders, workspaces, launches, terminals, processes, handlers, servers, credentials,
    snapshot, getSkill, profile, services, managedRoute, managedCredential, configDir, cli, finish, registeredSubagentProviders }
}

async function fileContents(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(error => {
    if (error.code === 'ENOENT') return []
    throw error
  })
  return (await Promise.all(entries.map(entry => entry.isDirectory()
    ? fileContents(join(root, entry.name))
    : readFile(join(root, entry.name), 'utf8').then(text => [text])))).flat()
}

describe('Claude Code Host session boundary', () => {
  it('keeps six Claude choices durable and session-local, while native control uses canonical Host presets', async () => {
    const f = await fixture(), agent = await f.agent('permissions', 'claude'), other = await f.agent('permissions-other', 'claude')
    type Session = Agent['session']
    const permissionState = (session: Session) => session.snapshotEvents().reduce((state, event) => {
      if (event.type === 'sandbox/mode') state.sandbox = event.data.mode
      if (event.type === 'approval/policy') state.approval = event.data.policy
      if (event.type === 'permission/preset') state.preset = event.data.preset
      return state
    }, { sandbox: 'read-only', approval: 'ask', preset: 'read-only' })
    const nativeSet = vi.fn((session: Session, value: string) => {
      session.append('permission/preset', { preset: value })
      session.append('sandbox/mode', { mode: value === 'auto' ? 'danger-full-access' : value as never })
      session.append('approval/policy', { policy: value === 'danger-full-access' ? 'never' : 'ask' })
    })
    f.services.permissionPresets = {
      current: (session: Session) => permissionState(session).preset,
      resolve: () => undefined,
      names: ['read-only', 'workspace-write', 'danger-full-access', 'auto'],
      optionOf: (value: string) => ({ value, name: value }), set: nativeSet,
    }
    f.services.sessionProjections = { stateOf: (session: Session, key: string) => key === 'permissions' ? permissionState(session)
      : key === 'agentPreset' ? f.presets.get(session.id) : { pending: f.selected.get(session.id) } }
    const request = f.handlers.get('agent/request')!
    await f.host.settingsUpdate({ permissionMode: 'default', permissionSelector: 'plugin' })
    await request({ agent }, async () => ({}))
    await f.host.settingsUpdate({ permissionMode: 'plan' })
    expect(await f.host.permissionView(agent)).toMatchObject({ mode: 'default' })
    await request({ agent: other }, async () => ({}))
    expect(await f.host.permissionView(other)).toMatchObject({ mode: 'plan' })
    const modes = ['plan', 'default', 'acceptEdits', 'dontAsk', 'auto', 'bypassPermissions'] as const
    for (const mode of modes) {
      const view = await f.host.permissionSet(agent, mode)
      expect(view).toMatchObject({ source: 'plugin', mode,
        hostSandbox: mode === 'plan' ? 'read-only' : mode === 'bypassPermissions' ? 'danger-full-access' : 'workspace-write',
        hostApproval: mode === 'dontAsk' || mode === 'bypassPermissions' ? 'never' : 'ask' })
    }
    expect(nativeSet).not.toHaveBeenCalled()
    await f.host.settingsUpdate({ permissionSelector: 'native' })
    for (const [value, mode] of [['read-only', 'plan'], ['workspace-write', 'acceptEdits'], ['danger-full-access', 'bypassPermissions'], ['auto', 'bypassPermissions']]) {
      expect(await f.host.permissionSet(agent, value!)).toMatchObject({ source: 'native', mode, hostPreset: value })
    }
    expect(nativeSet).toHaveBeenCalledTimes(4)
    expect((await f.host.permissionView(agent)).nativeOptions).toContainEqual({ value: 'auto', name: 'auto' })
    await f.host.settingsUpdate({ permissionSelector: 'plugin' })
    const running = await f.host.permissionSet(agent, 'default')
    const owner = (f.host as unknown as { sessions: Map<string, { turn?: unknown }> }).sessions.get(agent.id)!
    owner.turn = { view: { running: true, permission: running } }
    expect(await f.host.permissionSet(agent, 'plan')).toMatchObject({ mode: 'plan', runningMode: 'default', hostSandbox: 'workspace-write' })
    expect(await f.host.permissionView(other)).toMatchObject({ mode: 'plan', hostSandbox: 'read-only' })
    owner.turn = undefined
    await request({ agent }, async () => ({}))
    expect(await f.host.permissionView(agent)).toMatchObject({ mode: 'plan', hostSandbox: 'read-only' })
  })

  it('routes Claude preset requests through the managed CLI and projects the selected model resources', async () => {
    const f = await fixture(), agent = await f.agent('chat', 'claude')
    await f.host.settingsUpdate({ renderer: 'native' })
    f.snapshot.mockResolvedValue({ complete: true, skills: [{ name: 'review-plan', description: 'Review a plan', invocation: { modelInvocable: true } }] })
    f.getSkill.mockResolvedValue({ name: 'review-plan', description: 'Review a plan', invocation: { modelInvocable: true }, content: 'Use the project review checklist.' })
    broker.get.mockImplementation(async (key: string) => key === 'zerowall.environment.var.mcp_token' ? 'host-only-mcp-secret-1234567890' : undefined)
    f.servers.push({ name: 'Tools', serverName: 'tools', transport: 'stdio', enabled: true,
      command: 'node', args: ['server.mjs'], cwd: '', envRefs: { API_TOKEN: 'MCP_TOKEN' }, headerRefs: {} })
    const requestHook = f.handlers.get('agent/request') as (payload: { agent: Agent }, next: () => Promise<{ provider: string; model: string }>) => Promise<unknown>
    await requestHook({ agent }, async () => ({ provider: 'custom-anthropic', model: 'selected-claude' }))
    expect((f.host as unknown as { chatAgents: Map<string, unknown> }).chatAgents.has(agent.id)).toBe(true)
    const llmHook = f.handlers.get('llm/stream') as (options: GenerateOptions, next: () => AsyncIterable<unknown>) => AsyncIterable<unknown>
    const request = markAgentLoopRequest({
      provider: 'custom-anthropic', model: 'selected-claude', sessionId: agent.id,
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Use my configured Claude environment.' }] }],
    } as GenerateOptions)
    expect(isAgentLoopRequest(request)).toBe(true)
    let fallbackCalled = false
    const stream = llmHook(request, () => { fallbackCalled = true; return (async function* () {})() })
    const iterator = stream[Symbol.asyncIterator]()
    const first = iterator.next()
    await vi.waitFor(() => expect(f.processes).toHaveLength(1))
    const launched = f.launches[0]!
    expect(launched.argv).toContain('--include-partial-messages')
    expect(launched.argv).toContain('--input-format')
    expect(launched.argv).toContain('stream-json')
    expect(launched.argv).toContain('--model')
    expect(launched.argv[launched.argv.indexOf('--model') + 1]).toBe('selected-claude')
    expect(launched.env.ANTHROPIC_API_KEY).toBe('host-only-route-secret-1234567890')
    expect(launched.env.CUSTOM_BUILD_TOKEN).toBe('host-only-configured-env-secret-1234567890')
    expect(Object.values(launched.env)).not.toContain('host-only-mcp-secret-1234567890')
    expect(launched.argv).not.toContain('--no-session-persistence')
    expect(launched.argv.join(' ')).toContain('zerowall')
    const pluginDir = launched.argv[launched.argv.indexOf('--plugin-dir') + 1]!
    expect((await fileContents(pluginDir)).join('\n')).toContain('Use the project review checklist.')
    expect(f.processes[0]!.input()).toContain('initialize')
    f.processes[0]!.stdout.write(`${JSON.stringify({ type: 'stream_event', event: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } } })}\n`)
    expect(await first).toMatchObject({ done: false, value: { type: 'block-start', index: 0, blockType: 'text' } })
    const visibleDelta = iterator.next()
    const streamed = 'Claude streaming output remains visible before the CLI process exits. '
    f.processes[0]!.stdout.write(`${JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: streamed } } })}\n`)
    const visible = await visibleDelta
    expect(visible).toMatchObject({ done: false, value: { type: 'text-delta', index: 0 } })
    expect((visible.value as { text: string }).text.length).toBeGreaterThan(0)
    const chunks = [visible]
    const trailing = iterator.next()
    f.processes[0]!.finish([
      { type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'The final response has arrived.' } } },
      { type: 'stream_event', event: { type: 'content_block_stop', index: 0 } },
      { type: 'result', is_error: false, result: 'Claude response' },
    ])
    chunks.push(await trailing)
    while (true) {
      const next = await iterator.next()
      if (next.done) break
      chunks.push(next)
    }
    expect(fallbackCalled).toBe(false)
    expect(chunks.filter(chunk => (chunk.value as { type?: string } | undefined)?.type === 'text-delta').length).toBeGreaterThanOrEqual(2)
    expect(chunks.map(chunk => chunk.value)).toContainEqual({ type: 'finish', reason: { kind: 'stop' } })
    expect(f.host.read(agent)?.running).toBe(false)
  })

  it('registers Claude Code as a managed external subagent provider and settles its real CLI result', async () => {
    const f = await fixture(), agent = await f.agent('subagent-parent')
    const provider = f.registeredSubagentProviders.find(item => item.name === 'claude-code')
    expect(provider).toBeDefined()
    expect(provider?.capabilities).toMatchObject({ agentOptions: true, outputSchema: false, depthLimit: false })
    expect(provider?.inheritsParentContext).toBe(false)
    const signal = new AbortController().signal
    const run = await provider!.start!({
      cwd: f.workspaces.get(agent.id)!, parent: agent,
      prompt: [{ type: 'text', text: 'Review the current project changes.' }], signal,
    }) as SubagentRun
    expect(f.launches[0]?.argv).toContain('--input-format')
    await vi.waitFor(() => expect(f.processes[0]!.input()).toContain('Review the current project changes.'))
    const messages = f.processes[0]!.input().trim().split('\n').map(line => JSON.parse(line))
    expect(messages).toContainEqual(expect.objectContaining({ type: 'user', message: expect.objectContaining({ role: 'user', content: expect.arrayContaining([expect.objectContaining({ type: 'text', text: expect.stringContaining('Review the current project changes.') })]) }) }))
    f.processes[0]!.finish([
      { type: 'stream_event', event: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } } },
      { type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Reviewed changes.' } } },
      { type: 'result', is_error: false, result: 'Reviewed changes.' },
    ])
    await expect(run.result).resolves.toMatchObject({ stopReason: 'completed', output: [{ type: 'text', text: 'Reviewed changes.' }] })
    await run.dispose()
  })

  it('shares parent-scoped Skills/MCP with external children, enforces quota, and releases it after cancellation', async () => {
    const f = await fixture(), parent = await f.agent('child-resources')
    await f.host.settingsUpdate({ maxProcesses: 1 })
    const cwd = join(f.workspaces.get(parent.id)!, 'subproject')
    await mkdir(cwd)
    f.snapshot.mockResolvedValue({ complete: true, skills: [{ name: 'child-skill', description: 'Child workflow', invocation: { modelInvocable: true } }] })
    f.getSkill.mockResolvedValue({ name: 'child-skill', description: 'Child workflow', invocation: { modelInvocable: true }, content: 'Use the selected child directory.' })
    f.servers.push({ name: 'ChildTools', serverName: 'child-tools', transport: 'http', enabled: true, url: 'https://tools.example.test/mcp', envRefs: {}, headerRefs: {} })
    const cancel = new AbortController()
    const run = await f.host.startSubagent({ cwd, parent, prompt: [{ type: 'text', text: 'Inspect child project' }], signal: cancel.signal })
    const launch = f.launches[0]!
    expect(launch.cwd).toBe(cwd)
    expect(launch.argv).toContain('--include-partial-messages')
    expect(launch.argv.join(' ')).toContain('zerowall')
    expect(launch.argv).not.toContain('--no-session-persistence')
    expect(f.snapshot).toHaveBeenCalledWith({ cwd, scope: parent })
    const root = launch.argv[launch.argv.indexOf('--plugin-dir') + 1]!
    expect((await fileContents(root)).join('\n')).toContain('Use the selected child directory.')
    expect(await f.host.settingsStatus()).toMatchObject({ running: true })
    await expect(f.host.start(parent, 'another task')).rejects.toThrow('最大并发进程数')
    cancel.abort()
    expect(launch.signal.aborted).toBe(true)
    f.processes[0]!.finish([], 143)
    await expect(run.result).resolves.toMatchObject({ stopReason: 'aborted' })
    await run.dispose()
    expect(await fileContents(root)).toEqual([])
    expect(await f.host.settingsStatus()).toMatchObject({ running: false })
    await f.host.start(parent, 'after cancellation')
    await f.finish(parent, 0)
  })

  it('launches an explicit configured Anthropic child route without changing its OpenAI parent or inheriting the parent effort', async () => {
    const f = await fixture(), parent = await f.agent('cross-route-parent')
    f.selected.set(parent.id, { provider: 'openai-parent', model: 'selected-gpt', reasoningEffort: 'high' })
    const run = await f.host.startSubagent({ cwd: f.workspaces.get(parent.id)!, parent,
      prompt: [{ type: 'text', text: 'Review this project' }], signal: new AbortController().signal,
      agentOptions: { provider: 'custom-anthropic', model: 'configured-claude' },
    })
    const argv = f.launches[0]!.argv
    expect(argv[argv.indexOf('--model') + 1]).toBe('configured-claude')
    expect(argv).not.toContain('--effort')
    expect(f.selected.get(parent.id)).toEqual({ provider: 'openai-parent', model: 'selected-gpt', reasoningEffort: 'high' })
    f.processes[0]!.finish([{ type: 'result', result: 'Reviewed' }])
    await expect(run.result).resolves.toMatchObject({ stopReason: 'completed', output: [{ type: 'text', text: 'Reviewed' }] })
    await run.dispose()
    ;(f.services.llm as { listConfigurableProviders: ReturnType<typeof vi.fn> }).listConfigurableProviders.mockReturnValue([{ provider: 'openai-parent', settingsNs: 'provider-settings', settingsPath: ['profile'] }])
    f.profile.api = 'openai-completions'
    await expect(f.host.startSubagent({ cwd: f.workspaces.get(parent.id)!, parent,
      prompt: [{ type: 'text', text: 'Review this project' }], signal: new AbortController().signal,
    })).rejects.toThrow('子 agent 模型选择设置')
    await expect(f.host.startSubagent({ cwd: f.workspaces.get(parent.id)!, parent,
      prompt: [{ type: 'text', text: 'Review' }], signal: new AbortController().signal,
      agentOptions: { maxTokens: 10 },
    })).rejects.toThrow('only provider, model and reasoningEffort')
  })

  it('uses the native sandbox permission mapping and rejects settings with no managed runtime behavior', async () => {
    const f = await fixture(), agent = await f.agent('native-permission')
    await f.host.settingsUpdate({ permissionSelector: 'native', permissionMode: 'bypassPermissions' })
    await agent.session.append('sandbox/mode', { mode: 'read-only' })
    await f.host.start(agent, 'Inspect this project')
    const argv = f.launches[0]!.argv
    expect(argv[argv.indexOf('--permission-mode') + 1]).toBe('plan')
    await f.finish(agent, 0)
    await expect(f.host.settingsGlobalUpdate({ worktreeBranchPrefix: 'new-prefix' })).rejects.toThrow('does not provide')
    await expect(f.host.settingsGlobalUpdate({ idleTimeoutMinutes: '45' })).rejects.toThrow('does not provide')
    const settings = await f.host.settingsGlobalGet()
    expect(settings.settings.find(setting => setting.key === 'worktreeBranchPrefix')).toBeUndefined()
    expect(settings.settings.find(setting => setting.key === 'idleTimeoutMinutes')).toBeUndefined()
  })

  it('streams reasoning and mirrors CLI-owned tools without asking DSH to execute them again', async () => {
    const f = await fixture(), agent = await f.agent('native-tools', 'claude')
    await f.host.settingsUpdate({ renderer: 'native' })
    await f.handlers.get('agent/request')!({ agent }, async () => ({}))
    const llm = f.handlers.get('llm/stream') as (options: GenerateOptions, next: () => AsyncIterable<never>) => AsyncIterable<Record<string, unknown>>
    const output: Record<string, unknown>[] = []
    const pending = (async () => { for await (const chunk of llm(markAgentLoopRequest({ provider: 'custom-anthropic', model: 'test', sessionId: agent.id,
      tools: [{ name: 'visible_host_tool', description: 'Host policy owns this tool', parameters: { type: 'object', properties: {} } }],
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Read the file.' }] }] } as GenerateOptions), async function* () {})) output.push(chunk) })()
    await vi.waitFor(() => expect(f.processes).toHaveLength(1))
    const allowed = f.launches[0]!.argv[f.launches[0]!.argv.indexOf('--allowedTools') + 1]
    expect(allowed).toBe('mcp__zerowall__visible_host_tool')
    const frame = (event: unknown) => ({ type: 'stream_event', event })
    f.processes[0]!.finish([
      frame({ type: 'content_block_start', index: 0, content_block: { type: 'thinking' } }),
      frame({ type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'I will inspect the requested file.' } }),
      frame({ type: 'content_block_stop', index: 0 }),
      frame({ type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'read-1', name: 'Read' } }),
      frame({ type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"file_path":"README.md"}' } }),
      frame({ type: 'content_block_stop', index: 1 }),
      { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'read-1', content: 'read result', is_error: false }] } },
      frame({ type: 'content_block_start', index: 0, content_block: { type: 'text' } }),
      frame({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Read complete.' } }),
      frame({ type: 'content_block_stop', index: 0 }),
      { type: 'result', result: 'Read complete.' },
    ])
    await pending
    expect(output.some(chunk => chunk.type === 'reasoning-delta')).toBe(true)
    expect(output.some(chunk => chunk.type === 'tool-call-delta' || chunk.blockType === 'tool-call')).toBe(false)
    expect(agent.session.append).toHaveBeenCalledWith('tool/call', expect.objectContaining({ callId: 'read-1', name: 'Read', arguments: '{"file_path":"README.md"}' }))
    expect(agent.session.append).toHaveBeenCalledWith('tool/result', expect.objectContaining({ message: expect.objectContaining({ toolCallId: 'read-1', content: [{ type: 'text', text: 'read result' }] }) }), { surfaceOp: 'append' })
  })

  it('publishes plugin-rendered activity live and preserves an ignorable transcript for restart', async () => {
    const f = await fixture(), agent = await f.agent('plugin-stream', 'claude')
    await f.handlers.get('agent/request')!({ agent }, async () => ({}))
    const llm = f.handlers.get('llm/stream') as (options: GenerateOptions, next: () => AsyncIterable<never>) => AsyncIterable<unknown>
    const result = (async () => { for await (const _chunk of llm(markAgentLoopRequest({ provider: 'custom-anthropic', model: 'test', sessionId: agent.id, messages: [{ role: 'user', content: [{ type: 'text', text: 'Explain this project.' }] }] } as GenerateOptions), async function* () {})) {} })()
    await vi.waitFor(() => expect(f.processes).toHaveLength(1))
    const frame = (event: unknown) => ({ type: 'stream_event', event })
    f.processes[0]!.stdout.write(`${JSON.stringify(frame({ type: 'content_block_start', index: 0, content_block: { type: 'text' } }))}\n`)
    f.processes[0]!.stdout.write(`${JSON.stringify(frame({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Visible progress while Claude is still running and before the final result.' } }))}\n`)
    await vi.waitFor(() => expect(f.host.readTranscript(agent, 1, 1)?.activity[0]?.text).toContain('Visible progress'))
    expect(f.host.readTranscript(agent, 1, 1)?.running).toBe(true)
    f.processes[0]!.finish([frame({ type: 'content_block_stop', index: 0 }), { type: 'result', result: 'done' }])
    await result
    expect(agent.session.append).toHaveBeenCalledWith('zerowall-claude/turn', { turn: 1, step: 1 }, { ignorable: true })
    expect(agent.session.append).toHaveBeenCalledWith('zerowall-claude/transcript', expect.objectContaining({ renderer: 'plugin', running: false, activity: [expect.objectContaining({ answer: true })] }), { ignorable: true })
    ;(f.host as unknown as { sessions: Map<string, unknown> }).sessions.clear()
    expect(f.host.readTranscript(agent, 1, 1)?.activity[0]?.text).toContain('Visible progress')
  })

  it('keeps the ordinary DSH request path for Standard preset sessions', async () => {
    const f = await fixture(), agent = await f.agent('standard-chat', 'standard')
    const requestHook = f.handlers.get('agent/request') as (payload: { agent: Agent }, next: () => Promise<{ provider: string; model: string }>) => Promise<unknown>
    await requestHook({ agent }, async () => ({ provider: 'custom-anthropic', model: 'standard-model' }))
    const llmHook = f.handlers.get('llm/stream') as (options: GenerateOptions, next: () => AsyncIterable<string>) => AsyncIterable<string>
    const request = markAgentLoopRequest({ provider: 'custom-anthropic', model: 'standard-model', sessionId: agent.id, messages: [] } as GenerateOptions)
    const fallback = async function* () { yield 'standard' }
    const chunks: string[] = []
    for await (const chunk of llmHook(request, fallback)) chunks.push(chunk)
    expect(chunks).toEqual(['standard'])
    expect(f.processes).toHaveLength(0)
  })

  it('exposes application-level settings management without requiring a conversation Agent', async () => {
    const f = await fixture()
    expect(await f.host.settingsStatus()).toMatchObject({ desktop: true, installed: true, executablePath: f.cli, running: false })
    await f.host.settingsInstall()
    await f.host.settingsRollback()
    await f.host.settingsUninstall()
    expect(f.runtime.installOrUpdate).toHaveBeenCalledOnce()
    expect(f.runtime.rollback).toHaveBeenCalledOnce()
    expect(f.runtime.uninstall).toHaveBeenCalledOnce()
  })

  it('exposes native settings as dynamic descriptors and updates only supported fields', async () => {
    const f = await fixture()
    await mkdir(join(f.configDir, 'output-styles'), { recursive: true })
    await writeFile(join(f.configDir, 'output-styles', 'review.md'), '---\nname: Project Reviewer\n---\nprivate body')
    const initial = await f.host.settingsGlobalGet()
    expect(initial.settings.map(setting => setting.key)).toEqual([
      'outputStyle', 'permissionSelector', 'permissionMode', 'renderer', 'prose', 'maxProcesses',
    ])
    expect(initial.settings[0]).toMatchObject({ kind: 'select', value: 'Default', effect: 'new-session' })
    expect(initial.settings[0]?.kind === 'select' && initial.settings[0].options).toContainEqual({ value: 'Project Reviewer', label: 'Project Reviewer', source: 'user' })
    expect(JSON.stringify(initial)).not.toContain('private body')
    const updated = await f.host.settingsGlobalUpdate({ outputStyle: 'Project Reviewer', renderer: 'native', maxProcesses: '6' })
    expect(updated.settings.find(setting => setting.key === 'outputStyle')).toMatchObject({ value: 'Project Reviewer' })
    expect(updated.settings.find(setting => setting.key === 'renderer')).toMatchObject({ value: 'native' })
    expect(updated.settings.find(setting => setting.key === 'maxProcesses')).toMatchObject({ value: '6' })
    expect(JSON.parse(await readFile(join(f.configDir, 'settings.json'), 'utf8'))).toMatchObject({ outputStyle: 'Project Reviewer' })
    expect(JSON.parse(await readFile(join(f.configDir, 'plugin-settings.json'), 'utf8'))).toMatchObject({ renderer: 'native', maxProcesses: 6 })
    await expect(f.host.settingsGlobalUpdate({ arbitrary: 'no' })).rejects.toThrow('Unsupported Claude Code global setting')
    await expect(f.host.settingsGlobalUpdate({ outputStyle: 'missing' })).rejects.toThrow('output style is unavailable')
    await expect(f.host.settingsGlobalUpdate({ maxProcesses: '0' })).rejects.toThrow('invalid')
  })

  it('keeps status/read passive and only installs, rolls back or removes on explicit calls', async () => {
    const f = await fixture(), agent = await f.agent('install')
    expect(await f.host.status(agent)).toEqual({ desktop: true, installed: true, version: '2.1.309', executablePath: f.cli, rollbackAvailable: true, running: false, readiness: 'installed' })
    expect(f.host.read(agent)).toBeNull()
    expect(f.runtime.installOrUpdate).not.toHaveBeenCalled()
    expect(f.runtime.rollback).not.toHaveBeenCalled()
    expect(f.runtime.uninstall).not.toHaveBeenCalled()
    await f.host.install(agent)
    await f.host.rollback(agent)
    await f.host.uninstall(agent)
    expect(f.runtime.installOrUpdate).toHaveBeenCalledTimes(1)
    expect(f.runtime.rollback).toHaveBeenCalledTimes(1)
    expect(f.runtime.uninstall).toHaveBeenCalledTimes(1)
    expect(f.launches).toHaveLength(0)
  })

  it('hides CLI management and rejects runs outside Desktop without invoking the manager', async () => {
    const f = await fixture(), agent = await f.agent('web')
    vi.stubEnv('ZEROWALL_USER_DATA_DIR', '')
    expect(await f.host.status(agent)).toEqual({ desktop: false, installed: false, rollbackAvailable: false, running: false })
    await expect(f.host.start(agent, 'work')).rejects.toThrow('仅适用于 ZeroWall Desktop')
    await expect(f.host.install(agent)).rejects.toThrow('安装管理未完成')
    expect(f.runtime.getExecutablePath).not.toHaveBeenCalled()
    expect(f.runtime.installOrUpdate).not.toHaveBeenCalled()
  })

  it('re-resolves the current platform route and credentials for every new turn', async () => {
    const f = await fixture(), agent = await f.agent('switch')
    f.selected.set(agent.id, { provider: 'zerowall-ai-cloud-primary', model: 'model-a' })
    const first = await f.host.start(agent, 'first task')
    expect(first).toMatchObject({ provider: 'zerowall-ai-cloud-primary', model: 'model-a', running: true })
    expect(f.launches[0]?.env).toMatchObject({ ANTHROPIC_MODEL: 'model-a', ANTHROPIC_API_KEY: 'host-only-key-for-model-a-1234567890', ANTHROPIC_BASE_URL: 'https://model-a.example.test' })
    await f.finish(agent, 0)
    f.selected.set(agent.id, { provider: 'zerowall-ai-cloud-secondary', model: 'model-b', reasoningEffort: 'xhigh' })
    await f.host.start(agent, 'second task')
    expect(f.launches[1]?.env).toMatchObject({ ANTHROPIC_MODEL: 'model-b', ANTHROPIC_API_KEY: 'host-only-key-for-model-b-1234567890', ANTHROPIC_BASE_URL: 'https://model-b.example.test' })
    expect(f.managedRoute.mock.calls).toEqual([
      ['zerowall-ai-cloud-primary', 'model-a'], ['zerowall-ai-cloud-secondary', 'model-b'],
    ])
    expect(f.managedCredential).toHaveBeenCalledTimes(2)
    const effortIndex = f.launches[1]!.argv.indexOf('--effort')
    expect(effortIndex).toBeGreaterThan(0)
    expect(f.launches[1]!.argv[effortIndex + 1]).toBe('xhigh')
    expect(JSON.stringify(f.host.read(agent))).not.toContain('host-only-key')
  })

  it('launches the exact managed native binary and retains that turn path after the installed runtime changes', async () => {
    const f = await fixture(), agent = await f.agent('native-path')
    const native = join(directory, 'private-runtime', 'versions', 'native', 'bin', 'claude.exe')
    f.runtime.getExecutablePath.mockResolvedValue(native)
    vi.stubEnv('PATH', join(directory, 'user-claude-bin'))
    f.selected.set(agent.id, { provider: 'custom-anthropic', model: 'chosen-model', reasoningEffort: 'max' })
    const turn = await f.host.start(agent, 'preserve my route')
    expect(turn.executablePath).toBe(native)
    expect(f.launches[0]?.argv[0]).toBe(native)
    expect(f.launches[0]?.argv).not.toContain(process.execPath)
    expect(f.launches[0]?.argv.slice(-5)).toEqual(['chosen-model', '--effort', 'max', '--', 'preserve my route'])
    f.runtime.getExecutablePath.mockResolvedValue(join(directory, 'different-runtime', 'claude.exe'))
    f.runtime.status.mockResolvedValue({ installed: true, version: '2.1.309', executablePath: 'changed-runtime', previousVersion: '2.1.309' })
    expect((await f.host.status(agent)).executablePath).toBe('changed-runtime')
    expect(f.host.read(agent)?.executablePath).toBe(native)
    expect(JSON.stringify(f.host.read(agent))).not.toContain('host-only-route-secret')
  })

  it('restores the logged model without forwarding adapter-default effort and applies an explicit effort next turn', async () => {
    const f = await fixture(), agent = await f.agent('effort-ownership')
    f.selected.delete(agent.id)
    f.loggedHeaders.set(agent.id, {
      config: { provider: 'custom-anthropic', model: 'logged-claude', reasoningEffort: 'minimal' },
      adapterDefaults: { reasoningEffort: true },
    })
    await f.host.start(agent, 'use the conversation route')
    expect(f.launches[0]?.argv).toContain('logged-claude')
    expect(f.launches[0]?.argv).not.toContain('--effort')
    await f.finish(agent, 0)
    f.selected.set(agent.id, { provider: 'custom-anthropic', model: 'selected-claude', reasoningEffort: 'max' })
    await f.host.start(agent, 'use the explicit user choice')
    const next = f.launches[1]!.argv
    expect(next).toContain('selected-claude')
    expect(next[next.indexOf('--effort') + 1]).toBe('max')
    expect(f.loggedHeaders.get(agent.id)?.config.reasoningEffort).toBe('minimal')
  })

  it('rejects an explicitly logged unsupported effort before resolving credentials or spawning', async () => {
    const f = await fixture(), agent = await f.agent('unsupported-logged-effort')
    f.selected.delete(agent.id)
    f.loggedHeaders.set(agent.id, {
      config: { provider: 'custom-anthropic', model: 'logged-claude', reasoningEffort: 'minimal' },
    })
    await expect(f.host.start(agent, 'keep my explicit selection')).rejects.toThrow('推理强度不受此 Claude Code 版本支持')
    expect(f.credentials).not.toHaveBeenCalled()
    expect(f.launches).toHaveLength(0)
    expect(f.host.read(agent)).toBeNull()
  })

  it('isolates workspaces, projections and history between simultaneously running sessions', async () => {
    const f = await fixture(), a = await f.agent('project-a'), b = await f.agent('project-b')
    await f.host.start(a, 'private project A request')
    f.terminals[0]!.output.write('private project A result')
    await f.finish(a, 0)
    await f.host.start(a, 'continue A')
    await f.host.start(b, 'project B only')
    expect(f.launches[1]?.cwd).toBe(f.workspaces.get(a.id))
    expect(f.launches[2]?.cwd).toBe(f.workspaces.get(b.id))
    expect(f.launches[1]?.argv.at(-1)).toContain('private project A result')
    expect(f.launches[2]?.argv.at(-1)).toBe('project B only')
    const projection = (launch: Launch) => launch.argv[launch.argv.indexOf('--plugin-dir') + 1]!
    expect(projection(f.launches[1]!)).not.toBe(projection(f.launches[2]!))
    expect(projection(f.launches[1]!)).toContain(f.configDir)
    expect(f.snapshot).toHaveBeenCalledWith({ cwd: f.workspaces.get(a.id), scope: a })
    expect(f.snapshot).toHaveBeenCalledWith({ cwd: f.workspaces.get(b.id), scope: b })
    const view = f.host.read(a)!
    view.skipped.push('client mutation')
    view.output = 'client mutation'
    expect(f.host.read(a)?.skipped).not.toContain('client mutation')
    expect(f.host.read(b)?.model).toBe('model-project-b')
    const projectEntries = await readdir(f.workspaces.get(a.id)!)
    expect(projectEntries).toEqual([])
  })

  it('puts API and MCP secrets only in the child environment and redacts streamed output/history', async () => {
    const f = await fixture(), agent = await f.agent('secrets')
    const apiKey = 'host-only-route-secret-1234567890', mcpKey = 'host-only-mcp-secret-1234567890'
    broker.get.mockResolvedValue(mcpKey)
    f.servers.push({ name: 'tools', serverName: 'tools', transport: 'stdio', enabled: true,
      command: 'node', args: ['server.mjs'], cwd: '', envRefs: { API_TOKEN: 'MCP_TOKEN' }, headerRefs: {} })
    const sentinel = join(directory, 'existing-user-claude-config.json')
    await writeFile(sentinel, 'user configuration remains unchanged')
    await f.host.start(agent, 'inspect project')
    expect(f.launches[0]?.env.ANTHROPIC_API_KEY).toBe(apiKey)
    expect(Object.values(f.launches[0]!.env)).toContain(mcpKey)
    expect(f.launches[0]?.argv).toContain('acceptEdits')
    expect(f.launches[0]?.argv).toContain('--no-session-persistence')
    expect(f.launches[0]?.argv).toContain('mcp__tools__*')
    expect(f.launches[0]?.argv).not.toContain('mcp__*')
    expect(f.launches[0]?.argv.at(-2)).toBe('--')
    const config = (await fileContents(f.configDir)).join('\n')
    expect(config).toContain('${ZW_CLAUDE_MCP_')
    for (const secret of [apiKey, mcpKey]) {
      expect(config).not.toContain(secret)
      expect(JSON.stringify(f.launches[0]?.argv)).not.toContain(secret)
    }
    f.terminals[0]!.output.write(`api=${apiKey.slice(0, 12)}`)
    expect(f.host.read(agent)?.output).not.toContain(apiKey.slice(0, 12))
    f.terminals[0]!.output.write(`${apiKey.slice(12)};mcp=${mcpKey};done`)
    await f.finish(agent, 0)
    expect(f.host.read(agent)?.output).toBe('api=[REDACTED];mcp=[REDACTED];done')
    expect(JSON.stringify(await f.host.status(agent))).not.toContain(apiKey)
    await f.host.start(agent, 'next request')
    const history = f.launches[1]!.argv.at(-1)!
    expect(history).toContain('[REDACTED]')
    expect(history).not.toContain(apiKey)
    expect(history).not.toContain(mcpKey)
    expect(await readFile(sentinel, 'utf8')).toBe('user configuration remains unchanged')
    expect(broker.get).toHaveBeenCalledWith('zerowall.environment.var.mcp_token')
    expect((f.services.settings as { describe: ReturnType<typeof vi.fn> }).describe).toHaveBeenCalledWith({ redactSecrets: true })
  })

  it('authorizes every projected MCP server through one variadic option', async () => {
    const f = await fixture(), agent = await f.agent('many-mcp')
    for (const serverName of ['first', 'second']) {
      f.servers.push({ name: serverName, serverName, transport: 'stdio', enabled: true,
        command: 'node', args: ['server.mjs'], cwd: '', envRefs: {}, headerRefs: {} })
    }
    await f.host.start(agent, '--model is user text')
    const argv = f.launches[0]!.argv
    expect(argv.filter(arg => arg === '--allowedTools')).toHaveLength(1)
    expect(argv.slice(argv.indexOf('--allowedTools'))).toEqual([
      '--allowedTools', 'mcp__first__*', 'mcp__second__*', '--', '--model is user text',
    ])
  })

  it('wraps independent MCP directories within each turn projection and cleans them after completion', async () => {
    const f = await fixture(), agent = await f.agent('mcp-working-directory')
    const cwd = f.workspaces.get(agent.id)!
    for (const [serverName, workingDirectory] of [['same', cwd], ['inherited', ''], ['different', join(cwd, 'other')], ['relative', '.']] as const) {
      f.servers.push({ name: serverName, serverName, transport: 'stdio', enabled: true,
        command: 'node', args: ['server.mjs'], cwd: workingDirectory, envRefs: {}, headerRefs: {} })
    }
    const turn = await f.host.start(agent, 'inspect project')
    expect(turn.mcp).toBe(3)
    expect(turn.skipped).toEqual([
      'MCP relative: 工作目录无效：MCP 目录必须为空白或绝对目录。',
    ])
    const launch = f.launches[0]!
    expect(launch.cwd).toBe(cwd)
    expect(launch.argv).toContain('mcp__same__*')
    expect(launch.argv).toContain('mcp__inherited__*')
    expect(launch.argv).toContain('mcp__different__*')
    expect(launch.argv).not.toContain('mcp__relative__*')
    const config = JSON.parse(await readFile(launch.argv[launch.argv.indexOf('--mcp-config') + 1]!, 'utf8')) as { mcpServers: Record<string, unknown> }
    const launchers = Object.fromEntries(await Promise.all(['same', 'inherited', 'different'].map(async serverName => {
      const server = config.mcpServers[serverName] as { command: string; args: string[] }
      expect(server.command).toBe(process.execPath)
      expect(server.args[0]).toContain('mcp-launchers')
      return [serverName, JSON.parse(await readFile(server.args[1]!, 'utf8')) as Record<string, unknown>]
    })))
    expect(launchers.same).toEqual({ command: process.execPath, args: ['server.mjs'], cwd, env: {}, electron: false })
    expect(launchers.inherited).toEqual({ command: process.execPath, args: ['server.mjs'], cwd, env: {}, electron: false })
    expect(launchers.different).toEqual({ command: process.execPath, args: ['server.mjs'], cwd: join(cwd, 'other'), env: {}, electron: false })
    expect(f.servers.map(server => server.cwd)).toEqual([cwd, '', join(cwd, 'other'), '.'])
    await f.finish(agent, 0)
    await vi.waitFor(async () => expect(await fileContents(f.configDir)).toEqual([]))
  })

  it('rejects incompatible protocols, missing installs and relative workspaces before spawning', async () => {
    const f = await fixture(), agent = await f.agent('invalid')
    f.profile.api = 'openai-completions'
    await expect(f.host.start(agent, 'work')).rejects.toThrow('Anthropic Messages')
    f.profile.api = 'anthropic-messages'
    f.runtime.getExecutablePath.mockResolvedValueOnce(undefined)
    await expect(f.host.start(agent, 'work')).rejects.toThrow('请先安装')
    f.workspaces.set(agent.id, 'relative-workspace')
    await expect(f.host.start(agent, 'work')).rejects.toThrow('有效的项目目录')
    expect(f.launches).toHaveLength(0)
    expect(f.runtime.installOrUpdate).not.toHaveBeenCalled()
    expect(f.host.read(agent)).toBeNull()
  })

  it('rejects concurrent preparation/installation and releases the install lock after failure', async () => {
    const f = await fixture(), agent = await f.agent('locks')
    const preparation = deferred<string | undefined>()
    f.runtime.getExecutablePath.mockReturnValueOnce(preparation.promise)
    const pending = f.host.start(agent, 'first')
    await expect(f.host.start(agent, 'second')).rejects.toThrow('正在运行')
    await expect(f.host.install(agent)).rejects.toThrow('请先停止')
    preparation.resolve(f.cli)
    await pending
    await f.finish(agent, 0)
    const installation = deferred<undefined>()
    f.runtime.installOrUpdate.mockReturnValueOnce(installation.promise)
    const installing = f.host.install(agent)
    await expect(f.host.start(agent, 'during install')).rejects.toThrow('正在运行')
    await expect(f.host.uninstall(agent)).rejects.toThrow('请先停止')
    installation.reject(new Error('untrusted installer credentials must stay private'))
    await expect(installing).rejects.toThrow('安装管理未完成')
    await expect(f.host.install(agent)).resolves.toMatchObject({ installed: true })
  })

  it('stops only the owning session and clears history only after completion', async () => {
    const f = await fixture(), a = await f.agent('stop-a'), b = await f.agent('stop-b')
    await f.host.start(a, 'A work')
    await f.host.start(b, 'B work')
    expect(await f.host.status(a)).toMatchObject({ running: true })
    expect(() => f.host.clear(a)).toThrow('请先停止')
    await f.host.stop(a)
    expect(f.launches[0]?.signal.aborted).toBe(true)
    expect(f.terminals[0]?.terminate).toHaveBeenCalledOnce()
    expect(f.terminals[1]?.terminate).not.toHaveBeenCalled()
    expect(f.host.read(b)?.running).toBe(true)
    await vi.waitFor(() => expect(f.host.read(a)?.running).toBe(false))
    f.host.clear(a)
    expect(f.host.read(a)).toBeNull()
    await f.host.start(a, 'fresh A request')
    expect(f.launches[2]?.argv.at(-1)).toBe('fresh A request')
  })

  it('reports preparation as running and can stop it before any process or projection exists', async () => {
    const f = await fixture(), a = await f.agent('prepare-a'), b = await f.agent('prepare-b')
    const preparation = deferred<string | undefined>()
    f.runtime.getExecutablePath.mockReturnValueOnce(preparation.promise)
    const pending = f.host.start(a, 'preparing task')
    const rejected = expect(pending).rejects.toThrow('任务已停止')
    expect(await f.host.status(a)).toMatchObject({ running: true })
    expect(await f.host.status(b)).toMatchObject({ running: false })
    expect(() => f.host.clear(a)).toThrow('请先停止')
    await f.host.stop(a)
    preparation.resolve(f.cli)
    await rejected
    expect(f.launches).toHaveLength(0)
    expect(await fileContents(f.configDir)).toEqual([])
    expect(await f.host.status(a)).toMatchObject({ running: false })
    await expect(f.host.start(a, 'retry after cancellation')).resolves.toMatchObject({ running: true })
  })

  it('removes projection files after a preparation error or subprocess launch failure', async () => {
    const f = await fixture(), agent = await f.agent('cleanup')
    f.runtime.getCliEnvironment.mockImplementationOnce(() => { throw new Error('private environment error') })
    await expect(f.host.start(agent, 'prepare failure')).rejects.toThrow('无法准备当前会话')
    expect(await fileContents(f.configDir)).toEqual([])
    expect(await f.host.status(agent)).toMatchObject({ running: false })
    const subprocess = f.services.subprocess as { spawnTerminal: ReturnType<typeof vi.fn> }
    subprocess.spawnTerminal.mockRejectedValueOnce(new Error('private subprocess error'))
    await expect(f.host.start(agent, 'launch failure')).resolves.toMatchObject({ running: false, message: 'Claude Code 无法启动，请检查安装状态后重试。' })
    expect(await fileContents(f.configDir)).toEqual([])
    expect(JSON.stringify(f.host.read(agent))).not.toContain('private subprocess')
    await expect(f.host.start(agent, 'retry after launch failure')).resolves.toMatchObject({ running: true })
  })

  it('cancels a pending subprocess launch and removes its session projection', async () => {
    const f = await fixture(), agent = await f.agent('pending-launch')
    const subprocess = f.services.subprocess as { spawnTerminal: ReturnType<typeof vi.fn> }
    let launchSignal: AbortSignal | undefined
    subprocess.spawnTerminal.mockImplementationOnce((launch: Launch) => {
      launchSignal = launch.signal
      return new Promise((_resolve, reject) => {
        launch.signal.addEventListener('abort', () => reject(new Error('aborted launch')), { once: true })
      })
    })
    const pending = f.host.start(agent, 'cancel while spawning')
    await vi.waitFor(() => expect(launchSignal).toBeDefined())
    expect(await f.host.status(agent)).toMatchObject({ running: true })
    expect((await fileContents(f.configDir)).length).toBeGreaterThan(0)
    await f.host.stop(agent)
    await expect(pending).resolves.toMatchObject({ running: false })
    expect(launchSignal?.aborted).toBe(true)
    expect(await fileContents(f.configDir)).toEqual([])
    expect(await f.host.status(agent)).toMatchObject({ running: false })
  })
})
