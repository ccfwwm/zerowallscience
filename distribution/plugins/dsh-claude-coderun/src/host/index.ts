import schema from '@deepseek-ai/schemastery'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { appendPluginRecord } from '@deepseek-ai/dsh-session'
import { readClaudePermission, readClaudeTranscript } from '../shared/records.js'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent, AgentOptions } from '@deepseek-ai/dsh-agent'
import { createToolResultMessage, isAgentLoopRequest, ToolCallId, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import type { SubprocessHandle, SubprocessRuntime } from '@deepseek-ai/dsh-subprocess'
import { NO_START_CAPABILITIES, assertUsableCwd, settleRunResult, subprocessRunHandle, type ResolvedSubagentStartRequest, type SubagentProvider } from '@deepseek-ai/dsh-subagent'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { SubagentResult, SubagentRun } from '@deepseek-ai/dsh-subagent'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { createHash, randomUUID } from 'node:crypto'
import { chmod, lstat, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { stripVTControlCharacters } from 'node:util'
import { SecretBrokerClient } from '@zerowall/dsh-plugin-ai-cloud/secrets'
import { ClaudeInstallError, ClaudeRuntimeManager, resolveBundledPnpmRuntime } from './runtime.js'
import { runInstaller } from './installer.js'
import { claudeEnvironmentOverlay } from './environment.js'
import { claudeHostText, writeClaudeSkills } from './skill-files.js'
import { projectSkillsForClaude, type McpServerProjectionInput, type SkillsProjectionApi } from './projection.js'
import { ClaudeSafeOutput, resolveClaudeRoute, selectedClaudeModel, type ClaudeRouteServices, type ClaudeSelection } from './route.js'
import type { ClaudeApiUsage, ClaudeCliState, ClaudeCodeStatus, ClaudeCodeTurn, ClaudeCommandDescriptor, ClaudeContextUsage, ClaudeGlobalSettingOption, ClaudeGlobalSettingsView, ClaudeNativeSettings, ClaudePermissionMode, ClaudeTranscript } from '../shared/types.js'
import { CLAUDE_COMPACT_PRESETS, CLAUDE_CONTEXT_PRESETS } from '../shared/types.js'
import { claudePromptFromRequest, parseClaudeCliEvent } from './cli.js'
import { claudePermissionMode } from './permission-mode.js'
import { mountClaudeSubagentTools } from './subagent-tool.js'
import { setSandboxMode } from '@deepseek-ai/dsh-sandbox-policy'
import { setApprovalPolicy, type ApprovalService } from '@deepseek-ai/dsh-user-approval'
import type { PermissionPresetService } from '@deepseek-ai/dsh-permission-presets'
import type { ToolRuntime } from '@deepseek-ai/dsh-tools'
import { SANDBOX_BY_CLAUDE_MODE, isClaudePermissionMode, CLAUDE_MODE_BY_SANDBOX } from './permission-mode.js'
import { ClaudeSessionBindings, inputKey, type ClaudeSessionBinding } from './session-binding.js'
import { createHostToolBridge, hostToolApproval, managedSdkSpawner, sdkGenerationEnvironment, sdkInput, sdkSystemPrompt, startSdkQuery, type Query, type Options as ClaudeSdkOptions } from './sdk-driver.js'
import { claudeFailureCategory } from './diagnostic.js'
import type { ClaudePermissionView } from '../shared/types.js'
import { resourceStatus } from './resource-status.js'
import { appendClaudeToolCall, settleClaudeToolCalls } from './tool-journal.js'
import { ClaudeMetricsCollector } from './metrics.js'
import { claudeMetricsProjection } from './metrics-projection.js'
import { claudeSettingsEnvironment, validateAdvancedClaudeSettings } from './claude-settings.js'
import { FALLBACK_COMMANDS, commandSupported, compactBoundaryOf, parseClaudeCommand } from './claude-commands.js'

export const name = 'zerowall-claude-code'
export const inject = ['typert', 'agentDefaultModel', 'subprocess', 'subagents', 'workingDirectory', 'skills', 'zerowallMcpConfigurationStore', 'zerowallEnvironment', 'credentials', 'settings', 'llm', 'sessionProjections', 'agentPresets', 'tools', 'systemPrompt', 'permissionPresets', 'attachments']

declare module '@deepseek-ai/cordis' { interface Context { zerowallClaudeCode: ClaudeCodeService } }

interface OwnedTurn {
  view: ClaudeCodeTurn
  safe: ClaudeSafeOutput
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
  commands?: ClaudeCommandDescriptor[]
  contextUsage?: ClaudeContextUsage
  compact?: ClaudeCliState['lastCompact']
  cliOutput?: ClaudeSafeOutput
}
interface SessionRuntime { turn?: OwnedTurn; history: string[]; busy: boolean; preparing?: AbortController; availableWaiters?: Set<() => void>; cliOutput?: ClaudeSafeOutput }
type ManagedRoute = NonNullable<ClaudeRouteServices['managedRoute']>
type ManagedCredential = NonNullable<ClaudeRouteServices['managedCredential']>

function contextUsageView(value: unknown, detail: 'summary' | 'full'): ClaudeContextUsage {
  const input = value as Record<string, unknown>
  const rawApiUsage = input.apiUsage
  const apiUsage = rawApiUsage && typeof rawApiUsage === 'object' && !Array.isArray(rawApiUsage)
    ? rawApiUsage as Record<string, unknown>
    : undefined
  const safeApiUsage: ClaudeApiUsage | undefined = apiUsage ? {
    ...(typeof apiUsage.input_tokens === 'number' ? { input_tokens: apiUsage.input_tokens } : {}),
    ...(typeof apiUsage.output_tokens === 'number' ? { output_tokens: apiUsage.output_tokens } : {}),
    ...(typeof apiUsage.cache_creation_input_tokens === 'number' ? { cache_creation_input_tokens: apiUsage.cache_creation_input_tokens } : {}),
    ...(typeof apiUsage.cache_read_input_tokens === 'number' ? { cache_read_input_tokens: apiUsage.cache_read_input_tokens } : {}),
  } : undefined
  return {
    totalTokens: typeof input.totalTokens === 'number' ? input.totalTokens : 0,
    maxTokens: typeof input.maxTokens === 'number' ? input.maxTokens : 0,
    ...(typeof input.rawMaxTokens === 'number' ? { rawMaxTokens: input.rawMaxTokens } : {}),
    percentage: typeof input.percentage === 'number' ? input.percentage : 0,
    ...(typeof input.autoCompactThreshold === 'number' ? { autoCompactThreshold: input.autoCompactThreshold } : {}),
    ...(typeof input.isAutoCompactEnabled === 'boolean' ? { isAutoCompactEnabled: input.isAutoCompactEnabled } : {}), detail,
    ...(safeApiUsage ? { apiUsage: safeApiUsage } : {}),
  }
}

const CLAUDE_SETTINGS_DEFAULTS: ClaudeNativeSettings = {
  outputStyle: 'Default', permissionSelector: 'plugin', permissionMode: 'acceptEdits', renderer: 'plugin',
  prose: 'plain', maxProcesses: 4, contextWindow: 'auto', autoCompactWindow: 'auto', promptCacheTtl: 'auto', subagentPromptCacheTtl: 'auto',
}
const CLAUDE_PERMISSION_MODES: readonly ClaudePermissionMode[] = ['default', 'dontAsk', 'acceptEdits', 'auto', 'plan', 'bypassPermissions']
const CLAUDE_PERMISSION_SELECTORS = ['plugin', 'native'] as const
const CLAUDE_RENDERERS = ['plugin', 'native'] as const
const CLAUDE_PROSE_MODES = ['plain', 'enhanced'] as const

function knownNativeSettings(value: Record<string, unknown>): ClaudeNativeSettings {
  const keys = ['outputStyle', 'permissionSelector', 'permissionMode', 'renderer', 'prose', 'maxProcesses', 'contextWindow', 'autoCompactWindow', 'promptCacheTtl', 'subagentPromptCacheTtl']
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
  if (input.maxProcesses !== undefined) {
    if (typeof input.maxProcesses !== 'number' || !Number.isSafeInteger(input.maxProcesses) || input.maxProcesses < 1 || input.maxProcesses > 16) throw new Error('Claude Code setting maxProcesses is invalid.')
    result.maxProcesses = input.maxProcesses
  }
  Object.assign(result, validateAdvancedClaudeSettings(input))
  return result
}

/** One installed runtime, with credentials resolved afresh for every prompt. */
export class ClaudeCodeService extends TypertRemoteService {
  private manager?: ClaudeRuntimeManager
  private readonly secrets: SecretBrokerClient
  private readonly sessions = new Map<string, SessionRuntime>()
  private managedRoute: ManagedRoute | undefined
  private managedCredential: ManagedCredential | undefined
  private mutation = false
  private readonly chatAgents = new Map<string, Agent>()
  private processReservations = 0
  private readonly runtimeInitialization: Promise<void>
  private preparation?: Promise<void>
  private readonly installAbort = new AbortController()
  private readiness: NonNullable<ClaudeCodeStatus['readiness']> = 'checking'
  private runtimeDiagnostic?: string
  private autoSuppressed = false
  private disposed = false
  private preparationRevision = 0
  constructor(ctx: Context, private readonly config: ClaudeRuntimeConfig = {}) {
    super(ctx, 'zerowallClaudeCode')
    this.secrets = new SecretBrokerClient(ctx.credentials)
    this.runtimeInitialization = this.initializeRuntime().catch(() => { this.readiness = 'failed'; this.runtimeDiagnostic = 'Claude Code 自动准备失败。请检查网络、镜像和应用运行文件，然后在插件设置中重试。' })
    ctx.sessionProjections.register(claudeMetricsProjection)
    ctx.inject(['subagents'], scope => {
      const subagents = scope.get('subagents') as { registerProvider(provider: SubagentProvider): () => void }
      const dispose = subagents.registerProvider(new ClaudeCodeSubagentProvider(request => this.startSubagent(request)))
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
          if (!agent.session.snapshotEvents().some(event => readClaudePermission(event) !== undefined)) {
            await appendPluginRecord(agent.session, 'plugin:zerowall-claude/permission', { mode: permission.mode })
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
      const latest = options.messages.at(-1)
      const block = latest?.role === 'user' && latest.content.length === 1 ? latest.content[0] : undefined
      const command = block?.type === 'text' ? parseClaudeCommand(block.text) : undefined
      if (command?.kind === 'slash') {
        yield* thisService.streamConversationCommand(routed, block!.type === 'text' ? block!.text : '', options)
        return
      }
      yield* thisService.streamConversation(routed, {
        provider: options.provider,
        model: options.model,
        ...(options.reasoningEffort === undefined ? {} : { reasoningEffort: options.reasoningEffort }),
      }, options)
    })
    ctx.effect(() => async () => {
      this.disposed = true
      this.installAbort.abort()
      await this.runtimeInitialization
      await this.preparation?.catch(() => undefined)
      await Promise.allSettled([...this.sessions.values()].map(async state => {
        state.preparing?.abort()
        state.turn?.cancel.abort()
        state.turn?.query?.close()
        state.turn?.process?.terminate()
      }))
      this.sessions.clear()
      this.chatAgents.clear()
    }, 'claude-code: terminate plugin-owned processes')
  }

  private desktop(): boolean { return Boolean(process.env.ZEROWALL_DESKTOP_RUNTIME_ROOT && isAbsolute(process.env.ZEROWALL_DESKTOP_RUNTIME_ROOT)) }
  private runtimeRoot(): string { return resolve(this.config.runtimeRoot ?? process.env.ZEROWALL_CLAUDE_RUNTIME_ROOT ?? join(resolveDshHome(), 'zerowall', 'claude-code', 'runtime')) }
  private anyRunning(): boolean {
    return [...this.sessions.values()].some(state => state.busy || state.turn?.view.running === true)
  }
  private sessionOccupied(owner: SessionRuntime): boolean {
    return owner.busy || owner.turn?.view.running === true
  }
  private runtime(): ClaudeRuntimeManager {
    if (!this.desktop()) throw new Error('Claude Code 安装与运行仅适用于 ZeroWall Desktop。')
    if (!this.manager) {
      this.manager = new ClaudeRuntimeManager({
        dataDir: this.runtimeRoot(),
        pnpm: resolveBundledPnpmRuntime(),
        version: this.config.version, registry: this.config.registry, signal: this.installAbort.signal,
        onPhase: phase => { this.readiness = phase },
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

  private notifySessionAvailable(owner: SessionRuntime): void {
    if (this.sessionOccupied(owner)) return
    const waiters = owner.availableWaiters
    delete owner.availableWaiters
    for (const resolve of waiters ?? []) resolve()
  }

  private async waitForSessionAvailable(owner: SessionRuntime, signal?: AbortSignal): Promise<void> {
    while (this.sessionOccupied(owner)) {
      if (signal?.aborted) throw new Error('Claude Code request was canceled.')
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => signal?.removeEventListener('abort', abort)
        const ready = () => { cleanup(); resolve() }
        const abort = () => { owner.availableWaiters?.delete(ready); cleanup(); reject(new Error('Claude Code request was canceled.')) }
        owner.availableWaiters ??= new Set()
        owner.availableWaiters.add(ready)
        signal?.addEventListener('abort', abort, { once: true })
      })
    }
  }

  private async statusSnapshot(running: boolean): Promise<ClaudeCodeStatus> {
    if (!this.desktop()) return { desktop: false, installed: false, readiness: 'unsupported', rollbackAvailable: false, running: false }
    try {
      const status = await this.runtime().inspect()
      return { desktop: true, installed: status.installed, readiness: this.preparation ? this.readiness : status.installed ? 'ready' : this.readiness === 'failed' ? 'failed' : 'missing', ...(this.runtimeDiagnostic ? { diagnostic: this.runtimeDiagnostic, errorCategory: 'installation' as const } : {}), ...(status.version ? { version: status.version } : {}),
        ...(status.executablePath ? { executablePath: status.executablePath } : {}),
        rollbackAvailable: Boolean(status.previousVersion), running }
    } catch {
      return { desktop: true, installed: false, readiness: 'failed', errorCategory: 'runtime', rollbackAvailable: false, running,
        diagnostic: 'Claude Code 运行文件缺失或版本检测失败。请使用插件中的修复功能；若内置 Node 或 pnpm 缺失，请修复应用安装。' }
    }
  }

  @Remote
  async status(agent: Agent): Promise<ClaudeCodeStatus> {
    const owner = this.owner(agent)
    return this.statusSnapshot(this.sessionOccupied(owner))
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
    for (const key of ['permissionSelector', 'permissionMode', 'renderer', 'prose', 'maxProcesses', 'contextWindow', 'autoCompactWindow', 'promptCacheTtl', 'subagentPromptCacheTtl'] as const) {
      if (next[key] !== undefined) plugin[key] = next[key]
    }
    await Promise.all([this.writeSettingsDocument(nativePath, native), this.writeSettingsDocument(pluginPath, plugin)])
    // Streaming SDK sessions can hot-apply the native controls that Claude
    // exposes. File-backed context/cache settings intentionally take effect
    // on the next session because the SDK does not permit changing them
    // safely after initialization.
    const syncFailures: string[] = []
    for (const state of this.sessions.values()) {
      const query = state.turn?.query
      if (!state.turn?.view.running || !query) continue
      if (next.permissionMode !== undefined) {
        try { await query.setPermissionMode(next.permissionMode as Parameters<Query['setPermissionMode']>[0]) }
        catch { syncFailures.push('权限模式') }
      }
      if (next.outputStyle !== undefined) {
        try {
          await query.applyFlagSettings({ outputStyle: next.outputStyle === 'Default' ? null : next.outputStyle })
          if (next.outputStyle !== 'Default') await query.updateSettings('localSettings', { outputStyle: next.outputStyle })
        } catch { syncFailures.push('输出风格') }
      }
    }
    if (syncFailures.length) throw new Error(`设置已保存，但活动 Claude 会话未能同步：${[...new Set(syncFailures)].join('、')}。新设置将在新会话生效。`)
    return merged
  }

  /** Dynamic descriptor view matching Claude Code's native Settings surface. */
  @Remote('settingsGlobalGet')
  async settingsGlobalGet(): Promise<ClaudeGlobalSettingsView> {
    const native = await this.settingsGet()
    const outputStyles = await this.outputStyleOptions()
    const activeModel = [...this.sessions.values()].map(state => state.turn?.view.model).find(Boolean) ?? 'claude'
    const configuredOverrides: NodeJS.ProcessEnv = { ...process.env }
    const environment = this.ctx.get('zerowallEnvironment') as { listVariables(): Promise<Array<{ name: string }>>; readVariable(name: string): Promise<string | undefined> }
    const overrideNames = new Set(['CLAUDE_CODE_MAX_CONTEXT_TOKENS', 'CLAUDE_CODE_AUTO_COMPACT_WINDOW', 'CLAUDE_CODE_DISABLE_1M_CONTEXT', 'CLAUDE_CODE_PROMPT_CACHE_TTL', 'CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL', 'ENABLE_PROMPT_CACHING_1H', 'FORCE_PROMPT_CACHING_5M'])
    for (const variable of await environment.listVariables()) {
      if (!overrideNames.has(variable.name.toUpperCase())) continue
      const value = await environment.readVariable(variable.name)
      if (value !== undefined) configuredOverrides[variable.name] = value
    }
    const effective = claudeSettingsEnvironment(native, activeModel, configuredOverrides).effective
    const select = (key: string, value: string, options: readonly { value: string; label: string; source: 'built-in' | 'user' | 'configured' }[], effect: 'immediate' | 'new-session' | 'next-turn' | 'next-worktree' | 'restart') => ({ key, kind: 'select' as const, value, options, effect })
    const text = (key: string, value: string, maxLength: number, effect: 'immediate' | 'new-session' | 'next-turn' | 'next-worktree' | 'restart') => ({ key, kind: 'text' as const, value, maxLength, effect })
    const number = (key: string, value: string, min: number, max: number, effect: 'immediate' | 'new-session' | 'next-turn' | 'next-worktree' | 'restart') => ({ key, kind: 'number' as const, value, min, max, step: 1, effect })
    return { settings: [
      select('outputStyle', native.outputStyle ?? 'Default', outputStyles, 'new-session'),
      select('permissionSelector', native.permissionSelector ?? 'plugin', CLAUDE_PERMISSION_SELECTORS.map(value => ({ value, label: value, source: 'built-in' as const })), 'immediate'),
      select('permissionMode', native.permissionMode ?? 'auto', CLAUDE_PERMISSION_MODES.map(value => ({ value, label: value, source: 'built-in' as const })), 'new-session'),
      select('renderer', native.renderer ?? 'plugin', CLAUDE_RENDERERS.map(value => ({ value, label: value, source: 'built-in' as const })), 'next-turn'),
      select('prose', native.prose ?? 'plain', CLAUDE_PROSE_MODES.map(value => ({ value, label: value, source: 'built-in' as const })), 'immediate'),
      text('maxProcesses', String(native.maxProcesses ?? 4), 2, 'immediate'),
      { ...number('contextWindow', String(native.contextWindow ?? 'auto'), 1, 10_000_000, 'new-session'), presets: CLAUDE_CONTEXT_PRESETS, effective: effective.contextWindow },
      { ...number('autoCompactWindow', String(native.autoCompactWindow ?? 'auto'), 100_000, 1_000_000, 'new-session'), presets: CLAUDE_COMPACT_PRESETS, effective: effective.autoCompactWindow },
      { ...select('promptCacheTtl', native.promptCacheTtl ?? 'auto', ['auto', '5m', '1h'].map(value => ({ value, label: value, source: 'built-in' as const })), 'new-session'), effective: effective.promptCacheTtl },
      { ...select('subagentPromptCacheTtl', native.subagentPromptCacheTtl ?? 'auto', ['auto', '5m', '1h'].map(value => ({ value, label: value, source: 'built-in' as const })), 'new-session'), effective: effective.subagentPromptCacheTtl },
    ] }
  }

  @Remote('settingsGlobalUpdate')
  async settingsGlobalUpdate(changes: Record<string, string>): Promise<ClaudeGlobalSettingsView> {
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) throw new Error('Claude Code global settings changes must be an object.')
    const supported = new Set(['outputStyle', 'permissionSelector', 'permissionMode', 'renderer', 'prose', 'maxProcesses', 'contextWindow', 'autoCompactWindow', 'promptCacheTtl', 'subagentPromptCacheTtl'])
    for (const key of Object.keys(changes)) if (!supported.has(key)) throw new Error(`Unsupported Claude Code global setting: ${key}`)
    for (const [key, value] of Object.entries(changes)) if (typeof value !== 'string' || value.length > 128) throw new Error(`Claude Code setting ${key} is invalid.`)
    if (Object.hasOwn(changes, 'outputStyle') && !(await this.outputStyleOptions()).some(option => option.value === changes.outputStyle)) throw new Error('Claude Code output style is unavailable.')
    const patch: Partial<ClaudeNativeSettings> = {}
    for (const [key, value] of Object.entries(changes)) {
      if (key === 'maxProcesses') {
        const parsed = Number(value)
        if (!Number.isSafeInteger(parsed)) throw new Error(`Claude Code setting ${key} is invalid.`)
        patch[key] = parsed
      } else if (key === 'contextWindow' || key === 'autoCompactWindow') {
        const parsed = value === 'auto' || value === '200k' || value === '1m' ? value : Number(value)
        if (typeof parsed === 'number' && (!Number.isSafeInteger(parsed) || key === 'autoCompactWindow' && (parsed < 100_000 || parsed > 1_000_000))) throw new Error(`Claude Code setting ${key} is outside the supported range.`)
        ;(patch as Record<string, unknown>)[key] = parsed
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
  private async startSubagent(request: ResolvedSubagentStartRequest): Promise<SubagentRun> {
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
      turn = await this.launch(agent, text, selected, { cwd: request.cwd, signal: request.signal, scope: request.parent, request: input })
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
        await appendPluginRecord(request.parent.session, 'plugin:zerowall-claude/metrics', metrics.snapshot())
        for await (const message of turn.query!) {
          if (metrics.observe(message)) await appendPluginRecord(request.parent.session, 'plugin:zerowall-claude/metrics', metrics.snapshot())
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
        await appendPluginRecord(request.parent.session, 'plugin:zerowall-claude/metrics', metrics.snapshot(true))
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

  private async initializeRuntime(): Promise<void> {
    if (!this.desktop()) { this.readiness = 'unsupported'; return }
    try { this.autoSuppressed = JSON.parse(await readFile(join(this.runtimeRoot(), 'auto-install.json'), 'utf8')).disabled === true }
    catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error }
    if (this.config.autoInstall !== false && !this.autoSuppressed) await this.ensurePrepared(false)
    else this.readiness = 'missing'
  }

  private ensurePrepared(force: boolean): Promise<void> {
    if (this.preparation) return this.preparation
    const task = (async () => {
      if (this.disposed) throw new Error('Claude runtime is shutting down.')
      this.readiness = 'checking'
      this.runtimeDiagnostic = undefined
      const runtime = this.runtime()
      if (!force) {
        try { if ((await runtime.inspect()).installed) { this.readiness = 'ready'; return } }
        catch (error) { if (this.installAbort.signal.aborted) throw error }
        if (this.config.autoInstall === false || this.autoSuppressed) throw new Error('Claude Code is not ready. Install it from plugin settings.')
      }
      if ([...this.sessions.values()].some(state => state.turn?.view.running)) throw new Error('Stop Claude Code before repairing the installation.')
      this.preparationRevision++
      for (let attempt = 0; ; attempt++) {
        try { await runtime.installOrUpdate(); break }
        catch (error) { if (!(error instanceof ClaudeInstallError) || attempt >= 1 || this.installAbort.signal.aborted) throw error }
      }
      this.readiness = 'ready'
    })()
    this.preparation = task
    void task.catch(() => { this.readiness = 'failed'; this.runtimeDiagnostic = 'Claude Code 安装或版本校验失败。请检查网络及插件镜像配置后重试。' }).finally(() => { if (this.preparation === task) this.preparation = undefined })
    return task
  }

  private async changeRuntime(operation: 'install' | 'rollback' | 'uninstall', agent?: Agent): Promise<ClaudeCodeStatus> {
    const revision = this.preparationRevision
    const preparing = this.preparation
    await this.runtimeInitialization
    if (operation === 'install' && (this.preparationRevision > revision || preparing) && this.readiness === 'ready') return this.statusSnapshot(this.anyRunning())
    if (operation === 'install' && this.preparation) { await this.preparation; return this.statusSnapshot(this.anyRunning()) }
    if (this.mutation || this.preparation || this.anyRunning()) throw new Error('请先停止 Claude Code，再管理安装。')
    this.mutation = true
    try {
      const runtime = this.runtime()
      if (operation === 'install') {
        await this.ensurePrepared(true)
        await mkdir(this.runtimeRoot(), { recursive: true })
        await this.writeSettingsDocument(join(this.runtimeRoot(), 'auto-install.json'), { disabled: false })
        this.autoSuppressed = false
      } else if (operation === 'rollback') { await runtime.rollback(); this.readiness = 'ready' }
      else {
        await mkdir(this.runtimeRoot(), { recursive: true })
        await this.writeSettingsDocument(join(this.runtimeRoot(), 'auto-install.json'), { disabled: true })
        this.autoSuppressed = true
        await runtime.uninstall(); this.sessions.clear(); this.readiness = 'missing'
      }
      this.runtimeDiagnostic = undefined
      return await this.statusSnapshot(agent === undefined ? this.anyRunning() : this.owner(agent).busy || Boolean(this.owner(agent).turn?.view.running))
    } catch (error) {
      if (!this.desktop()) throw error
      throw new Error('Claude Code 安装管理未完成；现有有效安装会被保留，请重试。')
    } finally { this.mutation = false }
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

  @Remote
  async permissionView(agent: Agent): Promise<ClaudePermissionView> {
    const settings = await this.settingsGet()
    const presets = this.ctx.get('permissionPresets') as PermissionPresetService | undefined
    const source = settings.permissionSelector ?? 'plugin'
    const events = agent.session.snapshotEvents()
    const chosen = events.map(readClaudePermission).findLast(value => value !== undefined)
    const hostPreset = presets?.current(agent.session) ?? 'custom'
    const spec = hostPreset !== 'custom' ? presets?.resolve(hostPreset) : undefined
    const permissions = (this.ctx.get('sessionProjections') as { stateOf(session: unknown, key: string): { sandbox?: string; approval?: string } | undefined }).stateOf(agent.session, 'permissions')
    const sandbox = permissions?.sandbox ?? spec?.sandbox ?? 'read-only'
    const approval = permissions?.approval ?? spec?.approval ?? 'ask'
    const selected = chosen?.mode ?? settings.permissionMode ?? 'acceptEdits'
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
      await appendPluginRecord(agent.session, 'plugin:zerowall-claude/permission', { mode: value })
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

  private async launch(agent: Agent, prompt: string, selected?: ClaudeSelection, execution: { cwd?: string; signal?: AbortSignal; scope?: Agent; request?: GenerateOptions } = {}): Promise<OwnedTurn> {
    const maxPrompt = 2 * 1024 * 1024
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > maxPrompt || prompt.includes('\0')) {
      throw new Error('Claude Code conversation context exceeds the supported size.')
    }
    const owner = this.owner(agent)
    if (this.mutation || this.sessionOccupied(owner)) throw new Error('Claude Code 正在运行，请等待或停止当前任务。')
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
      await this.runtimeInitialization
      await this.ensurePrepared(false)
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
      const projects = this.ctx.get('zerowallMcpConfigurationStore') as { listMcpServers(): McpServerProjectionInput[] }
      let skills = await projectSkillsForClaude(skillsRegistry, cwd, execution.scope ?? agent)
      cancel.signal.throwIfAborted()
      // Keep one projection root per native session so Skills/MCP paths stay
      // stable and prompt-cache entries remain reusable across turns.
      projectionRoot = join(runtime.configDir, 'sessions', createHash('sha256').update(agent.id).digest('hex'), 'projection')
      await rm(projectionRoot, { recursive: true, force: true }).catch(() => undefined)
      await mkdir(projectionRoot, { recursive: true, mode: 0o700 })
      await writeClaudeSkills(projectionRoot, skills)
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
      const baseEnvironment = runtime.getCliEnvironment({ ANTHROPIC_API_KEY: route.apiKey, ANTHROPIC_BASE_URL: route.baseUrl,
        ANTHROPIC_MODEL: route.model, ANTHROPIC_DEFAULT_HAIKU_MODEL: route.model,
        ANTHROPIC_DEFAULT_SONNET_MODEL: route.model, ANTHROPIC_DEFAULT_OPUS_MODEL: route.model }, undefined, {}, configuredEnvironment)
      const settingsEnvironment = claudeSettingsEnvironment(nativeSettings, route.model, baseEnvironment)
      const environment = settingsEnvironment.env
      const turn: OwnedTurn = {
        view: { id: randomUUID(), provider: route.provider, model: route.model, executablePath: executable, running: true, output: '', renderer: nativeSettings.renderer ?? 'plugin', activity: [],
          skills: skills.skills.length, mcp: 0,
          skipped: [...settingsEnvironment.warnings.map(item => `设置：${item}`), ...skills.skipped.map(item => `Skill ${item.name}: ${item.reason}`)] },
        safe: new ClaudeSafeOutput([route.apiKey, ...Object.values(configuredEnvironment)]), cancel,
      }
      owner.turn = turn
      turn.projectionRoot = projectionRoot
      if (execution.request) {
        const generationEnvironment = sdkGenerationEnvironment(execution.request)
        const permission = await this.permissionView(agent)
        if (permission.source === 'plugin' && !execution.scope) {
          if (!agent.session.snapshotEvents().some(event => readClaudePermission(event) !== undefined)) {
            await appendPluginRecord(agent.session, 'plugin:zerowall-claude/permission', { mode: permission.mode })
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
        const bridgeAgent = execution.scope ?? agent
        const skillRegistry = bridgeAgent.ctx.get('skills') as { inventory(options: { cwd: string }): Promise<{ entries: Array<{ effective: boolean; enabled: boolean; skill: { name: string } }> }> } | undefined
        if (!skillRegistry) throw new Error('The Skills registry is unavailable.')
        let skillCatalog = JSON.stringify((await skillsRegistry.snapshot({ cwd, scope: bridgeAgent })).skills)
        const bridge = createHostToolBridge(bridgeAgent, schemas, cancel.signal, route, bridgeState,
          () => (bridgeAgent.ctx.get('tools') as ToolRuntime).schemas(bridgeAgent), async () => {
            const current = await skillsRegistry.snapshot({ cwd, scope: bridgeAgent })
            if (!current.complete) throw new Error('The Skills catalog is incomplete.')
            if (JSON.stringify(current.skills) !== skillCatalog) {
              skills = await projectSkillsForClaude(skillsRegistry, cwd, bridgeAgent)
              await writeClaudeSkills(projectionRoot!, skills)
              skillCatalog = JSON.stringify(current.skills)
              turn.view.skills = skills.skills.length
            }
            const tools = (bridgeAgent.ctx.get('tools') as ToolRuntime).schemas(bridgeAgent)
            const runtime = await (this.ctx.get('zerowallMcp') as { list(): Promise<Array<{ serverName: string; runtimeState: string }>> } | undefined)?.list() ?? []
            const inventory = await skillRegistry.inventory({ cwd })
            const disabled = inventory.entries.filter(entry => entry.effective && !entry.enabled).map(entry => entry.skill.name)
            turn.view.resources = resourceStatus(skills, projects.listMcpServers(), tools, runtime, disabled)
            turn.view.mcp = turn.view.resources.filter(row => row.kind === 'mcp' && row.state === 'synced').length
          })
        if (bridgeState.drain) turn.drainBridge = bridgeState.drain
        const mcpService = this.ctx.get('zerowallMcp') as { list(): Promise<Array<{ serverName: string; runtimeState: string }>> } | undefined
        const mcpRuntime = await mcpService?.list().catch(() => []) ?? []
        const skillInventory = await skillRegistry.inventory({ cwd })
        const disabled = skillInventory.entries.filter(entry => entry.effective && !entry.enabled).map(entry => entry.skill.name)
        turn.view.resources = resourceStatus(skills, projects.listMcpServers(), schemas, mcpRuntime, disabled)
        turn.view.mcp = turn.view.resources.filter(row => row.kind === 'mcp' && row.state === 'synced').length
        turn.diagnostics = turn.safe.fork()
        const inputId = randomUUID()
        binding.pending = { uuid: inputId, keys: input.submitted }; binding.state = 'submitted'
        await store.save(agent.id, binding)
        const approval = this.ctx.get('approval') as ApprovalService
        turn.approvalCalls = new Set()
        turn.query = startSdkQuery({
          pathToClaudeCodeExecutable: executable, cwd, env: { ...environment, ...generationEnvironment, CLAUDE_CODE_ENABLE_REFRESH_MCP_TOOLS: '1' },
          abortController: cancel, model: route.model, ...(route.reasoningEffort ? { effort: route.reasoningEffort as NonNullable<ClaudeSdkOptions['effort']> } : {}),
          ...(binding.initialized ? { resume: binding.nativeId } : { sessionId: binding.nativeId }), persistSession: true,
          permissionMode: permission.mode, permissionPrompts: 'host', allowDangerouslySkipPermissions: permission.mode === 'bypassPermissions',
          settingSources: ['user'], plugins: [{ type: 'local', path: projectionRoot }],
          ...(nativeSettings.outputStyle && nativeSettings.outputStyle !== 'Default' ? { settings: { outputStyle: nativeSettings.outputStyle } } : {}),
          includePartialMessages: true, systemPrompt: claudeHostText(sdkSystemPrompt(execution.request)) + '\n\nAll Host tools are bridged through server zerowall. For a Host tool NAME, call mcp__zerowall__NAME with its real schema. This includes external tools: mcp__zerowallrmcp__r_runtime becomes mcp__zerowall__mcp__zerowallrmcp__r_runtime. Use mcp__zerowall__capability_search for on-demand MCP connections, then RefreshMcpTools for server zerowall and ToolSearch if needed. Skills use the same Host registry and enablement settings; read them through the projected Skills plugin or the Host skill tools. Do not create a second direct MCP connection.',
          mcpServers: { zerowall: bridge }, strictMcpConfig: true,
          // Keep MCP tools out of the SDK's bare allowedTools auto-approval
          // list so canUseTool remains in the path; the bridge then dispatches
          // through the Host's own tool policy and approval pipeline.
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
        void this.refreshQueryCapabilities(turn)
        turn.release = release
        processOwnsProjection = true
        return turn
      }
      throw new Error('Claude Code conversation request is missing its SDK options.')
    } catch (error) {
      if (owner.turn?.cancel === cancel) {
        owner.turn.query?.close(); owner.turn.process?.terminate()
        owner.turn.view.running = false
        if (owner.turn.binding && owner.turn.bindingStore) {
          owner.turn.binding.state = cancel.signal.aborted ? 'stopped' : 'failed'
          delete owner.turn.binding.pending
          await owner.turn.bindingStore.save(agent.id, owner.turn.binding).catch(() => undefined)
        }
        if (owner.turn.diagnostics && error instanceof Error) {
          owner.turn.diagnostics.finish()
          owner.turn.view.message = `Claude 启动失败（诊断 ${owner.turn.view.id}），请检查安装状态后重试。`
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
      this.notifySessionAvailable(owner)
    }
  }

  private async *streamConversation(agent: Agent, selection: ClaudeSelection, options: GenerateOptions): AsyncIterable<StreamChunk> {
    const owner = this.owner(agent)
    let turn: OwnedTurn | undefined
    let metrics: ClaudeMetricsCollector | undefined
    const observeMetrics = async (message: unknown) => {
      if (metrics?.observe(message)) await appendPluginRecord(agent.session, 'plugin:zerowall-claude/metrics', metrics.snapshot())
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
      if (owner.busy || owner.turn?.view.running) await this.waitForSessionAvailable(owner, options.signal)
      turn = await this.launch(agent, 'SDK conversation input', selection, { request: options, ...(options.signal ? { signal: options.signal } : {}) })
      metrics = new ClaudeMetricsCollector({ runId: turn.view.id, nativeSessionId: turn.binding?.nativeId ?? turn.view.id,
        provider: selection.provider, model: selection.model, turn: cursor?.turn ?? 0, main: true }, Date.now, turn.view.resumed === true)
      await appendPluginRecord(agent.session, 'plugin:zerowall-claude/metrics', metrics.snapshot())
      // DSH's surface excludes Claude's internal requests. Its capacity meter
      // must not combine those separate surfaces; the plugin owns this reading.
      const context = agent.session.requestContext?.()
      if (context?.contextWindow !== undefined) {
        const { contextWindow: _capacity, ...metadata } = context
        await agent.session.append('request/context', metadata)
      }
      if (cursor?.turn && cursor.step) {
        turn.view.turn = cursor.turn; turn.view.step = cursor.step
        if (turn.view.renderer === 'plugin') await appendPluginRecord(agent.session, 'plugin:zerowall-claude/turn', cursor)
      }
      if (!turn.query && !turn.process?.stdout) {
        yield failure(turn.view.message ?? 'Claude Code could not start the managed CLI.')
        return
      }
      let pending = ''
      if (turn.query) {
        for await (const message of turn.query) {
          await observeMetrics(message)
          const compactBoundary = compactBoundaryOf(message)
          if (compactBoundary) {
            delete turn.contextUsage
          }
          if (compactBoundary) turn.compact = compactBoundary
          if (message.type === 'result') {
            try { turn.contextUsage = contextUsageView(await turn.query.getContextUsage({ detail: 'summary' }), 'summary') } catch { /* optional SDK control */ }
          }
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
      if (turn?.cancel.signal.aborted || options.signal?.aborted || error instanceof Error && error.message === 'Claude Code 任务已停止。') {
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
          'Claude Code 安装与运行仅适用于 ZeroWall Desktop。', 'Claude Code 无法准备当前会话，请检查模型配置与资源状态。',
          'Claude Code 已达到最大并发进程数，请等待其他任务完成。', 'Claude Code 正在运行，请等待或停止当前任务。',
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
          if (metrics) await appendPluginRecord(agent.session, 'plugin:zerowall-claude/metrics', metrics.snapshot(true))
          if (cursor?.turn && cursor.step && turn.view.renderer === 'plugin') await appendPluginRecord(agent.session, 'plugin:zerowall-claude/transcript', {
            ...cursor, renderer: 'plugin', running: false, activity: turn.view.activity ?? [],
          })
        } finally {
          if (turn.projectionRoot) await rm(turn.projectionRoot, { recursive: true, force: true }).catch(() => undefined)
        }
      }
      this.notifySessionAvailable(owner)
    }
  }

  private async *streamConversationCommand(agent: Agent, input: string, options: GenerateOptions): AsyncIterable<StreamChunk> {
    const owner = this.owner(agent)
    const selected: ClaudeSelection = {
      provider: options.provider,
      model: options.model,
      ...(options.reasoningEffort === undefined ? {} : { reasoningEffort: options.reasoningEffort }),
    }
    try {
      await this.waitForSessionAvailable(owner, options.signal)
      const previous = (await this.cliStateFor(agent)).output
      const state = await this.executeCliInput(agent, input, selected, options.signal)
      const command = parseClaudeCommand(input)
      const compact = command.kind === 'slash' && (command.name === '/compact' || command.name === '/压缩') ? state.lastCompact : undefined
      const text = compact
        ? `上下文已压缩（已收到 compact_boundary）：压缩前 ${compact.preTokens.toLocaleString()} tokens${compact.postTokens === undefined ? '' : `，压缩后 ${compact.postTokens.toLocaleString()} tokens`}。`
        : (state.output.startsWith(previous) ? state.output.slice(previous.length).trim() : state.output) || 'Claude 命令已完成。'
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text }
      yield { type: 'block-end', index: 0, block: { type: 'text', text } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    } catch (reason) {
      const safe = new ClaudeSafeOutput([])
      safe.append(reason instanceof Error ? reason.message : 'Claude 命令执行失败。')
      yield { type: 'finish', reason: { kind: options.signal?.aborted ? 'aborted' : 'error', failure: { code: 'CLAUDE_COMMAND', message: safe.snapshot() } } }
    } finally {
      // A handled command must not be replayed as prose on the next chat turn.
      const turn = owner.turn
      const latest = options.messages.at(-1)
      if (latest && turn?.binding && turn.bindingStore) {
        turn.binding.submitted = [...new Set([...turn.binding.submitted, inputKey(latest)])]
        await turn.bindingStore.save(agent.id, turn.binding)
      }
    }
  }

  private turnView(turn: OwnedTurn): ClaudeCodeTurn {
    return { ...turn.view, skipped: [...turn.view.skipped], output: stripVTControlCharacters(turn.safe.snapshot()), ...(turn.contextUsage ? { contextUsage: turn.contextUsage } : {}), ...(turn.compact ? { lastCompact: turn.compact } : {}) }
  }

  private async refreshQueryCapabilities(turn: OwnedTurn): Promise<void> {
    if (!turn.query) return
    try {
      turn.commands = (await turn.query.supportedCommands()).map(command => ({ name: command.name, ...(command.description ? { description: command.description } : {}), ...(command.argumentHint ? { argumentHint: command.argumentHint } : {}) }))
    } catch { turn.commands = [...FALLBACK_COMMANDS] }
    try {
      const usage = await turn.query.getContextUsage({ detail: 'summary' })
      turn.contextUsage = contextUsageView(usage, 'summary')
    } catch { /* Older managed CLIs do not expose control requests. */ }
  }

  private async runCliInput(agent: Agent, text: string, selected?: ClaudeSelection, options: { requireCompactBoundary?: boolean; fetchUsage?: boolean; fetchContext?: 'summary' | 'full'; signal?: AbortSignal } = {}): Promise<OwnedTurn> {
    const request = { messages: [{ role: 'user', content: [{ type: 'text', text }] }], tools: [] } as unknown as GenerateOptions
    const turn = await this.launch(agent, text, selected, { request, ...(options.signal ? { signal: options.signal } : {}) })
    if (!turn.query) throw new Error(turn.view.message ?? 'Claude SDK 会话不可用。')
    turn.cliOutput = turn.safe.fork()
    this.owner(agent).cliOutput = turn.cliOutput
    let compactBoundary = false
    let completed = false
    try {
      if (options.fetchUsage && turn.query.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET) {
        try {
          const usage = await turn.query.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true }) as Record<string, unknown>
          const fields = ['total_cost_usd', 'total_input_tokens', 'total_output_tokens', 'total_duration_ms', 'total_api_duration_ms', 'num_turns', 'rate_limits_available']
          const lines = fields.filter(key => usage[key] !== undefined).map(key => `${key}: ${String(usage[key])}`)
          if (lines.length) turn.cliOutput.append(`用量摘要\n${lines.join('\n')}\n\n`)
        } catch { /* The experimental endpoint is optional; the native command still runs. */ }
      }
      for await (const message of turn.query) {
        const compact = compactBoundaryOf(message)
        if (compact) {
          compactBoundary = true
          turn.compact = compact
          delete turn.contextUsage
        }
        if (message.type === 'system' && message.subtype === 'init' && turn.binding) {
          if (turn.binding.nativeId !== message.session_id) throw new Error('Claude session identity changed unexpectedly.')
          turn.binding.initialized = true
          turn.binding.state = 'running'
          await turn.bindingStore!.save(agent.id, turn.binding)
        }
        if ((message.type === 'assistant' || message.type === 'stream_event') && turn.binding?.pending) {
          turn.binding.submitted = turn.binding.pending.keys
          delete turn.binding.pending
          await turn.bindingStore!.save(agent.id, turn.binding)
        }
        if (message.type === 'result') {
          if (turn.binding?.pending) {
            turn.binding.submitted = turn.binding.pending.keys
            delete turn.binding.pending
          }
          try {
            const detail = options.fetchContext ?? 'summary'
            turn.contextUsage = contextUsageView(await turn.query.getContextUsage({ detail }), detail)
          } catch { /* Context usage is optional on older managed CLIs. */ }
          if (turn.binding) await turn.bindingStore!.save(agent.id, turn.binding)
        }
        const event = parseClaudeCliEvent(JSON.stringify(message))
        if (event?.text) { turn.cliOutput.append(event.text); turn.safe.append(event.text) }
      }
      if (turn.process) await turn.process.done.catch(() => undefined)
      if (options.requireCompactBoundary && !compactBoundary) throw new Error('Claude 未返回本次压缩的 compact_boundary；无法确认上下文已压缩。')
      completed = true
      return turn
    } finally {
      turn.query.close()
      if (turn.process) turn.process.terminate()
      turn.release?.()
      turn.view.running = false
      if (turn.binding && turn.bindingStore) {
        turn.binding.state = completed ? 'idle' : turn.cancel.signal.aborted ? 'stopped' : 'failed'
        await turn.bindingStore.save(agent.id, turn.binding).catch(() => undefined)
      }
      if (turn.projectionRoot) await rm(turn.projectionRoot, { recursive: true, force: true }).catch(() => undefined)
      const owner = this.owner(agent)
      this.notifySessionAvailable(owner)
    }
  }

  private async cliStateFor(agent: Agent): Promise<ClaudeCliState> {
    const owner = this.owner(agent)
    const turn = owner.turn
    return { active: this.sessionOccupied(owner), queued: false, commands: turn?.commands ? [...turn.commands] : [...FALLBACK_COMMANDS], output: stripVTControlCharacters(turn?.cliOutput?.snapshot() ?? owner.cliOutput?.snapshot() ?? turn?.safe.snapshot() ?? ''), ...(turn?.view.nativeSessionId ? { sessionId: turn.view.nativeSessionId } : {}), ...(turn?.view.model ? { model: turn.view.model } : {}), ...(turn?.contextUsage ? { contextUsage: turn.contextUsage } : {}), ...(turn?.compact ? { lastCompact: turn.compact } : {}), ...(turn?.view.message ? { error: turn.view.message } : {}) }
  }

  private async executeCliInput(agent: Agent, input: string, selected?: ClaudeSelection, signal?: AbortSignal): Promise<ClaudeCliState> {
    const parsed = parseClaudeCommand(input)
    if (parsed.kind === 'prompt') {
      await this.runCliInput(agent, parsed.text, selected, { ...(signal ? { signal } : {}) })
      return this.cliStateFor(agent)
    }
    const owner = this.owner(agent)
    const turn = owner.turn
    const normalized = parsed.name === '/压缩' ? '/compact' : parsed.name === '/上下文' ? '/context' : parsed.name
    const appendNotice = async (message: string): Promise<ClaudeCliState> => {
      const output = owner.turn?.cliOutput ?? owner.cliOutput ?? owner.turn?.safe ?? (owner.cliOutput = new ClaudeSafeOutput([]))
      if (output) output.append(`${output.snapshot() ? '\n\n' : ''}${message}`)
      return this.cliStateFor(agent)
    }
    if (normalized === '/help') {
      const commands = turn?.commands ?? FALLBACK_COMMANDS
      return appendNotice(commands.map(command => `${command.name}${command.argumentHint ? ` ${command.argumentHint}` : ''}${command.description ? `  ${command.description}` : ''}`).join('\n'))
    }
    if (normalized === '/context') {
      const detail = parsed.args[0] === 'full' ? 'full' : 'summary'
      const state = await this.contextUsage(agent, detail)
      const usage = state.contextUsage
      const compactStatus = usage?.isAutoCompactEnabled === true ? '开启' : usage?.isAutoCompactEnabled === false ? '关闭' : 'SDK 未报告状态'
      return usage ? await appendNotice(`上下文：${usage.totalTokens.toLocaleString()} / ${usage.maxTokens.toLocaleString()} tokens（${usage.percentage.toFixed(1)}%）；自动压缩 ${compactStatus}。`) : state
    }
    if (normalized === '/autocompact') {
      const settings = await this.settingsGet()
      const context = turn?.contextUsage
      const status = context?.isAutoCompactEnabled === true ? '开启' : context?.isAutoCompactEnabled === false ? '关闭' : 'SDK 未报告状态'
      return appendNotice(`自动压缩窗口：${settings.autoCompactWindow ?? 'auto'}；${context ? `SDK 状态：${status}，阈值 ${context.autoCompactThreshold?.toLocaleString() ?? 'SDK 默认'} tokens。` : 'SDK 尚未提供本会话用量状态。'}`)
    }
    if (normalized === '/config') {
      const keys = new Set(['contextWindow', 'autoCompactWindow', 'promptCacheTtl', 'subagentPromptCacheTtl', 'permissionMode', 'outputStyle', 'renderer', 'prose', 'maxProcesses'])
      if (parsed.args.length === 0) {
        const view = await this.settingsGlobalGet()
        return appendNotice(view.settings.map(setting => {
          const effective = setting.effective
          return `${setting.key}: requested=${setting.value}${effective ? `; effective=${effective.effective}; source=${effective.source}${effective.reason ? `; ${effective.reason}` : ''}` : ''}`
        }).join('\n'))
      }
      if (parsed.args.length !== 2 || !keys.has(parsed.args[0]!)) throw new Error('用法：/config <contextWindow|autoCompactWindow|promptCacheTtl|subagentPromptCacheTtl|permissionMode|outputStyle|renderer|prose|maxProcesses> <value>。')
      const [key, value] = parsed.args
      const view = await this.settingsGlobalUpdate({ [key!]: value! })
      const setting = view.settings.find(item => item.key === key)
      if (!setting) throw new Error(`Claude 配置 ${key} 未返回。`)
      const effective = setting.effective
      return appendNotice(`${setting.key}: requested=${setting.value}${effective ? `; effective=${effective.effective}; source=${effective.source}${effective.reason ? `; ${effective.reason}` : ''}` : ''}`)
    }
    const supportedCommands = turn?.commands ?? FALLBACK_COMMANDS
    if (normalized === '/usage' && !commandSupported(supportedCommands, '/usage')) throw new Error('当前 Claude Agent SDK 未声明支持 /usage。')
    if (normalized === '/compact' && !commandSupported(supportedCommands, '/compact') && !commandSupported(supportedCommands, '/压缩')) {
      throw new Error('当前 Claude Agent SDK 未声明支持 /compact。')
    }
    if (!commandSupported(supportedCommands, parsed.name) && !commandSupported(supportedCommands, normalized)) {
      throw new Error(`Claude 当前不支持命令 ${parsed.name}。`)
    }
    await this.runCliInput(agent, [normalized, ...parsed.args].join(' '), selected, { requireCompactBoundary: normalized === '/compact', fetchUsage: normalized === '/usage', ...(signal ? { signal } : {}) })
    return this.cliStateFor(agent)
  }

  @Remote('contextUsage')
  async contextUsage(agent: Agent, detail?: 'summary' | 'full'): Promise<ClaudeCliState> {
    const usageDetail = detail ?? 'summary'
    const turn = this.owner(agent).turn
    if (!turn?.query) throw new Error('当前没有可读取上下文的 Claude 会话。')
    if (!turn.view.running) {
      if (usageDetail === 'summary' && turn.contextUsage) return this.cliStateFor(agent)
      if (usageDetail === 'full') {
        await this.runCliInput(agent, '/context', undefined, { fetchContext: 'full' })
        return this.cliStateFor(agent)
      }
      throw new Error('摘要用量将在会话恢复后更新。')
    }
    turn.contextUsage = contextUsageView(await turn.query.getContextUsage({ detail: usageDetail }), usageDetail)
    return this.cliStateFor(agent)
  }

  @Remote('cliSetModel')
  async cliSetModel(agent: Agent, model: string): Promise<ClaudeCliState> {
    if (typeof model !== 'string' || !/^[\w.:[\]-]{1,160}$/u.test(model)) throw new Error('Claude 模型标识无效。')
    const query = this.owner(agent).turn?.query
    if (!query) throw new Error('当前没有可更新模型的 Claude 会话。')
    await query.setModel(model)
    return this.cliStateFor(agent)
  }

  @Remote('cliSetPermissionMode')
  async cliSetPermissionMode(agent: Agent, mode: ClaudePermissionMode): Promise<ClaudeCliState> {
    if (!CLAUDE_PERMISSION_MODES.includes(mode)) throw new Error('Claude 权限模式无效。')
    const query = this.owner(agent).turn?.query
    if (!query) throw new Error('当前没有可更新权限的 Claude 会话。')
    await query.setPermissionMode(mode as Parameters<Query['setPermissionMode']>[0])
    return this.cliStateFor(agent)
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
      const saved = event && readClaudeTranscript(event)
      if (saved?.turn === turn && saved.step === step) return saved
    }
    return null
  }
  @Remote
  async stop(agent: Agent): Promise<void> {
    const owner = this.owner(agent)
    owner.preparing?.abort()
    const turn = owner.turn
    turn?.cancel.abort()
    turn?.process?.terminate()
  }
  @Remote
  clear(agent: Agent): void {
    const owner = this.owner(agent)
    if (this.sessionOccupied(owner)) throw new Error('请先停止当前 Claude Code 任务。')
    owner.history = []
    delete owner.turn
  }
}

/** DSH external provider that delegates one-shot work to the managed CLI. */
class ClaudeCodeSubagentProvider implements SubagentProvider {
  readonly name = 'claude-code'
  readonly capabilities = { ...NO_START_CAPABILITIES, agentOptions: true }
  readonly inheritsParentContext = false
  constructor(private readonly startRun: (request: ResolvedSubagentStartRequest) => Promise<SubagentRun>) {}
  start(request: ResolvedSubagentStartRequest): Promise<SubagentRun> {
    return this.startRun(request)
  }
}

export interface ClaudeRuntimeConfig { runtimeRoot?: string; version?: string; registry?: string; autoInstall?: boolean }
export const Config = schema.object({ runtimeRoot: schema.string(), version: schema.string().default('2.1.309'), registry: schema.string().default('https://registry.npmmirror.com'), autoInstall: schema.boolean().default(true) })
export function apply(ctx: Context, config: ClaudeRuntimeConfig = {}): void {
  ctx.plugin(ClaudeCodeService, config)
}
export default { name, inject, Config, apply }
