import type { Context } from '@deepseek-ai/cordis'
import type { Agent, AgentOptions } from '@deepseek-ai/dsh-agent'
import { createToolResultMessage, isAgentLoopRequest, ToolCallId, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import type { SubprocessHandle, SubprocessTerminalHandle, SubprocessRuntime } from '@deepseek-ai/dsh-subprocess'
import { NO_START_CAPABILITIES, assertUsableCwd, settleRunResult, subprocessRunHandle, type ResolvedSubagentStartRequest, type SubagentProvider } from '@deepseek-ai/dsh-subagent'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { SubagentResult, SubagentRun } from '@deepseek-ai/dsh-subagent'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { chmod, lstat, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import { stripVTControlCharacters } from 'node:util'
import { SecretBrokerClient } from '@zerowallscience/plugin-secrets'
import { ClaudeRuntimeManager, resolveBundledPnpmRuntime, type ProcessRunner } from './runtime.js'
import { claudeEnvironmentOverlay } from './environment.js'
import { writeClaudeMcpLaunchers } from './mcp-launcher.js'
import { prepareClaudeMcpRuntime, projectMcpForClaude, projectSkillsForClaude, type McpServerProjectionInput, type SkillsProjectionApi } from './projection.js'
import { ClaudeSafeOutput, resolveClaudeRoute, selectedClaudeModel, type ClaudeRouteServices, type ClaudeSelection } from './route.js'
import type { ClaudeCodeStatus, ClaudeCodeTurn, ClaudeGlobalSettingOption, ClaudeGlobalSettingsView, ClaudeNativeSettings, ClaudePermissionMode, ClaudeTranscript } from '../shared/types.js'
import { claudePromptFromRequest, parseClaudeCliEvent } from './cli.js'
import { claudePermissionMode } from './permission-mode.js'
import { mountClaudeSubagentTools } from './subagent-tool.js'
import { setSandboxMode } from '@deepseek-ai/dsh-sandbox-policy'
import { setApprovalPolicy, type ApprovalService } from '@deepseek-ai/dsh-user-approval'
import type { PermissionPresetService } from '@deepseek-ai/dsh-permission-presets'
import type { ToolRuntime } from '@deepseek-ai/dsh-tools'
import { SANDBOX_BY_CLAUDE_MODE, isClaudePermissionMode, CLAUDE_MODE_BY_SANDBOX } from './permission-mode.js'
import { ClaudeSessionBindings, type ClaudeSessionBinding } from './session-binding.js'
import { createHostToolBridge, hostToolApproval, managedSdkSpawner, sdkGenerationEnvironment, sdkInput, sdkSystemPrompt, startSdkQuery, type Query, type Options as ClaudeSdkOptions } from './sdk-driver.js'
import { claudeFailureCategory } from './diagnostic.js'
import type { ClaudePermissionView } from '../shared/types.js'
import { resourceStatus } from './resource-status.js'
import { appendClaudeToolCall, settleClaudeToolCalls } from './tool-journal.js'
import { ClaudeMetricsCollector } from './metrics.js'
import { claudeMetricsProjection } from './metrics-projection.js'

export const name = 'zerowall-claude-code'
export const inject = ['typert', 'agentDefaultModel', 'subprocess', 'subagents', 'workingDirectory', 'skills', 'zerowallProjects', 'zerowallEnvironment', 'credentials', 'settings', 'llm', 'sessionProjections', 'agentPresets', 'tools', 'systemPrompt', 'permissionPresets', 'approval', 'attachments']

declare module '@deepseek-ai/cordis' { interface Context { zerowallClaudeCode: ClaudeCodeService } }

interface OwnedTurn {
  view: ClaudeCodeTurn
  safe: ClaudeSafeOutput
  terminal?: SubprocessTerminalHandle
  process?: SubprocessHandle
  projectionRoot?: string
  cancel: AbortController
  diagnostics?: ClaudeSafeOutput
  query?: Query
  binding?: ClaudeSessionBinding
  bindingStore?: ClaudeSessionBindings
  release?: () => void
  approvalCalls?: Set<string>
  drainBridge?: () => Promise<unknown>
}
interface SessionRuntime { turn?: OwnedTurn; history: string[]; busy: boolean; preparing?: AbortController }
type ManagedRoute = NonNullable<ClaudeRouteServices['managedRoute']>
type ManagedCredential = NonNullable<ClaudeRouteServices['managedCredential']>

/** Never forward installer diagnostics; capture only the bounded CLI version probe. */
const runInstaller: ProcessRunner = (command, args, options) => new Promise((resolve, reject) => {
  const versionProbe = args.at(-1) === '--version'
  let stdout = ''
  const child = spawn(command, args, { ...options, env: { ...options.env,
    ...(process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
  }, stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout?.setEncoding('utf8')
  child.stdout?.on('data', (data: string) => { if (versionProbe) stdout = (stdout + data).slice(0, 4096) })
  child.stderr?.on('data', () => {})
  child.once('error', () => reject(new Error('Claude Code 安装进程无法启动。')))
  child.once('close', code => resolve({ code: code ?? -1, ...(versionProbe ? { stdout } : {}) }))
})

const CLAUDE_SETTINGS_DEFAULTS: ClaudeNativeSettings = {
  outputStyle: 'Default', permissionSelector: 'plugin', permissionMode: 'acceptEdits', renderer: 'plugin',
  prose: 'plain', maxProcesses: 4,
}
const CLAUDE_PERMISSION_MODES: readonly ClaudePermissionMode[] = ['default', 'dontAsk', 'acceptEdits', 'auto', 'plan', 'bypassPermissions']
const CLAUDE_PERMISSION_SELECTORS = ['plugin', 'native'] as const
const CLAUDE_RENDERERS = ['plugin', 'native'] as const
const CLAUDE_PROSE_MODES = ['plain', 'enhanced'] as const

function knownNativeSettings(value: Record<string, unknown>): ClaudeNativeSettings {
  const keys = ['outputStyle', 'permissionSelector', 'permissionMode', 'renderer', 'prose', 'worktreeBranchPrefix', 'maxProcesses', 'idleTimeoutMinutes']
  return validateNativeSettings(Object.fromEntries(keys.filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]])))
}

function validateNativeSettings(value: unknown): ClaudeNativeSettings {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Claude Code native settings must be an object.')
  const input = value as Record<string, unknown>
  const result: ClaudeNativeSettings = {}
  if (input.outputStyle !== undefined) {
    if (typeof input.outputStyle !== 'string' || input.outputStyle.length > 128 || !/^[\p{L}\p{N}][\p{L}\p{N} ._()[\]-]{0,127}$/u.test(input.outputStyle)) throw new Error('Claude Code output style is invalid.')
    result.outputStyle = input.outputStyle
  }
  if (input.permissionSelector !== undefined) {
    if (typeof input.permissionSelector !== 'string' || !CLAUDE_PERMISSION_SELECTORS.includes(input.permissionSelector as typeof CLAUDE_PERMISSION_SELECTORS[number])) throw new Error('Claude Code permission selector is invalid.')
    result.permissionSelector = input.permissionSelector as NonNullable<ClaudeNativeSettings['permissionSelector']>
  }
  if (input.permissionMode !== undefined) {
    if (typeof input.permissionMode !== 'string' || !CLAUDE_PERMISSION_MODES.includes(input.permissionMode as ClaudePermissionMode)) throw new Error('Claude Code permission mode is invalid.')
    result.permissionMode = input.permissionMode as ClaudePermissionMode
  }
  if (input.renderer !== undefined) {
    if (typeof input.renderer !== 'string' || !CLAUDE_RENDERERS.includes(input.renderer as typeof CLAUDE_RENDERERS[number])) throw new Error('Claude Code renderer is invalid.')
    result.renderer = input.renderer as NonNullable<ClaudeNativeSettings['renderer']>
  }
  if (input.prose !== undefined) {
    if (typeof input.prose !== 'string' || !CLAUDE_PROSE_MODES.includes(input.prose as typeof CLAUDE_PROSE_MODES[number])) throw new Error('Claude Code prose mode is invalid.')
    result.prose = input.prose as NonNullable<ClaudeNativeSettings['prose']>
  }
  if (input.worktreeBranchPrefix !== undefined) {
    const prefix = input.worktreeBranchPrefix
    if (typeof prefix !== 'string' || prefix.length < 1 || prefix.length > 128 || prefix.trim() !== prefix || prefix.startsWith('/') || prefix.endsWith('/') || prefix.includes('//') || prefix.includes('..') || prefix.includes('@{') || /[\0-\x20\x7f~^:?*[\\]/u.test(prefix) || prefix.split('/').some(segment => !segment || segment.startsWith('.') || segment.endsWith('.lock'))) throw new Error('Claude Code worktree branch prefix is invalid.')
    result.worktreeBranchPrefix = prefix
  }
  for (const key of ['maxProcesses', 'idleTimeoutMinutes'] as const) {
    if (input[key] !== undefined) {
      const max = key === 'maxProcesses' ? 16 : 1440
      if (typeof input[key] !== 'number' || !Number.isSafeInteger(input[key]) || input[key] < 1 || input[key] > max) throw new Error(`Claude Code setting ${key} is invalid.`)
      result[key] = input[key]
    }
  }
  return result
}

/** One installed runtime, with credentials resolved afresh for every prompt. */
export class ClaudeCodeService extends TypertRemoteService {
  private manager?: ClaudeRuntimeManager
  private readonly secrets = new SecretBrokerClient()
  private readonly sessions = new Map<string, SessionRuntime>()
  private managedRoute: ManagedRoute | undefined
  private managedCredential: ManagedCredential | undefined
  private mutation = false
  private readonly chatAgents = new Map<string, Agent>()
  private processReservations = 0

  constructor(ctx: Context) {
    super(ctx, 'zerowallClaudeCode')
    ctx.sessionProjections.register(claudeMetricsProjection)
    ctx.inject(['subagents'], scope => {
      const subagents = scope.get('subagents') as { registerProvider(provider: SubagentProvider): () => void }
      const dispose = subagents.registerProvider(new ClaudeCodeSubagentProvider(this))
      scope.effect(() => dispose)
    })
    mountClaudeSubagentTools(ctx)
    ctx.inject(['zerowallMcpRouteResolver'], scope => {
      const resolver = scope.get('zerowallMcpRouteResolver') as { resolve: ManagedRoute }
      this.managedRoute = (provider, model) => resolver.resolve(provider, model)
      scope.effect(() => () => { this.managedRoute = undefined })
    })
    ctx.inject(['zerowallAiCloudCredentialResolver'], scope => {
      const resolver = scope.get('zerowallAiCloudCredentialResolver') as { resolve: ManagedCredential }
      this.managedCredential = (provider, model) => resolver.resolve(provider, model)
      scope.effect(() => () => { this.managedCredential = undefined })
    })
    ctx.on('agent/request', async ({ agent }, next) => {
      const config = await next()
      const projections = ctx.get('sessionProjections') as { stateOf(session: unknown, key: string): string | null | undefined }
      if (projections.stateOf(agent.session, 'agentPreset') === 'claude') {
        // Align before the loop assembles runtime policy context and tool schemas.
        // Doing this in llm/stream alone made the prompt describe the old policy.
        const permission = await this.permissionView(agent)
        if (permission.source === 'plugin') {
          if (!agent.session.snapshotEvents().some(event => event.type === 'zerowall-claude/permission')) {
            await agent.session.append('zerowall-claude/permission', { mode: permission.mode }, { ignorable: true })
          }
          this.alignPermission(agent, permission.mode)
        }
        this.chatAgents.set(agent.id, agent)
      } else this.chatAgents.delete(agent.id)
      return config
    })
    ctx.on('agent/status', ({ agent, status }) => {
      if (status === 'idle') this.chatAgents.delete(agent.id)
    })
    const thisService = this
    ctx.on('llm/stream', async function* (options, next) {
      const routed = options.purpose === undefined && isAgentLoopRequest(options) && options.sessionId !== undefined
        ? thisService.chatAgents.get(String(options.sessionId)) : undefined
      if (!routed) { yield* next(); return }
      yield* thisService.streamConversation(routed, {
        provider: options.provider,
        model: options.model,
        ...(options.reasoningEffort === undefined ? {} : { reasoningEffort: options.reasoningEffort }),
      }, options)
    })
    ctx.effect(() => async () => {
      await Promise.allSettled([...this.sessions.values()].map(async state => {
        state.preparing?.abort()
        state.turn?.cancel.abort()
        state.turn?.query?.close()
        await state.turn?.terminal?.terminate()
        state.turn?.process?.terminate()
      }))
      this.sessions.clear()
      this.chatAgents.clear()
    }, 'claude-code: terminate plugin-owned processes')
  }

  private desktop(): boolean { return Boolean(process.env.ZEROWALL_USER_DATA_DIR && isAbsolute(process.env.ZEROWALL_USER_DATA_DIR)) }
  private anyRunning(): boolean {
    return [...this.sessions.values()].some(state => state.busy || state.turn?.view.running === true)
  }
  private runtime(): ClaudeRuntimeManager {
    if (!this.desktop()) throw new Error('Claude Code 安装与运行仅适用于 ZeroWall Desktop。')
    if (!this.manager) {
      const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath ?? join(dirname(process.execPath), 'resources')
      this.manager = new ClaudeRuntimeManager({
        dataDir: join(process.env.ZEROWALL_USER_DATA_DIR!, 'plugins', 'claude-code', 'runtime'),
        pnpm: resolveBundledPnpmRuntime({ ...(process.versions.electron ? { electron: true, resourcesPath } : {}), projectRoot: process.cwd() }),
        run: runInstaller,
      })
    }
    return this.manager
  }
  private owner(agent: Agent): SessionRuntime {
    let state = this.sessions.get(agent.id)
    if (!state) { state = { history: [], busy: false }; this.sessions.set(agent.id, state) }
    return state
  }

  private async statusSnapshot(running: boolean): Promise<ClaudeCodeStatus> {
    if (!this.desktop()) return { desktop: false, installed: false, rollbackAvailable: false, running: false }
    try {
      const status = await this.runtime().status()
      return { desktop: true, installed: status.installed, readiness: status.installed ? 'installed' : 'unavailable', ...(status.version ? { version: status.version } : {}),
        ...(status.executablePath ? { executablePath: status.executablePath } : {}),
        rollbackAvailable: Boolean(status.previousVersion), running }
    } catch { return { desktop: true, installed: false, rollbackAvailable: false, running: false } }
  }

  @Remote
  async status(agent: Agent): Promise<ClaudeCodeStatus> {
    return this.statusSnapshot(this.owner(agent).busy || Boolean(this.owner(agent).turn?.view.running))
  }

  @Remote('settingsStatus')
  async settingsStatus(): Promise<ClaudeCodeStatus> { return this.statusSnapshot(this.anyRunning()) }

  @Remote('settingsGet')
  async settingsGet(): Promise<ClaudeNativeSettings> {
    if (!this.desktop()) return { ...CLAUDE_SETTINGS_DEFAULTS }
    try {
      const root = this.runtime().configDir
      const [native, plugin] = await Promise.all([
        this.readSettingsDocument(join(root, 'settings.json')),
        this.readSettingsDocument(join(root, 'plugin-settings.json')),
      ])
      return { ...CLAUDE_SETTINGS_DEFAULTS, ...knownNativeSettings({ ...plugin, ...native }) }
    } catch { throw new Error('Claude Code settings could not be read.') }
  }

  @Remote('settingsUpdate')
  async settingsUpdate(input: Partial<ClaudeNativeSettings>): Promise<ClaudeNativeSettings> {
    if (!this.desktop()) throw new Error('Claude Code 原生设置仅适用于 ZeroWall Desktop。')
    if (this.mutation) throw new Error('请先停止 Claude Code，再修改原生设置。')
    const next = validateNativeSettings(input)
    const merged = { ...(await this.settingsGet()), ...next }
    await mkdir(this.runtime().configDir, { recursive: true, mode: 0o700 })
    const rootInfo = await lstat(this.runtime().configDir)
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new Error('Claude Code settings directory is not a regular directory.')
    await chmod(this.runtime().configDir, 0o700)
    const nativePath = join(this.runtime().configDir, 'settings.json')
    const pluginPath = join(this.runtime().configDir, 'plugin-settings.json')
    const [native, plugin] = await Promise.all([this.readSettingsDocument(nativePath), this.readSettingsDocument(pluginPath)])
    if (next.outputStyle !== undefined) {
      if (next.outputStyle === 'Default') delete native.outputStyle
      else native.outputStyle = next.outputStyle
    }
    for (const key of ['permissionSelector', 'permissionMode', 'renderer', 'prose', 'worktreeBranchPrefix', 'maxProcesses', 'idleTimeoutMinutes'] as const) {
      if (next[key] !== undefined) plugin[key] = next[key]
    }
    await Promise.all([this.writeSettingsDocument(nativePath, native), this.writeSettingsDocument(pluginPath, plugin)])
    return merged
  }

  /** Dynamic descriptor view matching Claude Code's native Settings surface. */
  @Remote('settingsGlobalGet')
  async settingsGlobalGet(): Promise<ClaudeGlobalSettingsView> {
    const native = await this.settingsGet()
    const outputStyles = await this.outputStyleOptions()
    const select = (key: string, value: string, options: readonly { value: string; label: string; source: 'built-in' | 'user' | 'configured' }[], effect: 'immediate' | 'new-session' | 'next-turn' | 'next-worktree' | 'restart') => ({ key, kind: 'select' as const, value, options, effect })
    const text = (key: string, value: string, maxLength: number, effect: 'immediate' | 'new-session' | 'next-turn' | 'next-worktree' | 'restart') => ({ key, kind: 'text' as const, value, maxLength, effect })
    return { settings: [
      select('outputStyle', native.outputStyle ?? 'Default', outputStyles, 'new-session'),
      select('permissionSelector', native.permissionSelector ?? 'plugin', CLAUDE_PERMISSION_SELECTORS.map(value => ({ value, label: value, source: 'built-in' as const })), 'immediate'),
      select('permissionMode', native.permissionMode ?? 'auto', CLAUDE_PERMISSION_MODES.map(value => ({ value, label: value, source: 'built-in' as const })), 'new-session'),
      select('renderer', native.renderer ?? 'plugin', CLAUDE_RENDERERS.map(value => ({ value, label: value, source: 'built-in' as const })), 'next-turn'),
      select('prose', native.prose ?? 'plain', CLAUDE_PROSE_MODES.map(value => ({ value, label: value, source: 'built-in' as const })), 'immediate'),
      text('maxProcesses', String(native.maxProcesses ?? 4), 2, 'immediate'),
    ] }
  }

  @Remote('settingsGlobalUpdate')
  async settingsGlobalUpdate(changes: Record<string, string>): Promise<ClaudeGlobalSettingsView> {
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) throw new Error('Claude Code global settings changes must be an object.')
    const supported = new Set(['outputStyle', 'permissionSelector', 'permissionMode', 'renderer', 'prose', 'worktreeBranchPrefix', 'maxProcesses', 'idleTimeoutMinutes'])
    for (const key of Object.keys(changes)) if (!supported.has(key)) throw new Error(`Unsupported Claude Code global setting: ${key}`)
    if (Object.hasOwn(changes, 'worktreeBranchPrefix') || Object.hasOwn(changes, 'idleTimeoutMinutes')) throw new Error('This managed runtime does not provide worktree creation or persistent process reuse.')
    for (const [key, value] of Object.entries(changes)) if (typeof value !== 'string' || value.length > 128) throw new Error(`Claude Code setting ${key} is invalid.`)
    if (Object.hasOwn(changes, 'outputStyle') && !(await this.outputStyleOptions()).some(option => option.value === changes.outputStyle)) throw new Error('Claude Code output style is unavailable.')
    const patch: Partial<ClaudeNativeSettings> = {}
    for (const [key, value] of Object.entries(changes)) {
      if (key === 'maxProcesses' || key === 'idleTimeoutMinutes') {
        const parsed = Number(value)
        if (!Number.isSafeInteger(parsed)) throw new Error(`Claude Code setting ${key} is invalid.`)
        patch[key] = parsed
      } else (patch as Record<string, unknown>)[key] = value
    }
    await this.settingsUpdate(patch)
    return this.settingsGlobalGet()
  }

  private async outputStyleOptions(): Promise<ClaudeGlobalSettingOption[]> {
    const builtIns = ['Default', 'Proactive', 'Concise', 'Explanatory', 'Learning'].map(value => ({ value, label: value, source: 'built-in' as const }))
    const names = new Set(builtIns.map(item => item.value))
    const root = this.desktop() ? join(this.runtime().configDir, 'output-styles') : ''
    const user: ClaudeGlobalSettingOption[] = []
    try {
      for (const entry of root ? (await readdir(root, { withFileTypes: true })).slice(0, 256) : []) {
        if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md')) continue
        const fallback = entry.name.slice(0, -3)
        let value = fallback
        try {
          const path = join(root, entry.name)
          const info = await lstat(path)
          if (info.isFile() && !info.isSymbolicLink() && info.size <= 64 * 1024) {
            const text = await readFile(path, 'utf8')
            const normalized = text.replaceAll('\r\n', '\n')
            if (normalized.startsWith('---\n')) {
              const end = normalized.indexOf('\n---\n', 4)
              if (end >= 0) {
                for (const line of normalized.slice(4, end).split('\n')) {
                  const match = /^name:\s*(.+?)\s*$/u.exec(line)
                  if (!match?.[1]) continue
                  const raw = match[1]
                  const candidate = (raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'")) ? raw.slice(1, -1) : raw
                  if (/^[\p{L}\p{N}][\p{L}\p{N} ._()[\]-]{0,127}$/u.test(candidate)) value = candidate
                  break
                }
              }
            }
          }
        } catch { /* Ignore malformed optional style metadata. */ }
        if (/^[\p{L}\p{N}][\p{L}\p{N} ._()[\]-]{0,127}$/u.test(value) && !names.has(value)) { names.add(value); user.push({ value, label: value, source: 'user' }) }
      }
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    const current = (await this.settingsGet()).outputStyle
    if (current && !names.has(current)) user.push({ value: current, label: current, source: 'configured' })
    return [...builtIns, ...user.sort((a, b) => a.label.localeCompare(b.label))]
  }

  /** External children use the same isolated Skills/MCP/model launch as chat. */
  async startSubagent(request: ResolvedSubagentStartRequest): Promise<SubagentRun> {
    if (request.signal.aborted) throw new Error('Claude Code subagent request was canceled before startup.')
    const text = request.prompt.filter((block): block is Extract<ContentBlock, { type: 'text' }> => block.type === 'text').map(block => block.text).join('\n')
    if (!text.trim() || text.length > 2 * 1024 * 1024) throw new Error('Claude Code subagent requires a non-empty text task within the supported size.')
    const id = randomUUID() as SessionId
    // Keep parent scope for credentials/Skills, while each child has its own
    // process ownership, directory, cancellation and resource projection.
    const agent = { id, session: request.parent.session, ctx: request.parent.ctx } as Agent
    const selected = this.subagentSelection(request.parent, request.agentOptions)
    let turn: OwnedTurn
    try {
      const input = { messages: [{ role: 'user', content: request.prompt }], tools: (request.parent.ctx.get('tools') as ToolRuntime | undefined)?.schemas(request.parent) ?? [] } as unknown as GenerateOptions
      turn = await this.launch(agent, text, 'conversation', selected, { cwd: request.cwd, signal: request.signal, scope: request.parent, request: input })
    } catch (error) {
      this.sessions.delete(id)
      if (error instanceof Error && error.message === 'Claude Code 仅支持明确声明为 Anthropic Messages 的模型路由，请在当前对话切换模型。') {
        throw new Error('Claude 子 agent 需要 Anthropic Messages 路由。请在子 agent 模型选择设置中启用并授权已配置的 Anthropic 路由，然后通过 claude_list_subagent_models 查询并为 claude_subagent 指定 provider 和 model；无需更改父会话模型。')
      }
      throw error
    }
    if (!turn.query) { this.sessions.delete(id); throw new Error(turn.view.message ?? 'Claude Code subagent process is unavailable.') }
    const metrics = new ClaudeMetricsCollector({ runId: turn.view.id, nativeSessionId: turn.binding?.nativeId ?? id,
      provider: turn.view.provider, model: turn.view.model, turn: request.parent.session.snapshotEvents().reduce((n, e) => e.type === 'step/start' ? e.data.turn : n, 0), main: false }, Date.now, turn.view.resumed === true)
    const output = turn.safe.fork()
    let receivedText = false
    let finalOutput: string | undefined
    let diagnostic: string | undefined
    const collectOutput = () => (finalOutput ?? output.snapshot()) ? [{ type: 'text' as const, text: finalOutput ?? output.snapshot() }] : []
    const onAbort = () => turn.cancel.abort()
    const consume = (line: string) => {
      const event = parseClaudeCliEvent(line)
      if (event?.kind === 'text' && event.text) { receivedText = true; output.append(event.text) }
      if (event?.final) {
        if (event.failed) { diagnostic = [event.text, ...(event.errors ?? [])].filter(Boolean).join('\n') || 'Claude Code reported an unsuccessful result.'; turn.diagnostics?.append(diagnostic) }
        else if (event.text) { const safe = turn.safe.fork(); safe.append(event.text); safe.finish(); finalOutput = safe.snapshot(); if (!receivedText) output.append(event.text) }
      }
    }
    const result = settleRunResult({
      attempt: async (): Promise<SubagentResult> => {
        await request.parent.session.append('zerowall-claude/metrics', metrics.snapshot(), { ignorable: true })
        for await (const message of turn.query!) {
          if (metrics.observe(message)) await request.parent.session.append('zerowall-claude/metrics', metrics.snapshot(), { ignorable: true })
          if (message.type === 'system' && message.subtype === 'init' && turn.binding) {
            if (message.session_id !== turn.binding.nativeId) throw new Error('Claude child session identity changed unexpectedly.')
            turn.binding.initialized = true; turn.binding.state = 'running'
            await turn.bindingStore!.save(id, turn.binding)
          }
          if ((message.type === 'assistant' || message.type === 'stream_event') && turn.binding?.pending) {
            turn.binding.submitted = turn.binding.pending.keys; delete turn.binding.pending
          }
          consume(JSON.stringify(message))
        }
        const exit = turn.process ? await turn.process.done : { exitCode: diagnostic ? 1 : 0 }
        output.finish()
        if (exit.exitCode !== 0 || diagnostic) throw new Error(`Claude 子会话执行失败（诊断 ${turn.view.id}）。${diagnostic ?? turn.diagnostics?.snapshot() ?? ''}`)
        return { output: collectOutput(), stopReason: 'completed' }
      },
      collectOutput, collectDiagnostic: () => diagnostic, cancelled: () => turn.cancel.signal.aborted,
      signal: request.signal, onAbort,
    }).finally(async () => {
      try {
        await request.parent.session.append('zerowall-claude/metrics', metrics.snapshot(true), { ignorable: true })
      } finally {
        try {
          turn.query?.close(); await turn.process?.terminate(); await turn.process?.done.catch(() => undefined)
        } finally {
          turn.release?.()
          output.finish(); turn.view.running = false; this.sessions.delete(id)
          if (turn.projectionRoot) await rm(turn.projectionRoot, { recursive: true, force: true }).catch(() => undefined)
          if (turn.binding) { turn.binding.state = turn.cancel.signal.aborted ? 'stopped' : diagnostic ? 'failed' : 'idle'; await turn.bindingStore!.save(id, turn.binding) }
        }
      }
    })
    return subprocessRunHandle({ id, result, signal: request.signal, onAbort,
      requestCancel: () => turn.cancel.abort(),
      teardown: async () => { turn.query?.close(); await turn.process?.terminate(); await turn.process?.done.catch(() => undefined) },
    })
  }

  private subagentSelection(parent: Agent, options?: AgentOptions): ClaudeSelection | undefined {
    if (options === undefined) return undefined
    if (Object.keys(options).some(key => !['provider', 'model', 'reasoningEffort'].includes(key))) throw new Error('Claude Code subagent supports only provider, model and reasoningEffort overrides.')
    const parentSelection = selectedClaudeModel(
      (this.ctx.get('sessionProjections') as { stateOf(session: unknown, key: string): { pending?: ClaudeSelection | null } | undefined }).stateOf(parent.session, 'modelSelection'),
      () => (this.ctx.get('agentDefaultModel') as { currentSelection(): ClaudeSelection }).currentSelection(), parent.session.requestHeader(),
    )
    if ((options.provider === undefined) !== (options.model === undefined)) throw new Error('Claude Code subagent provider and model must be supplied together.')
    const provider = options.provider ?? parentSelection.provider
    const model = options.model ?? parentSelection.model
    const changed = provider !== parentSelection.provider || model !== parentSelection.model
    const effort = options.reasoningEffort ?? (changed ? undefined : parentSelection.reasoningEffort)
    return { provider, model, ...(effort === undefined ? {} : { reasoningEffort: effort }) }
  }

  private async readSettingsDocument(path: string): Promise<Record<string, unknown>> {
    try {
      const info = await lstat(path)
      if (!info.isFile() || info.isSymbolicLink() || info.size > 256 * 1024) throw new Error('Settings file must be a bounded regular file.')
      const value: unknown = JSON.parse(await readFile(path, 'utf8'))
      if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Settings file must contain an object.')
      return { ...(value as Record<string, unknown>) }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}
      throw error
    }
  }

  private async writeSettingsDocument(path: string, value: Record<string, unknown>): Promise<void> {
    const temporary = `${path}.${randomUUID()}.tmp`
    await writeFile(temporary, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    try { await chmod(temporary, 0o600); await rename(temporary, path); await chmod(path, 0o600) }
    finally { await rm(temporary, { force: true }).catch(() => undefined) }
  }

  // `install` is reserved by the DSH client namespace service itself. Keep
  // the Host method name for the domain API, but publish a non-conflicting
  // wire endpoint so the client namespace can mount successfully.
  @Remote('installCli')
  async install(agent: Agent): Promise<ClaudeCodeStatus> { return this.changeRuntime('install', agent) }
  @Remote
  async rollback(agent: Agent): Promise<ClaudeCodeStatus> { return this.changeRuntime('rollback', agent) }
  @Remote
  async uninstall(agent: Agent): Promise<ClaudeCodeStatus> { return this.changeRuntime('uninstall', agent) }

  @Remote('settingsInstall')
  async settingsInstall(): Promise<ClaudeCodeStatus> { return this.changeRuntime('install') }
  @Remote('settingsRollback')
  async settingsRollback(): Promise<ClaudeCodeStatus> { return this.changeRuntime('rollback') }
  @Remote('settingsUninstall')
  async settingsUninstall(): Promise<ClaudeCodeStatus> { return this.changeRuntime('uninstall') }

  private async changeRuntime(operation: 'install' | 'rollback' | 'uninstall', agent?: Agent): Promise<ClaudeCodeStatus> {
    if (this.mutation || [...this.sessions.values()].some(state => state.busy || state.turn?.view.running)) throw new Error('请先停止 Claude Code，再管理安装。')
    this.mutation = true
    try {
      const runtime = this.runtime()
      if (operation === 'install') await runtime.installOrUpdate()
      else if (operation === 'rollback') await runtime.rollback()
      else { await runtime.uninstall(); this.sessions.clear() }
      return await this.statusSnapshot(agent === undefined ? this.anyRunning() : this.owner(agent).busy || Boolean(this.owner(agent).turn?.view.running))
    } catch { throw new Error('Claude Code 安装管理未完成；现有有效安装会被保留，请重试。') }
    finally { this.mutation = false }
  }

  private async route(agent: Agent, selected?: ClaudeSelection) {
    const projections = this.ctx.get('sessionProjections') as { stateOf(session: unknown, key: string): { pending?: ClaudeSelection | null; lastUsed?: ClaudeSelection | null } | undefined }
    const defaults = this.ctx.get('agentDefaultModel') as { currentSelection(): ClaudeSelection }
    const selection = selected ?? selectedClaudeModel(projections.stateOf(agent.session, 'modelSelection'), () => defaults.currentSelection(), agent.session.requestHeader())
    const llm = this.ctx.get('llm') as { listConfigurableProviders: ClaudeRouteServices['directory'] }
    const settings = this.ctx.get('settings') as { describe(options: { redactSecrets: boolean }): ReturnType<ClaudeRouteServices['settings']> }
    const credentials = this.ctx.get('credentials') as { resolve(ref: ReturnType<typeof credentialRef>): Promise<{ value: string } | undefined> }
    return resolveClaudeRoute(selection, {
      directory: () => llm.listConfigurableProviders(), settings: () => settings.describe({ redactSecrets: true }),
      credential: async ref => (await credentials.resolve(credentialRef(ref)))?.value,
      ...(this.managedRoute ? { managedRoute: this.managedRoute } : {}),
      ...(this.managedCredential ? { managedCredential: this.managedCredential } : {}),
    })
  }

  /** Local compatibility helper for tests and pre-SDK callers; never expose the legacy terminal launcher over RPC. */
  async start(agent: Agent, prompt: string): Promise<ClaudeCodeTurn> {
    return this.turnView(await this.launch(agent, prompt, 'panel'))
  }

  @Remote
  async permissionView(agent: Agent): Promise<ClaudePermissionView> {
    const settings = await this.settingsGet()
    const presets = this.ctx.get('permissionPresets') as PermissionPresetService | undefined
    const source = settings.permissionSelector ?? 'plugin'
    const events = agent.session.snapshotEvents()
    const chosen = [...events].reverse().find(event => event.type === 'zerowall-claude/permission')
    const hostPreset = presets?.current(agent.session) ?? 'custom'
    const spec = hostPreset !== 'custom' ? presets?.resolve(hostPreset) : undefined
    const permissions = (this.ctx.get('sessionProjections') as { stateOf(session: unknown, key: string): { sandbox?: string; approval?: string } | undefined }).stateOf(agent.session, 'permissions')
    const sandbox = permissions?.sandbox ?? spec?.sandbox ?? 'read-only'
    const approval = permissions?.approval ?? spec?.approval ?? 'ask'
    const selected = chosen?.type === 'zerowall-claude/permission' ? chosen.data.mode : settings.permissionMode ?? 'acceptEdits'
    const mode = source === 'plugin' ? selected : CLAUDE_MODE_BY_SANDBOX[sandbox as keyof typeof CLAUDE_MODE_BY_SANDBOX]
    if (!mode) throw new Error('当前 Host 权限无法映射到 Claude；请先选择明确的权限预设。')
    const active = (this.ctx.get('sessionProjections') as { stateOf(session: unknown, key: string): unknown }).stateOf(agent.session, 'agentPreset') === 'claude'
    return { active, source, mode, hostPreset, hostSandbox: sandbox, hostApproval: approval,
      ...(this.owner(agent).turn?.view.running && this.owner(agent).turn?.view.permission ? { runningMode: this.owner(agent).turn!.view.permission!.mode } : {}),
      nativeOptions: presets ? presets.names.map(value => presets.optionOf(value)) : [],
    }
  }

  @Remote
  async permissionSet(agent: Agent, value: string): Promise<ClaudePermissionView> {
    const view = await this.permissionView(agent)
    if (view.active && view.source === 'plugin') {
      if (!isClaudePermissionMode(value)) throw new Error('Claude 权限模式无效。')
      await agent.session.append('zerowall-claude/permission', { mode: value }, { ignorable: true })
      // A running turn retains both its SDK mode and Host policy until completion.
      if (!this.owner(agent).turn?.view.running) this.alignPermission(agent, value)
    } else {
      if (this.owner(agent).turn?.view.running) throw new Error('请等待当前请求完成后切换 Host 权限。')
      ;(this.ctx.get('permissionPresets') as PermissionPresetService).set(agent.session, value)
    }
    return this.permissionView(agent)
  }

  private alignPermission(agent: Agent, mode: ClaudePermissionMode): void {
    setSandboxMode(agent.session, SANDBOX_BY_CLAUDE_MODE[mode])
    setApprovalPolicy(agent.session, mode === 'dontAsk' || mode === 'bypassPermissions' ? 'never' : 'ask')
  }

  private async launch(agent: Agent, prompt: string, mode: 'panel' | 'conversation', selected?: ClaudeSelection, execution: { cwd?: string; signal?: AbortSignal; scope?: Agent; request?: GenerateOptions } = {}): Promise<OwnedTurn> {
    const maxPrompt = mode === 'panel' ? 64_000 : 2 * 1024 * 1024
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > maxPrompt || prompt.includes('\0')) {
      if (mode === 'panel') throw new Error('请输入 1 到 64000 字的 Claude Code 指令。')
      throw new Error('Claude Code conversation context exceeds the supported size.')
    }
    const owner = this.owner(agent)
    if (this.mutation || owner.busy || owner.turn?.view.running) throw new Error('Claude Code 正在运行，请等待或停止当前任务。')
    owner.busy = true
    const cancel = new AbortController()
    const onAbort = () => cancel.abort()
    execution.signal?.addEventListener('abort', onAbort, { once: true })
    if (execution.signal?.aborted) onAbort()
    owner.preparing = cancel
    let projectionRoot: string | undefined
    let processOwnsProjection = false
    let reserved = false
    const release = () => {
      if (reserved) { reserved = false; this.processReservations -= 1 }
      execution.signal?.removeEventListener('abort', onAbort)
    }
    try {
      const nativeSettings = await this.settingsGet()
      if (this.processReservations >= (nativeSettings.maxProcesses ?? 4)) throw new Error('Claude Code 已达到最大并发进程数，请等待其他任务完成。')
      this.processReservations += 1
      reserved = true
      const runtime = this.runtime()
      const executable = await runtime.getExecutablePath()
      if (!executable) throw new Error('请先安装 Claude Code。')
      const workingDirectory = this.ctx.get('workingDirectory') as { get(session: unknown): string }
      const cwd = execution.cwd ?? workingDirectory.get(agent.session)
      if (!isAbsolute(cwd)) throw new Error('当前会话没有有效的项目目录。')
      assertUsableCwd('Claude Code', 'working directory', cwd)
      const route = await this.route(agent, selected)
      cancel.signal.throwIfAborted()
      const skillsRegistry = agent.ctx.get('skills') as SkillsProjectionApi
      const projects = this.ctx.get('zerowallProjects') as { listMcpServers(): McpServerProjectionInput[] }
      const skills = await projectSkillsForClaude(skillsRegistry, cwd, execution.scope ?? agent)
      const credentials = this.ctx.get('credentials') as { resolve(ref: ReturnType<typeof credentialRef>): Promise<{ value: string } | undefined> }
      const mcp = execution.request ? { servers: [], skipped: [], environment: {} } : await prepareClaudeMcpRuntime(projectMcpForClaude(projects.listMcpServers(), cwd), async reference => {
        const specialKey = reference === 'R_PLATFORM_MCP_AUTHORIZATION' ? 'zerowall.mcp.rdatalinux_authorization'
          : reference === 'HUAGONGSHE_MCP_AUTHORIZATION' ? 'zerowall.mcp.huagongshe_token' : undefined
        if (specialKey) {
          const value = await this.secrets.get(specialKey).catch(() => undefined)
          if (value?.trim()) return reference === 'HUAGONGSHE_MCP_AUTHORIZATION' ? `Bearer ${value.trim()}` : value
        }
        const stored = await this.secrets.get(`zerowall.environment.var.${reference.toLowerCase()}`).catch(() => undefined)
        return stored ?? (await credentials.resolve(credentialRef(reference)))?.value
      })
      cancel.signal.throwIfAborted()
      projectionRoot = join(runtime.configDir, 'sessions', createHash('sha256').update(agent.id).digest('hex'), randomUUID())
      await mkdir(projectionRoot, { recursive: true, mode: 0o700 })
      const skillRoot = join(projectionRoot, 'skills')
      for (const skill of skills.skills) {
        const resource = skill.resourceBase
        const hint = resource?.kind === 'directory' ? `Resolve every relative skill resource path against this original base directory: ${resource.path}.`
          : resource?.kind === 'url' ? `Resolve every relative skill resource URL against this original base URL: ${resource.url}.`
            : resource?.kind === 'opaque' ? `Original skill resources: ${resource.description}` : ''
        const dir = join(skillRoot, skill.name)
        await mkdir(dir, { recursive: true, mode: 0o700 })
        await writeFile(join(dir, 'SKILL.md'), `---\nname: ${skill.name}\ndescription: ${JSON.stringify(skill.description)}\ndisable-model-invocation: ${!skill.invocation.modelInvocable}\nuser-invocable: ${skill.invocation.userInvocable !== false}\n---\n${hint}\n\n${skill.content}`, { mode: 0o600 })
      }
      const mcpPath = join(projectionRoot, 'mcp.json')
      const searchPath = Object.entries(process.env).find(([key]) => key.toUpperCase() === 'PATH')?.[1]
      const { servers: mcpServers, skipped: launchSkipped } = await writeClaudeMcpLaunchers(mcp, { root: projectionRoot,
        executable: process.execPath, electron: Boolean(process.versions.electron),
        ...(searchPath ? { searchPath } : {}) })
      await writeFile(mcpPath, JSON.stringify({ mcpServers: Object.fromEntries(mcpServers.map(({ serverName, ...config }) => [serverName, config])) }), { mode: 0o600 })
      // A plugin directory is the CLI's supported way to load projected Skills
      // from a per-session folder without changing the project's .claude tree.
      const pluginMeta = join(projectionRoot, '.claude-plugin')
      await mkdir(pluginMeta, { mode: 0o700 })
      await writeFile(join(pluginMeta, 'plugin.json'), JSON.stringify({ name: 'zerowall-session-skills', version: '0.1.0' }), { mode: 0o600 })
      const environmentService = this.ctx.get('zerowallEnvironment') as {
        listVariables(): Promise<Array<{ name: string }>>
        readVariable(name: string): Promise<string | undefined>
      }
      const configuredEnvironment: Record<string, string> = {}
      for (const { name } of await environmentService.listVariables()) {
        const value = await environmentService.readVariable(name)
        if (value !== undefined) configuredEnvironment[name] = value
      }
      const environment = runtime.getCliEnvironment({ ANTHROPIC_API_KEY: route.apiKey, ANTHROPIC_BASE_URL: route.baseUrl,
        ANTHROPIC_MODEL: route.model, ANTHROPIC_DEFAULT_HAIKU_MODEL: route.model,
        ANTHROPIC_DEFAULT_SONNET_MODEL: route.model, ANTHROPIC_DEFAULT_OPUS_MODEL: route.model }, undefined, mcp.environment, configuredEnvironment)
      const turn: OwnedTurn = {
        view: { id: randomUUID(), provider: route.provider, model: route.model, executablePath: executable, running: true, output: '', renderer: nativeSettings.renderer ?? 'plugin', activity: [],
          skills: skills.skills.length, mcp: mcpServers.length,
          skipped: [...skills.skipped.map(item => `Skill ${item.name}: ${item.reason}`), ...[...mcp.skipped, ...launchSkipped].map(item => `MCP ${item.serverName}: ${item.reason === 'unsupported-working-directory'
            ? '工作目录无效：MCP 目录必须为空白或绝对目录。'
            : item.reason === 'unsupported-launch'
              ? '启动方式不兼容：独立目录仅支持 Node 或绝对原生可执行文件；Windows 不支持 .cmd/.bat，请使用服务的绝对可执行入口。'
            : item.reason}`)] },
        safe: new ClaudeSafeOutput([route.apiKey, ...Object.values(mcp.environment), ...Object.values(configuredEnvironment)]), cancel,
      }
      owner.turn = turn
      turn.projectionRoot = projectionRoot
      if (execution.request) {
        const generationEnvironment = sdkGenerationEnvironment(execution.request)
        const permission = await this.permissionView(agent)
        if (permission.source === 'plugin' && !execution.scope) {
          if (!agent.session.snapshotEvents().some(event => event.type === 'zerowall-claude/permission')) {
            await agent.session.append('zerowall-claude/permission', { mode: permission.mode }, { ignorable: true })
          }
          this.alignPermission(agent, permission.mode)
        }
        turn.view.permission = await this.permissionView(agent)
        const store = new ClaudeSessionBindings(runtime.configDir)
        const { binding, recovery } = await store.load(agent.id, cwd)
        turn.binding = binding; turn.bindingStore = store
        turn.view.nativeSessionId = binding.nativeId; turn.view.resumed = binding.initialized
        if (recovery) turn.view.message = recovery
        const input = await sdkInput(agent, execution.request, binding, cancel.signal)
        const schemas = execution.request.tools ?? []
        const bridgeState: { concluded: boolean; delivered: (keys: string[]) => Promise<void>; drain?: () => Promise<unknown> } = { concluded: false, delivered: async (keys: string[]) => {
          if (!keys.length) return
          binding.submitted = [...new Set([...binding.submitted, ...keys])]
          if (binding.pending) binding.pending.keys = [...new Set([...binding.pending.keys, ...keys])]
          await store.save(agent.id, binding)
        } }
        const bridge = createHostToolBridge(execution.scope ?? agent, schemas, cancel.signal, route, bridgeState)
        if (bridgeState.drain) turn.drainBridge = bridgeState.drain
        const mcpService = this.ctx.get('zerowallMcp') as { list(): Promise<Array<{ serverName: string; runtimeState: string }>> } | undefined
        const skillService = this.ctx.get('zerowallCapabilities') as { listSkillSources(): Promise<{ disabled: string[] }> } | undefined
        const mcpRuntime = await mcpService?.list().catch(() => []) ?? []
        const disabled = (await skillService?.listSkillSources().catch(() => ({ disabled: [] })))?.disabled ?? []
        turn.view.resources = resourceStatus(skills, projects.listMcpServers(), schemas, mcpRuntime, disabled.map(path => path.split(/[\\/]/u).at(-1)!).filter(Boolean))
        turn.view.mcp = turn.view.resources.filter(row => row.kind === 'mcp' && row.state === 'synced').length
        turn.diagnostics = turn.safe.fork()
        const inputId = randomUUID()
        binding.pending = { uuid: inputId, keys: input.submitted }; binding.state = 'submitted'
        await store.save(agent.id, binding)
        const approval = this.ctx.get('approval') as ApprovalService
        turn.approvalCalls = new Set()
        turn.query = startSdkQuery({
          pathToClaudeCodeExecutable: executable, cwd, env: { ...environment, ...generationEnvironment },
          abortController: cancel, model: route.model, ...(route.reasoningEffort ? { effort: route.reasoningEffort as NonNullable<ClaudeSdkOptions['effort']> } : {}),
          ...(binding.initialized ? { resume: binding.nativeId } : { sessionId: binding.nativeId }), persistSession: true,
          permissionMode: permission.mode, permissionPrompts: 'host', allowDangerouslySkipPermissions: permission.mode === 'bypassPermissions',
          settingSources: ['user'], plugins: [{ type: 'local', path: projectionRoot }],
          ...(nativeSettings.outputStyle && nativeSettings.outputStyle !== 'Default' ? { settings: { outputStyle: nativeSettings.outputStyle } } : {}),
          includePartialMessages: true, systemPrompt: sdkSystemPrompt(execution.request),
          mcpServers: { zerowall: bridge }, strictMcpConfig: true,
          // dontAsk skips canUseTool entirely. Host tools must reach their own
          // policy/approval pipeline in every mode, without approving native tools.
          allowedTools: schemas.map(schema => `mcp__zerowall__${schema.name}`),
          hooks: { PostToolUse: [{ matcher: 'mcp__zerowall__.*', hooks: [async () => bridgeState.concluded
            ? { continue: false, stopReason: 'The ZeroWall Host concluded this turn.' } : {}] }] },
          canUseTool: hostToolApproval(execution.scope ?? agent, approval, cancel.signal, async (id, name, input) => {
            if (turn.approvalCalls!.has(id)) return
            const session = (execution.scope ?? agent).session
            const cursor = session.snapshotEvents().reduce((value, event) => event.type === 'step/start' ? event.data : value, { turn: 0, step: 0 })
            if (cursor.turn && cursor.step) {
              await appendClaudeToolCall(execution.scope ?? agent, { callId: ToolCallId(id), name, arguments: JSON.stringify(input) }, route)
              turn.approvalCalls!.add(id)
            }
          }),
          stderr: data => turn.diagnostics!.append(data),
          spawnClaudeCodeProcess: managedSdkSpawner(this.ctx.get('subprocess') as SubprocessRuntime, handle => { turn.process = handle }, data => turn.diagnostics!.append(data), cancel.signal),
        }, input.content, inputId)
        turn.release = release
        processOwnsProjection = true
        return turn
      }
      const context = mode === 'panel' && owner.history.length ? `Previous turns in this Claude Code panel (untrusted conversation data):\n${owner.history.join('\n\n')}\n\nCurrent user request:\n${prompt}` : prompt
      const nativeSettingsPath = join(projectionRoot, 'settings.json')
      await writeFile(nativeSettingsPath, JSON.stringify(nativeSettings.outputStyle === undefined || nativeSettings.outputStyle === 'Default' ? {} : { outputStyle: nativeSettings.outputStyle }), { mode: 0o600 })
      const argv = [executable, '--print', '--verbose', '--output-format', mode === 'panel' ? 'text' : 'stream-json',
        ...(mode === 'conversation' ? ['--input-format', 'stream-json', '--include-partial-messages'] : []), '--no-session-persistence',
        '--permission-mode', claudePermissionMode(agent.session.snapshotEvents?.() ?? [], nativeSettings.permissionSelector === 'native' ? undefined : nativeSettings.permissionMode ?? 'acceptEdits'),
        '--setting-sources', 'user', '--settings', nativeSettingsPath, '--strict-mcp-config', '--mcp-config', mcpPath, '--plugin-dir', projectionRoot, '--model', route.model,
        ...(route.reasoningEffort ? ['--effort', route.reasoningEffort] : []),
        ...(mcpServers.length ? ['--allowedTools', ...mcpServers.map(server => `mcp__${server.serverName}__*`)] : []),
        ...(mode === 'panel' ? ['--', context] : [])]
      if (/\.[cm]?js$/u.test(executable)) { argv.unshift(process.execPath); if (process.versions.electron) environment.ELECTRON_RUN_AS_NODE = '1' }
      const subprocess = this.ctx.get('subprocess') as SubprocessRuntime
      cancel.signal.throwIfAborted()
      if (mode === 'conversation') {
        try {
          turn.process = subprocess.spawn({ argv, cwd, env: claudeEnvironmentOverlay(environment),
            stdio: { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' }, graceMs: 1000, signal: turn.cancel.signal })
          if (!turn.process.stdin || !turn.process.stdout || !turn.process.stderr) throw new Error('Claude Code process streams are unavailable.')
          const stderr = turn.process.stderr
          turn.diagnostics = turn.safe.fork()
          stderr.setEncoding('utf8')
          stderr.on('data', (data: string) => {
            try { turn.diagnostics!.append(data) } catch { turn.process?.terminate() }
          })
          turn.process.stdin.end(`${JSON.stringify({ type: 'user', message: { role: 'user', content: prompt } })}\n`)
          void turn.process.done.then(release, release)
          processOwnsProjection = true
          return turn
        } catch {
          turn.process?.terminate()
          turn.view.running = false
          turn.view.message = 'Claude Code 无法启动，请检查安装状态后重试。'
          return turn
        }
      }
      try {
        // Pinned DSH's terminal implementation honors undefined tombstones via
        // targetEnvironment(), although its public terminal type is narrower.
        // Keep process-tree ownership while removing all unselected ambient env.
        turn.terminal = await subprocess.spawnTerminal({ argv, cwd, env: claudeEnvironmentOverlay(environment) as Record<string, string>,
          rows: 40, cols: 120, terminalType: 'xterm-256color', graceMs: 1000, signal: turn.cancel.signal })
      } catch {
        turn.view.running = false
        turn.view.message = 'Claude Code 无法启动，请检查安装状态后重试。'
        return turn
      }
      turn.terminal.output.setEncoding('utf8')
      turn.terminal.output.on('data', (data: string) => {
        try { turn.safe.append(data) } catch { turn.view.message = 'Claude Code 输出超过限制，任务已停止。'; void turn.terminal?.terminate().catch(() => undefined) }
      })
      turn.terminal.output.on('error', () => { turn.view.message = 'Claude Code 输出连接中断。' })
      const activeProjectionRoot = projectionRoot
      processOwnsProjection = true
      void turn.terminal.done.then(result => {
        turn.view.exitCode = result.exitCode
        if (result.exitCode !== 0 && !turn.view.message) turn.view.message = 'Claude Code 未成功完成，请检查所选模型和安装状态后重试。'
      }).catch(() => { turn.view.message = 'Claude Code 进程中断，请重试。' }).finally(async () => {
        release()
        turn.safe.finish()
        turn.view.running = false
        const output = stripVTControlCharacters(turn.safe.snapshot())
        if (turn.view.exitCode === 0) {
          owner.history.push(`User: ${prompt}\nClaude: ${output}`)
          while (owner.history.join('\n').length > 96_000 && owner.history.length) owner.history.shift()
        }
        await rm(activeProjectionRoot, { recursive: true, force: true }).catch(() => undefined)
      })
      return turn
    } catch (error) {
      if (owner.turn?.cancel === cancel) {
        owner.turn.query?.close(); owner.turn.process?.terminate()
        owner.turn.view.running = false
        if (owner.turn.diagnostics && error instanceof Error) {
          owner.turn.diagnostics.append(error.message); owner.turn.diagnostics.finish()
          owner.turn.view.message = `Claude 启动失败（诊断 ${owner.turn.view.id}）。${owner.turn.diagnostics.snapshot()}`
        }
      }
      if (cancel.signal.aborted) throw new Error('Claude Code 任务已停止。')
      // Only errors created by this integration have fixed safe text; provider,
      // filesystem and subprocess errors can echo credentials and stay private.
      const message = error instanceof Error ? error.message : ''
      if (['请先安装 Claude Code。', '当前会话没有有效的项目目录。', '当前会话没有选择模型。',
        '当前模型路由没有可读取的协议配置。', '当前路由没有可用的 API endpoint。', '当前路由的 API endpoint 不受支持。',
        '当前模型路由没有可用凭据，请在平台对话设置中配置。',
        '当前选择的推理强度不受此 Claude Code 版本支持，请在当前对话调整。',
        'Claude Code 仅支持明确声明为 Anthropic Messages 的模型路由，请在当前对话切换模型。',
        'Claude Code 安装与运行仅适用于 ZeroWall Desktop。'].includes(message)) throw new Error(message)
      if (message === 'Claude Code 已达到最大并发进程数，请等待其他任务完成。') throw new Error(message)
      throw new Error('Claude Code 无法准备当前会话，请检查模型配置与资源状态。')
    } finally {
      if (!processOwnsProjection && projectionRoot) await rm(projectionRoot, { recursive: true, force: true }).catch(() => undefined)
      if (!processOwnsProjection) release()
      delete owner.preparing
      owner.busy = false
    }
  }

  private async *streamConversation(agent: Agent, selection: ClaudeSelection, options: GenerateOptions): AsyncIterable<StreamChunk> {
    let turn: OwnedTurn | undefined
    let metrics: ClaudeMetricsCollector | undefined
    const observeMetrics = async (message: unknown) => {
      if (metrics?.observe(message)) await agent.session.append('zerowall-claude/metrics', metrics.snapshot(), { ignorable: true })
    }
    const observeMetricsLine = async (line: string) => {
      let message: unknown
      try { message = JSON.parse(line) } catch { return }
      await observeMetrics(message)
    }
    type ActiveBlock = {
      index: number
      sourceIndex: number
      kind: 'text' | 'reasoning' | 'tool-call'
      safe: ClaudeSafeOutput
      emitted: number
      id?: string
      name?: string
      arguments: string
      ended: boolean
    }
    const blocks = new Map<number, ActiveBlock>()
    const allBlocks: ActiveBlock[] = []
    const mirroredTools = new Set<string>()
    const completedTools = new Set<string>()
    const cursor = agent.session.snapshotEvents?.().reduce((current, event) => event.type === 'step/start'
      ? { turn: event.data.turn, step: event.data.step } : current, { turn: 0, step: 0 })
    let nextStreamIndex = 0
    let streamedText = false
    let finalText: string | undefined
    let cliFailed = false
    let completed = false
    const syncActivity = () => {
      if (!turn) return
      turn.view.activity = allBlocks.filter(block => !block.name?.startsWith('mcp__zerowall__')).map(block => ({ index: block.index, kind: block.kind,
        text: stripVTControlCharacters(block.safe.snapshot()), ended: block.ended,
        ...(block.id ? { id: block.id } : {}), ...(block.name ? { name: block.name } : {}),
        ...((turn!.view.activity ?? []).find(item => item.index === block.index)?.answer ? { answer: true } : {}),
        ...((turn!.view.activity ?? []).find(item => item.index === block.index)?.result === undefined ? {} : {
          result: turn!.view.activity!.find(item => item.index === block.index)!.result,
          failed: turn!.view.activity!.find(item => item.index === block.index)!.failed,
        }),
      }))
    }
    const failure = (message: string, code = 'CLAUDE_CODE'): StreamChunk => ({
      type: 'finish', reason: { kind: 'error', failure: { code, message } },
    })
    const startBlock = (event: NonNullable<ReturnType<typeof parseClaudeCliEvent>>, safe: ClaudeSafeOutput): StreamChunk | undefined => {
      if (event.index === undefined || (event.kind !== 'text-start' && event.kind !== 'thinking-start' && event.kind !== 'tool-start')) return undefined
      const current = blocks.get(event.index)
      if (current && !current.ended) return undefined
      const index = nextStreamIndex++
      const kind = event.kind === 'text-start' ? 'text' : event.kind === 'thinking-start' ? 'reasoning' : 'tool-call'
      const block: ActiveBlock = { index, sourceIndex: event.index, kind, safe: safe.fork(), emitted: 0, arguments: '', ended: false,
        ...(event.id === undefined ? {} : { id: event.id }), ...(event.name === undefined ? {} : { name: event.name }) }
      blocks.set(event.index, block)
      allBlocks.push(block)
      return { type: 'block-start', index, blockType: kind }
    }
    const flushBlock = function* (block: ActiveBlock, finish = false): Generator<StreamChunk> {
      if (finish) block.safe.finish()
      const visible = stripVTControlCharacters(block.safe.snapshot())
      if (visible.length > block.emitted) {
        const delta = visible.slice(block.emitted)
        block.emitted = visible.length
        if (block.kind === 'text') yield { type: 'text-delta', index: block.index, text: delta }
        else if (block.kind === 'reasoning') yield { type: 'reasoning-delta', index: block.index, text: delta }
        else yield { type: 'tool-call-delta', index: block.index, id: ToolCallId(block.id ?? `claude-${block.index}`), ...(block.name === undefined ? {} : { name: block.name }), argumentsDelta: delta }
      }
    }
    const endBlock = function* (block: ActiveBlock): Generator<StreamChunk> {
      if (block.ended) return
      if (block.kind !== 'tool-call') yield* flushBlock(block, true)
      else block.safe.finish()
      block.ended = true
      if (block.kind === 'text') yield { type: 'block-end', index: block.index, block: { type: 'text', text: block.safe.snapshot() } }
      else if (block.kind === 'reasoning') yield { type: 'block-end', index: block.index, block: { type: 'reasoning', text: block.safe.snapshot() } }
      // The CLI already executes its tools. Never yield a tool-call block to
      // the DSH agent loop, which would execute that request a second time.
    }
    const mirrorTools = async (event: NonNullable<ReturnType<typeof parseClaudeCliEvent>>) => {
      if (!turn) return
      syncActivity()
      for (const result of event.toolResults ?? []) {
        const block = turn.view.activity?.find(item => item.id === result.id)
        if (block) { const safe = turn.safe.fork(); safe.append(result.text); safe.finish(); block.result = safe.snapshot(); block.failed = result.failed }
      }
      if (!cursor?.turn || !cursor.step) return
      if (event.kind === 'block-stop') {
        const block = event.index === undefined ? [...blocks.values()].find(item => item.kind === 'tool-call' && !mirroredTools.has(item.id ?? '')) : blocks.get(event.index)
        if (block?.kind === 'tool-call' && !block.name?.startsWith('mcp__zerowall__') && block.id && !mirroredTools.has(block.id)
          && (turn.view.renderer === 'native' || turn.approvalCalls?.has(block.id))) {
          mirroredTools.add(block.id)
          // Use DSH's durable presentation channel, as upstream dsh-claude
          // does for its native renderer, outside LLM tool execution.
          if (!turn.approvalCalls?.has(block.id)) await appendClaudeToolCall(agent, { callId: ToolCallId(block.id), name: block.name ?? 'unknown', arguments: block.safe.snapshot() || '{}' }, turn.view)
        }
      }
      for (const result of event.toolResults ?? []) {
        if (completedTools.has(result.id)) continue
        const block = allBlocks.find(item => item.id === result.id)
        if (block?.name?.startsWith('mcp__zerowall__')) continue
        if (!mirroredTools.has(result.id) && block && (turn.view.renderer === 'native' || turn.approvalCalls?.has(result.id))) {
          block.safe.finish()
          if (!turn.approvalCalls?.has(result.id)) await appendClaudeToolCall(agent, { callId: ToolCallId(result.id), name: block.name ?? 'unknown', arguments: block.safe.snapshot() || '{}' }, turn.view)
          mirroredTools.add(result.id)
        }
        if (!mirroredTools.has(result.id)) continue
        const safe = turn.safe.fork()
        safe.append(result.text); safe.finish()
        await agent.session.append('tool/result', { ...cursor, message: createToolResultMessage({ callId: ToolCallId(result.id), content: [{ type: 'text', text: safe.snapshot() }], isError: result.failed }) }, { surfaceOp: 'append' })
        completedTools.add(result.id)
      }
    }
    const consume = function* (event: NonNullable<ReturnType<typeof parseClaudeCliEvent>>): Generator<StreamChunk> {
      if (event.failed) {
        cliFailed = true
        turn?.diagnostics?.append([event.text, ...(event.errors ?? [])].filter(Boolean).join('\n'))
      }
      if (event.final) { if (typeof event.text === 'string') finalText = event.text; return }
      if (!turn) return
      // Some Claude CLI versions omit the nested block index on deltas/stops.
      // Reuse the sole active block only when that is unambiguous.
      let sourceIndex = event.index
      if (sourceIndex === undefined && event.kind !== 'text-start' && event.kind !== 'thinking-start' && event.kind !== 'tool-start') {
        const active = [...blocks.entries()].filter(([, block]) => !block.ended)
        if (active.length === 1) sourceIndex = active[0]![0]
      }
      if (sourceIndex === undefined) return
      const normalized = sourceIndex === event.index ? event : { ...event, index: sourceIndex }
      if (normalized.kind === 'text-start' || normalized.kind === 'thinking-start' || normalized.kind === 'tool-start') {
        const start = startBlock(normalized, turn.safe)
        if (start) {
          const block = blocks.get(sourceIndex)!
          if (block.kind !== 'tool-call') yield start
        }
        return
      }
      const block = blocks.get(sourceIndex)
      if (!block || block.ended) return
      const delta = normalized.kind === 'text' || normalized.kind === 'thinking' ? normalized.text ?? '' : normalized.argumentsDelta ?? ''
      if (!delta) { if (normalized.kind === 'block-stop') yield* endBlock(block); return }
      block.safe.append(delta)
      turn.safe.append(delta)
      if (normalized.kind === 'text') streamedText = true
      if (normalized.kind === 'tool-input') block.arguments += delta
      if (block.kind !== 'tool-call') yield* flushBlock(block)
      if (normalized.kind === 'block-stop') yield* endBlock(block)
    }

    try {
      turn = await this.launch(agent, 'SDK conversation input', 'conversation', selection, { request: options, ...(options.signal ? { signal: options.signal } : {}) })
      metrics = new ClaudeMetricsCollector({ runId: turn.view.id, nativeSessionId: turn.binding?.nativeId ?? turn.view.id,
        provider: selection.provider, model: selection.model, turn: cursor?.turn ?? 0, main: true }, Date.now, turn.view.resumed === true)
      await agent.session.append('zerowall-claude/metrics', metrics.snapshot(), { ignorable: true })
      // DSH's surface excludes Claude's internal requests. Its capacity meter
      // must not combine those separate surfaces; the plugin owns this reading.
      const context = agent.session.requestContext?.()
      if (context?.contextWindow !== undefined) {
        const { contextWindow: _capacity, ...metadata } = context
        await agent.session.append('request/context', metadata)
      }
      if (cursor?.turn && cursor.step) {
        turn.view.turn = cursor.turn; turn.view.step = cursor.step
        if (turn.view.renderer === 'plugin') await agent.session.append('zerowall-claude/turn', cursor, { ignorable: true })
      }
      if (!turn.query && !turn.process?.stdout) {
        yield failure(turn.view.message ?? 'Claude Code could not start the managed CLI.')
        return
      }
      let pending = ''
      if (turn.query) {
        for await (const message of turn.query) {
          await observeMetrics(message)
          if (message.type === 'system' && message.subtype === 'init' && turn.binding) {
            if (turn.binding.nativeId !== message.session_id) throw new Error('Claude session identity changed unexpectedly.')
            turn.binding.initialized = true; turn.binding.state = 'running'
            await turn.bindingStore!.save(agent.id, turn.binding)
          }
          // Reconcile the exact input UUID from disk after a crash before an assistant frame.
          if ((message.type === 'assistant' || message.type === 'stream_event') && turn.binding?.pending) {
            turn.binding.submitted = turn.binding.pending.keys; delete turn.binding.pending
            await turn.bindingStore!.save(agent.id, turn.binding)
          }
          const event = parseClaudeCliEvent(JSON.stringify(message))
          if (event) { for (const delta of consume(event)) if (turn.view.renderer === 'native') yield delta; await mirrorTools(event) }
        }
      } else for await (const chunk of turn.process!.stdout!) {
        pending += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk)
        if (pending.length > 24 * 1024 * 1024) throw new Error('Claude Code output frame exceeds the supported size.')
        let newline = pending.indexOf('\n')
        while (newline >= 0) {
          const line = pending.slice(0, newline).trim()
          pending = pending.slice(newline + 1)
          await observeMetricsLine(line)
          const event = parseClaudeCliEvent(line)
          if (event) { for (const delta of consume(event)) if (turn.view.renderer === 'native') yield delta; await mirrorTools(event) }
          newline = pending.indexOf('\n')
        }
      }
      if (pending.trim()) {
        await observeMetricsLine(pending.trim())
        const event = parseClaudeCliEvent(pending.trim())
        if (event) { for (const delta of consume(event)) if (turn.view.renderer === 'native') yield delta; await mirrorTools(event) }
      }
      const result = turn.process ? await turn.process.done : { exitCode: cliFailed ? 1 : 0 }
      turn.view.exitCode = result.exitCode ?? -1
      if (result.exitCode === 0 && !cliFailed) {
        for (const block of allBlocks) for (const delta of endBlock(block)) if (turn.view.renderer === 'native') yield delta
      }
      if (!streamedText && finalText && result.exitCode === 0 && !cliFailed) {
        const index = nextStreamIndex++
        const fallback: ActiveBlock = { index, sourceIndex: index, kind: 'text', safe: turn.safe.fork(), emitted: 0, arguments: '', ended: false }
        fallback.safe.append(finalText)
        blocks.set(index, fallback)
        allBlocks.push(fallback)
        if (turn.view.renderer === 'native') yield { type: 'block-start', index, blockType: 'text' }
        for (const delta of endBlock(fallback)) if (turn.view.renderer === 'native') yield delta
      }
      if (result.exitCode !== 0 || cliFailed) {
        turn.diagnostics?.finish()
        turn.view.message = `Claude Code 执行失败（退出码 ${result.exitCode ?? 'unknown'}；诊断 ${turn.view.id}）。${turn.diagnostics?.snapshot() || 'CLI 未返回错误详情。'}`
        yield failure(turn.view.message)
        return
      }
      completed = true
      syncActivity()
      if (turn.view.renderer === 'plugin') {
        const answer = [...allBlocks].reverse().find(block => block.kind === 'text')
        if (answer) {
          const record = turn.view.activity?.find(item => item.index === answer.index)
          if (record) record.answer = true
          yield { type: 'block-start', index: answer.index, blockType: 'text' }
          yield { type: 'text-delta', index: answer.index, text: answer.safe.snapshot() }
          yield { type: 'block-end', index: answer.index, block: { type: 'text', text: answer.safe.snapshot() } }
        }
      }
      yield { type: 'finish', reason: { kind: 'stop' } }
    } catch (error) {
      if (turn?.cancel.signal.aborted || options.signal?.aborted) {
        yield { type: 'finish', reason: { kind: 'aborted', failure: { code: 'ABORTED', message: 'Claude Code request was canceled.' } } }
      } else {
        if (turn?.diagnostics && error instanceof Error) turn.diagnostics.append(error.message)
        turn?.diagnostics?.finish()
        const message = turn?.diagnostics ? `Claude Code 执行失败（诊断 ${turn.view.id}）。${turn.diagnostics.snapshot()}` : error instanceof Error && [
          '请先安装 Claude Code。', '当前会话没有有效的项目目录。', '当前会话没有选择模型。',
          '当前模型路由没有可读取的协议配置。', '当前路由没有可用的 API endpoint。', '当前路由的 API endpoint 不受支持。',
          '当前模型路由没有可用凭据，请在平台对话设置中配置。',
          '当前选择的推理强度不受此 Claude Code 版本支持，请在当前对话调整。',
          'Claude Code 仅支持明确声明为 Anthropic Messages 的模型路由，请在当前对话切换模型。',
          'Claude Code 安装与运行仅适用于 ZeroWall Desktop。',
        ].includes(error.message) ? error.message : 'Claude Code 请求失败，请检查独立 CLI、模型和资源配置。'
        yield failure(message)
      }
    } finally {
      if (turn) {
        turn.query?.close()
        if (!completed && turn.view.running) turn.process?.terminate()
        if (turn.process) {
          const result = await turn.process.done.catch(() => undefined)
          if (result && turn.view.exitCode === undefined) turn.view.exitCode = result.exitCode ?? -1
        }
        await turn.drainBridge?.()
        await settleClaudeToolCalls(agent)
        turn.safe.finish()
        turn.view.running = false
        turn.release?.()
        if (!completed && turn.diagnostics) {
          turn.diagnostics.finish()
          const detail = stripVTControlCharacters(turn.diagnostics.snapshot()).slice(-32_000)
          const category = claudeFailureCategory(detail)
          const root = join(this.runtime().configDir, 'diagnostics')
          turn.view.diagnostic = { id: turn.view.id, category }
          const diagnostic = {
            id: turn.view.id, category, at: new Date().toISOString(), model: turn.view.model, provider: turn.view.provider,
            exitCode: turn.view.exitCode, nativeSessionId: turn.view.nativeSessionId, permission: turn.view.permission, detail,
          }
          await mkdir(root, { recursive: true, mode: 0o700 }).then(() => this.writeSettingsDocument(join(root, `${diagnostic.id}.json`), diagnostic))
            .catch(() => { turn!.view.message = `${turn!.view.message ?? 'Claude 执行失败。'} 诊断文件无法写入，请检查数据目录权限。` })
        }
        if (turn.binding && turn.bindingStore) {
          turn.binding.state = completed ? 'idle' : turn.cancel.signal.aborted ? 'stopped' : 'failed'
          await turn.bindingStore.save(agent.id, turn.binding).catch(() => {
            turn!.view.message = `${turn!.view.message ?? ''} Claude 会话进度无法保存，下次续接将核对原生记录。`.trim()
          })
        }
        syncActivity()
        try {
          if (metrics) await agent.session.append('zerowall-claude/metrics', metrics.snapshot(true), { ignorable: true })
          if (cursor?.turn && cursor.step && turn.view.renderer === 'plugin') await agent.session.append('zerowall-claude/transcript', {
            ...cursor, renderer: 'plugin', running: false, activity: turn.view.activity ?? [],
          }, { ignorable: true })
        } finally {
          if (turn.projectionRoot) await rm(turn.projectionRoot, { recursive: true, force: true }).catch(() => undefined)
        }
      }
    }
  }

  private turnView(turn: OwnedTurn): ClaudeCodeTurn {
    return { ...turn.view, skipped: [...turn.view.skipped], output: stripVTControlCharacters(turn.safe.snapshot()) }
  }
  @Remote
  read(agent: Agent): ClaudeCodeTurn | null {
    const turn = this.owner(agent).turn
    return turn ? this.turnView(turn) : null
  }
  @Remote
  readTranscript(agent: Agent, turn: number, step: number): ClaudeTranscript | null {
    const live = this.sessions.get(agent.id)?.turn?.view
    if (live?.turn === turn && live.step === step && live.renderer === 'plugin') return {
      turn, step, renderer: 'plugin', running: live.running, activity: (live.activity ?? []).map(item => ({ ...item })),
    }
    const events = agent.session.snapshotEvents()
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index]
      if (event?.type === 'zerowall-claude/transcript' && event.data.turn === turn && event.data.step === step) return event.data
    }
    return null
  }
  @Remote
  async stop(agent: Agent): Promise<void> {
    const owner = this.owner(agent)
    owner.preparing?.abort()
    const turn = owner.turn
    turn?.cancel.abort()
    await turn?.terminal?.terminate()
    turn?.process?.terminate()
  }
  @Remote
  clear(agent: Agent): void {
    const owner = this.owner(agent)
    if (owner.busy || owner.turn?.view.running) throw new Error('请先停止当前 Claude Code 任务。')
    owner.history = []
    delete owner.turn
  }
}

/** DSH external provider that delegates one-shot work to the managed CLI. */
class ClaudeCodeSubagentProvider implements SubagentProvider {
  readonly name = 'claude-code'
  readonly capabilities = { ...NO_START_CAPABILITIES, agentOptions: true }
  readonly inheritsParentContext = false
  constructor(private readonly service: ClaudeCodeService) {}
  start(request: ResolvedSubagentStartRequest): Promise<SubagentRun> {
    return this.service.startSubagent(request)
  }
}

export function apply(ctx: Context): void {
  ctx.plugin(ClaudeCodeService)
}
export default { name, inject, apply }
