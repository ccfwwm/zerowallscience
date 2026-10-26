import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { createSdkMcpServer, query, type CanUseTool, type Options, type Query, type SDKUserMessage, type SpawnedProcess } from '@anthropic-ai/claude-agent-sdk'
import { CallToolRequestSchema, ListToolsRequestSchema, type CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createToolResultMessage, ToolCallId, type ContentBlock, type GenerateOptions, type ToolSchema } from '@deepseek-ai/dsh-llm'
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment'
import type { ToolRuntime } from '@deepseek-ai/dsh-tools'
import type { SubprocessHandle, SubprocessRuntime } from '@deepseek-ai/dsh-subprocess'
import type { ApprovalService } from '@deepseek-ai/dsh-user-approval'
import { claudeEnvironmentOverlay } from './environment.js'
import { blockText, claudePromptFromRequest } from './cli.js'
import { inputKey, type ClaudeSessionBinding } from './session-binding.js'
import { appendClaudeToolCall } from './tool-journal.js'

/** Preserve exact JSON schemas, rather than approximating them with permissive Zod objects. */
export function createHostToolBridge(agent: Agent, schemas: readonly ToolSchema[], signal: AbortSignal, source: { provider: string; model: string },
  state: { concluded: boolean; delivered?: (keys: string[]) => Promise<void>; drain?: () => Promise<unknown> } = { concluded: false }) {
  const server = createSdkMcpServer({ name: 'zerowall', version: '1.0.0', instructions: 'These tools execute through the current ZeroWall Host. Image tools are mcp__zerowall__generate_image and mcp__zerowall__edit_image when listed. Preserve the configured image model and parameters.' })
  server.instance.server.registerCapabilities({ tools: {} })
  const names = new Set(schemas.map(schema => schema.name))
  server.instance.server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: schemas.map(schema => ({
    name: schema.name, description: schema.description, inputSchema: schema.parameters as { type: 'object' },
  })) }))
  // The SDK may dispatch tools concurrently. Serialize bridge calls so Host
  // exclusive tools cannot overlap mutations or bypass a concluding result.
  let queue: Promise<unknown> = Promise.resolve()
  state.drain = () => queue
  server.instance.server.setRequestHandler(CallToolRequestSchema, async (request, extra): Promise<CallToolResult> => {
    const previous = queue
    let release!: () => void
    queue = new Promise<void>(resolve => { release = resolve })
    await previous
    try {
    signal.throwIfAborted(); extra.signal.throwIfAborted()
    if (state.concluded) return { content: [{ type: 'text', text: 'The Host concluded this turn; no further operation was executed.' }], isError: true }
    if (!names.has(request.params.name)) throw new Error('Tool is not visible in this conversation.')
    const callId = ToolCallId(`claude-host-${randomUUID()}`)
    const lifetime = AbortSignal.any([signal, extra.signal])
    const tools = agent.ctx.get('tools') as ToolRuntime
    const cursor = agent.session.snapshotEvents().reduce((value, event) => event.type === 'step/start' ? event.data : value, { turn: 0, step: 0 })
    if (cursor.turn && cursor.step) {
      await appendClaudeToolCall(agent, { callId, name: request.params.name, arguments: JSON.stringify(request.params.arguments ?? {}) }, source)
    }
    // Approval surfaces resolve the tool arguments through this durable call
    // event, so it must exist before dispatch reaches the Host policy pipeline.
    const result = await tools.execute({ name: request.params.name, arguments: request.params.arguments ?? {}, agent, callId, signal: lifetime })
    if (result.concludesTurn) state.concluded = true
    // Use the canonical presentation result, preserving image/file attachment refs in DSH.
    if (cursor.turn && cursor.step) {
      await agent.session.append('tool/result', { ...cursor, message: createToolResultMessage({ callId, content: result.content, isError: result.isError }) }, { surfaceOp: 'append' })
      for (const context of result.additionalContexts ?? []) await agent.session.append('user/message', context, { surfaceOp: 'append' })
    }
    const content = await mcpContent(agent, result.content, lifetime)
    for (const context of result.additionalContexts ?? []) content.push(...await mcpContent(agent, context.content, lifetime))
    await state.delivered?.((result.additionalContexts ?? []).map(inputKey))
    return { content, isError: result.isError }
    } finally { release() }
  })
  return server
}

/** Resumed turns also receive current DSH system-message updates. */
export function sdkSystemPrompt(request: GenerateOptions): string {
  return [request.system, ...request.messages.filter(message => message.role === 'system')
    .map(message => message.content.map(block => blockText(block as unknown as Record<string, unknown>)).filter(Boolean).join('\n'))]
    .filter(Boolean).join('\n\n')
}

/** Keep an explicit output cap; never silently discard unsupported sampling controls. */
export function sdkGenerationEnvironment(request: GenerateOptions): NodeJS.ProcessEnv {
  const unsupported = [request.temperature === undefined ? '' : 'temperature', request.stop?.length ? 'stop' : ''].filter(Boolean)
  if (unsupported.length) throw new Error(`当前 Claude Agent SDK 不支持 ${unsupported.join('、')}；原配置已保留，请使用标准模式执行这些参数。`)
  if (request.maxTokens === undefined) return {}
  if (!Number.isSafeInteger(request.maxTokens) || request.maxTokens <= 0) throw new Error('Claude 输出上限必须是正整数。')
  return { CLAUDE_CODE_MAX_OUTPUT_TOKENS: String(request.maxTokens) }
}

/** The Host owns approval UI and audit; bridge execution owns its own policy checks. */
export function hostToolApproval(agent: Agent, approval: Pick<ApprovalService, 'request'>, signal: AbortSignal,
  recordCall: (id: string, name: string, input: Record<string, unknown>) => Promise<void>): CanUseTool {
  return async (name, input, request) => {
    // The bridge dispatch below traverses tools.execute (and its real policy /
    // approval pipeline), avoiding a second unrelated native approval dialog.
    if (name.startsWith('mcp__zerowall__')) return { behavior: 'allow', updatedInput: input }
    await recordCall(request.toolUseID, name, input)
    const outcome = await approval.request({ agent, toolName: name, callId: ToolCallId(request.toolUseID),
      reason: request.title ?? request.decisionReason ?? `Claude 请求执行 ${name}`, signal: AbortSignal.any([signal, request.signal]) })
    return outcome === 'allowed-once' ? { behavior: 'allow', updatedInput: input }
      : { behavior: 'deny', message: outcome === 'unavailable' ? 'Host 审批窗口不可用，该操作未执行。' : 'Host 未授权该操作。', interrupt: outcome === 'cancelled' }
  }
}

/** Own the full process tree through DSH, including SDK cancellation and stderr. */
export function managedSdkSpawner(subprocess: SubprocessRuntime, onSpawn: (handle: SubprocessHandle) => void, stderr: (text: string) => void, ownerSignal?: AbortSignal): NonNullable<Options['spawnClaudeCodeProcess']> {
  return options => {
    const argv = [options.command, ...options.args]
    const env = { ...options.env }
    // Native application-managed executables need no node wrapper.
    if (process.versions.electron && /\.[cm]?js$/u.test(options.args[0] ?? '')) env.ELECTRON_RUN_AS_NODE = '1'
    const handle = subprocess.spawn({ argv, cwd: options.cwd ?? process.cwd(), env: claudeEnvironmentOverlay(env),
      signal: ownerSignal ? AbortSignal.any([options.signal, ownerSignal]) : options.signal, graceMs: 1000, stdio: { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' } })
    onSpawn(handle)
    if (!handle.stdin || !handle.stdout || !handle.stderr) { handle.terminate(); throw new Error('Claude SDK process streams are unavailable.') }
    handle.stderr.setEncoding('utf8')
    handle.stderr.on('data', stderr)
    const events = new EventEmitter()
    let killed = false, exitCode: number | null = null, signalCode: NodeJS.Signals | null = null
    void handle.done.then(outcome => { exitCode = outcome.exitCode; signalCode = outcome.signal; events.emit('exit', exitCode, signalCode) }, error => { events.emit('error', error) })
    Object.assign(events, { stdin: handle.stdin, stdout: handle.stdout,
      kill: () => { killed = true; handle.terminate(); return true },
    })
    Object.defineProperties(events, { killed: { get: () => killed }, exitCode: { get: () => exitCode }, signalCode: { get: () => signalCode } })
    return events as unknown as SpawnedProcess
  }
}

async function imageContent(agent: Agent, blocks: readonly ContentBlock[], signal: AbortSignal): Promise<SDKUserMessage['message']['content']> {
  const content: Exclude<SDKUserMessage['message']['content'], string> = []
  for (const block of blocks) {
    if (block.type === 'image' && !block.offloaded) {
      const stored = await (agent.ctx.get('attachments') as AttachmentStore).readImage(block.attachment, signal)
      content.push({ type: 'image', source: { type: 'base64', data: Buffer.from(stored.data).toString('base64'), media_type: stored.ref.mediaType } })
    } else if (block.type === 'file' || block.type === 'image') {
      const store = agent.ctx.get('attachments') as AttachmentStore
      const path = block.type === 'file' ? store.fileHostPath(block.attachment) : store.imageHostPath(block.attachment)
      content.push({ type: 'text', text: `${blockText(block as unknown as Record<string, unknown>)}${path ? `\nRead-only stored attachment path: ${path}` : ''}` })
    } else {
      const text = blockText(block as unknown as Record<string, unknown>)
      if (text) content.push({ type: 'text', text })
    }
  }
  return content
}

async function mcpContent(agent: Agent, blocks: readonly ContentBlock[], signal: AbortSignal): Promise<CallToolResult['content']> {
  const content: CallToolResult['content'] = []
  for (const block of blocks) {
    if (block.type === 'image') {
      const stored = await (agent.ctx.get('attachments') as AttachmentStore).readImage(block.attachment, signal)
      content.push({ type: 'image', data: Buffer.from(stored.data).toString('base64'), mimeType: stored.ref.mediaType })
    } else content.push({ type: 'text', text: block.type === 'text' ? block.text : blockText(block as unknown as Record<string, unknown>) })
  }
  return content
}

export async function sdkInput(agent: Agent, request: GenerateOptions, binding: ClaudeSessionBinding, signal: AbortSignal) {
  const users = request.messages.filter(message => message.role === 'user')
  const fresh = users.filter(message => !binding.submitted.includes(inputKey(message)))
  const content: Exclude<SDKUserMessage['message']['content'], string> = []
  if (!binding.initialized) {
    content.push({ type: 'text', text: claudePromptFromRequest(request) })
    // Preserve referenced historical attachments as well as current ones at migration.
    for (const message of users) content.push(...await imageContent(agent, message.content.filter(block => block.type === 'image' || block.type === 'file'), signal) as typeof content)
  } else if (fresh.length) {
    for (const message of fresh) content.push(...await imageContent(agent, message.content, signal) as typeof content)
  } else content.push({ type: 'text', text: 'Continue the interrupted request in this native session. Inspect existing results first; do not replay completed tool operations.' })
  if (content.reduce((size, block) => size + (block.type === 'text' ? block.text.length : 0), 0) > 2 * 1024 * 1024) throw new Error('Claude Code conversation input exceeds the supported size.')
  return { content, submitted: [...new Set([...binding.submitted, ...users.map(inputKey)])] }
}

export function startSdkQuery(options: Options, content: SDKUserMessage['message']['content'], uuid?: string): Query {
  async function* input(): AsyncGenerator<SDKUserMessage> {
    yield { type: 'user', session_id: '', parent_tool_use_id: null, ...(uuid ? { uuid: uuid as NonNullable<SDKUserMessage['uuid']> } : {}), message: { role: 'user', content } }
  }
  return query({ prompt: input(), options })
}

export type { CanUseTool, Query, Options }
