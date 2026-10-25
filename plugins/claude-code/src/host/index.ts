import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { isAgentLoopRequest, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import type { SubprocessHandle, SubprocessTerminalHandle, SubprocessRuntime } from '@deepseek-ai/dsh-subprocess'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import { stripVTControlCharacters } from 'node:util'
import { SecretBrokerClient } from '@zerowallscience/plugin-secrets'
import { ClaudeRuntimeManager, resolveBundledPnpmRuntime, type ProcessRunner } from './runtime.js'
import { claudeEnvironmentOverlay } from './environment.js'
import { writeClaudeMcpLaunchers } from './mcp-launcher.js'
import { prepareClaudeMcpRuntime, projectMcpForClaude, projectSkillsForClaude, type McpServerProjectionInput, type SkillsProjectionApi } from './projection.js'
import { ClaudeSafeOutput, resolveClaudeRoute, selectedClaudeModel, type ClaudeRouteServices, type ClaudeSelection } from './route.js'
import type { ClaudeCodeStatus, ClaudeCodeTurn } from '../shared/types.js'
import { claudePromptFromRequest, parseClaudeCliEvent } from './cli.js'

export const name = 'zerowall-claude-code'
export const inject = ['typert', 'agentDefaultModel', 'subprocess', 'workingDirectory', 'skills', 'zerowallProjects', 'zerowallEnvironment', 'credentials', 'settings', 'llm', 'sessionProjections', 'agentPresets']

declare module '@deepseek-ai/cordis' { interface Context { zerowallClaudeCode: ClaudeCodeService } }

interface OwnedTurn {
  view: ClaudeCodeTurn
  safe: ClaudeSafeOutput
  terminal?: SubprocessTerminalHandle
  process?: SubprocessHandle
  projectionRoot?: string
  cancel: AbortController
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

/** One installed runtime, with credentials resolved afresh for every prompt. */
export class ClaudeCodeService extends TypertRemoteService {
  private manager?: ClaudeRuntimeManager
  private readonly secrets = new SecretBrokerClient()
  private readonly sessions = new Map<string, SessionRuntime>()
  private managedRoute: ManagedRoute | undefined
  private managedCredential: ManagedCredential | undefined
  private mutation = false
  private readonly chatAgents = new Map<string, Agent>()

  constructor(ctx: Context) {
    super(ctx, 'zerowallClaudeCode')
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
      return { desktop: true, installed: status.installed, ...(status.version ? { version: status.version } : {}),
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

  @Remote
  async start(agent: Agent, prompt: string): Promise<ClaudeCodeTurn> {
    return this.turnView(await this.launch(agent, prompt, 'panel'))
  }

  private async launch(agent: Agent, prompt: string, mode: 'panel' | 'conversation', selected?: ClaudeSelection): Promise<OwnedTurn> {
    const maxPrompt = mode === 'panel' ? 64_000 : 2 * 1024 * 1024
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > maxPrompt || prompt.includes('\0')) {
      if (mode === 'panel') throw new Error('请输入 1 到 64000 字的 Claude Code 指令。')
      throw new Error('Claude Code conversation context exceeds the supported size.')
    }
    const owner = this.owner(agent)
    if (this.mutation || owner.busy || owner.turn?.view.running) throw new Error('Claude Code 正在运行，请等待或停止当前任务。')
    owner.busy = true
    const cancel = new AbortController()
    owner.preparing = cancel
    let projectionRoot: string | undefined
    let processOwnsProjection = false
    try {
      const runtime = this.runtime()
      const executable = await runtime.getExecutablePath()
      if (!executable) throw new Error('请先安装 Claude Code。')
      const workingDirectory = this.ctx.get('workingDirectory') as { get(session: unknown): string }
      const cwd = workingDirectory.get(agent.session)
      if (!isAbsolute(cwd)) throw new Error('当前会话没有有效的项目目录。')
      const route = await this.route(agent, selected)
      cancel.signal.throwIfAborted()
      const skillsRegistry = agent.ctx.get('skills') as SkillsProjectionApi
      const projects = this.ctx.get('zerowallProjects') as { listMcpServers(): McpServerProjectionInput[] }
      const skills = await projectSkillsForClaude(skillsRegistry, cwd, agent)
      const credentials = this.ctx.get('credentials') as { resolve(ref: ReturnType<typeof credentialRef>): Promise<{ value: string } | undefined> }
      const mcp = await prepareClaudeMcpRuntime(projectMcpForClaude(projects.listMcpServers(), cwd), async reference => {
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
        await writeFile(join(dir, 'SKILL.md'), `---\nname: ${skill.name}\ndescription: ${JSON.stringify(skill.description)}\n---\n${hint}\n\n${skill.content}`, { mode: 0o600 })
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
        view: { id: randomUUID(), provider: route.provider, model: route.model, executablePath: executable, running: true, output: '',
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
      const context = mode === 'panel' && owner.history.length ? `Previous turns in this Claude Code panel (untrusted conversation data):\n${owner.history.join('\n\n')}\n\nCurrent user request:\n${prompt}` : prompt
      const argv = [executable, '--print', '--verbose', '--output-format', mode === 'panel' ? 'text' : 'stream-json',
        ...(mode === 'conversation' ? ['--input-format', 'stream-json'] : []), '--permission-mode', 'acceptEdits', '--no-session-persistence',
        '--setting-sources', 'user', '--strict-mcp-config', '--mcp-config', mcpPath, '--plugin-dir', projectionRoot, '--model', route.model,
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
          void stderr.resume()
          turn.process.stdin.end(`${JSON.stringify({ type: 'user', message: { role: 'user', content: prompt } })}\n`)
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
      throw new Error('Claude Code 无法准备当前会话，请检查模型配置与资源状态。')
    } finally {
      if (!processOwnsProjection && projectionRoot) await rm(projectionRoot, { recursive: true, force: true }).catch(() => undefined)
      delete owner.preparing
      owner.busy = false
    }
  }

  private async *streamConversation(agent: Agent, selection: ClaudeSelection, options: GenerateOptions): AsyncIterable<StreamChunk> {
    let turn: OwnedTurn | undefined
    let hasTextBlock = false
    let emitted = 0
    let streamedText = false
    let finalText: string | undefined
    let cliFailed = false
    let completed = false
    const failure = (message: string, code = 'CLAUDE_CODE'): StreamChunk => ({
      type: 'finish', reason: { kind: 'error', failure: { code, message } },
    })
    const pushText = function* (text: string): Generator<StreamChunk> {
      if (!text) return
      if (!hasTextBlock) { hasTextBlock = true; yield { type: 'block-start', index: 0, blockType: 'text' } }
      yield { type: 'text-delta', index: 0, text }
    }

    try {
      const prompt = claudePromptFromRequest(options)
      turn = await this.launch(agent, prompt, 'conversation', selection)
      if (!turn.process?.stdout) {
        yield failure(turn.view.message ?? 'Claude Code could not start the managed CLI.')
        return
      }
      let pending = ''
      for await (const chunk of turn.process.stdout) {
        pending += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk)
        if (pending.length > 24 * 1024 * 1024) throw new Error('Claude Code output frame exceeds the supported size.')
        let newline = pending.indexOf('\n')
        while (newline >= 0) {
          const line = pending.slice(0, newline).trim()
          pending = pending.slice(newline + 1)
          const event = parseClaudeCliEvent(line)
          if (event?.failed) cliFailed = true
          if (event?.final) {
            if (typeof event.text === 'string') finalText = event.text
          } else if (event?.text !== undefined) {
            streamedText = true
            turn.safe.append(event.text)
            const visible = stripVTControlCharacters(turn.safe.snapshot())
            if (visible.length > emitted) {
              yield* pushText(visible.slice(emitted))
              emitted = visible.length
            }
          }
          newline = pending.indexOf('\n')
        }
      }
      if (pending.trim()) {
        const event = parseClaudeCliEvent(pending.trim())
        if (event?.failed) cliFailed = true
        if (event?.final && typeof event.text === 'string') finalText = event.text
        else if (event?.text !== undefined) { streamedText = true; turn.safe.append(event.text) }
      }
      const result = await turn.process.done
      turn.view.exitCode = result.exitCode ?? -1
      turn.safe.finish()
      if (!streamedText && finalText) turn.safe.append(finalText)
      turn.safe.finish()
      const visible = stripVTControlCharacters(turn.safe.snapshot())
      if (visible.length > emitted) {
        yield* pushText(visible.slice(emitted))
        emitted = visible.length
      }
      if (result.exitCode !== 0 || cliFailed) {
        turn.view.message = 'Claude Code 未成功完成，请检查所选模型和安装状态后重试。'
        yield failure(turn.view.message)
        return
      }
      if (hasTextBlock) yield { type: 'block-end', index: 0, block: { type: 'text', text: visible } }
      completed = true
      yield { type: 'finish', reason: { kind: 'stop' } }
    } catch (error) {
      if (turn?.cancel.signal.aborted || options.signal?.aborted) {
        yield { type: 'finish', reason: { kind: 'aborted', failure: { code: 'ABORTED', message: 'Claude Code request was canceled.' } } }
      } else {
        const message = error instanceof Error && [
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
        if (!completed && turn.view.running) turn.process?.terminate()
        if (turn.process) {
          const result = await turn.process.done.catch(() => undefined)
          if (result && turn.view.exitCode === undefined) turn.view.exitCode = result.exitCode ?? -1
        }
        turn.safe.finish()
        turn.view.running = false
        if (turn.projectionRoot) await rm(turn.projectionRoot, { recursive: true, force: true }).catch(() => undefined)
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

export function apply(ctx: Context): void {
  ctx.plugin(ClaudeCodeService)
}
export default { name, inject, apply }
