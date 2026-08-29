import type { Context } from '@deepseek-ai/cordis'
import type { AttachmentStore, ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import {
  ToolCallId,
  createUserMessage,
  LlmAdapter,
  LlmError,
  type GenerateOptions,
  type LlmModelInfo,
  type LlmResolvedModelInfo,
  type StreamChunk,
} from '@deepseek-ai/dsh-llm'

export const name = 'llm-opencode'
export const inject = ['llm', 'attachments']
export const PROVIDER = 'opencode-zen'
export const PUBLIC_BASE_URL = 'https://opencode.ai/zen/v1'

export interface OpenCodeCatalogModel {
  id: string
  name: string
  description?: string
  contextWindow?: number
  maxTokens?: number
}

export const DEFAULT_MODELS: OpenCodeCatalogModel[] = [
  { id: 'big-pickle', name: 'Big Pickle (Free)', description: 'OpenCode Zen free model', contextWindow: 1_000_000, maxTokens: 128_000 },
  { id: 'x-preview-free', name: 'X Preview Free', description: 'OpenCode Zen free model', contextWindow: 200_000, maxTokens: 128_000 },
]

const DEFAULT_CONTEXT_WINDOW = 1_000_000
const DEFAULT_MAX_TOKENS = 128_000

function textOf(content: readonly { type: string; text?: string }[]): string {
  return content.filter(block => block.type === 'text').map(block => block.text ?? '').join('')
}

async function userContent(
  content: GenerateOptions['messages'][number]['content'],
  attachments: AttachmentStore | undefined,
  signal?: AbortSignal,
): Promise<string | Array<Record<string, unknown>>> {
  if (!content.some(block => block.type === 'image')) return textOf(content)
  if (attachments === undefined) throw new LlmError('OpenCode image input requires the durable attachment service.', 'UNSUPPORTED_CONTENT')
  const result: Array<Record<string, unknown>> = []
  for (const block of content) {
    if (block.type === 'text') {
      if (block.text !== '') result.push({ type: 'text', text: block.text })
      continue
    }
    if (block.type !== 'image') continue
    const stored = await attachments.readImage(block.attachment as ImageAttachmentRef, signal)
    result.push({
      type: 'image_url',
      image_url: { url: `data:${stored.ref.mediaType};base64,${Buffer.from(stored.data).toString('base64')}` },
    })
  }
  return result
}

async function serializeMessages(
  messages: GenerateOptions['messages'],
  attachments: AttachmentStore | undefined,
  signal?: AbortSignal,
): Promise<Array<Record<string, unknown>>> {
  const result: Array<Record<string, unknown>> = []
  for (const message of messages) {
    if (message.role === 'assistant') {
      const toolCalls = message.content.filter(block => block.type === 'tool-call').map(block => ({
        id: block.id,
        type: 'function',
        function: { name: block.name, arguments: block.arguments },
      }))
      result.push({ role: 'assistant', content: textOf(message.content), ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}) })
      continue
    }
    const toolResults = message.content.filter(block => block.type === 'tool-result')
    const content = await userContent(message.content, attachments, signal)
    if (toolResults.length === 0 || (typeof content === 'string' ? content.length > 0 : content.length > 0)) result.push({ role: message.role, content })
    for (const block of toolResults) result.push({ role: 'tool', tool_call_id: block.toolCallId, content: textOf(block.content) || '(no output)' })
  }
  return result
}

async function serializeRequest(options: GenerateOptions, attachments?: AttachmentStore): Promise<Record<string, unknown>> {
  const messages: Array<Record<string, unknown>> = []
  if (options.system !== undefined) messages.push({ role: 'system', content: options.system })
  messages.push(...await serializeMessages(options.messages, attachments, options.signal))
  const tools = options.tools?.map(tool => ({ type: 'function', function: tool }))
  return {
    model: options.model,
    messages,
    stream: true,
    stream_options: { include_usage: true },
    ...(tools !== undefined && tools.length > 0 ? { tools } : {}),
    ...(tools !== undefined && tools.length > 0 ? { tool_choice: 'auto' } : {}),
    ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
    ...(options.maxTokens === undefined ? {} : { max_tokens: options.maxTokens }),
    ...(options.stop === undefined ? {} : { stop: options.stop }),
  }
}

function finishReason(value: string | undefined) {
  if (value === 'tool_calls') return { kind: 'tool-calls' as const }
  if (value === 'length') return { kind: 'max-tokens' as const }
  if (value === 'stop' || value === undefined) return { kind: 'stop' as const }
  return { kind: 'error' as const, failure: { message: `model stopped: ${value}`, code: value.toUpperCase() } }
}

async function* parseSse(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let sawDone = false
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      buffer += decoder.decode(chunk.value, { stream: true })
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (data.length === 0) continue
        yield data
        if (data === '[DONE]') { sawDone = true; return }
      }
    }
    buffer += decoder.decode()
    for (const line of buffer.split(/\r?\n/)) if (line.startsWith('data:')) yield line.slice(5).trim()
  } finally { reader.releaseLock() }
  if (!sawDone) throw new LlmError('OpenCode SSE stream ended without [DONE].', 'STREAM_CLOSED')
}

async function* translate(body: ReadableStream<Uint8Array>): AsyncIterable<StreamChunk> {
  let textIndex: number | undefined
  let nextIndex = 0
  let text = ''
  const toolBlocks = new Map<number, { index: number; id: string; name?: string; arguments: string }>()
  let finish: ReturnType<typeof finishReason> | undefined
  let usage: { inputTokens: number; outputTokens: number } | undefined
  for await (const payload of parseSse(body)) {
    if (payload === '[DONE]') {
      if (textIndex !== undefined) yield { type: 'block-end', index: textIndex, block: { type: 'text', text } }
      for (const block of toolBlocks.values()) {
        yield {
          type: 'block-end',
          index: block.index,
          block: {
            type: 'tool-call',
            id: ToolCallId(block.id),
            name: block.name ?? '',
            arguments: block.arguments,
          },
        }
      }
      if (usage !== undefined) yield { type: 'usage', usage }
      yield { type: 'finish', reason: finish ?? finishReason(undefined) }
      return
    }
    let chunk: any
    try { chunk = JSON.parse(payload) } catch { throw new LlmError('Malformed OpenCode SSE payload.', 'MALFORMED_RESPONSE') }
    const delta = chunk.choices?.[0]?.delta
    if (typeof delta?.content === 'string' && delta.content.length > 0) {
      if (textIndex === undefined) { textIndex = nextIndex++; yield { type: 'block-start', index: textIndex, blockType: 'text' } }
      text += delta.content
      yield { type: 'text-delta', index: textIndex, text: delta.content }
    }
    for (const call of delta?.tool_calls ?? []) {
      const wireIndex = Number.isInteger(call?.index) ? call.index : 0
      let block = toolBlocks.get(wireIndex)
      if (block === undefined) {
        block = {
          index: nextIndex++,
          id: typeof call?.id === 'string' && call.id.length > 0 ? call.id : `opencode-call-${wireIndex}`,
          arguments: '',
        }
        toolBlocks.set(wireIndex, block)
        yield { type: 'block-start', index: block.index, blockType: 'tool-call' }
      }
      if (typeof call?.id === 'string' && call.id.length > 0) block.id = call.id
      if (typeof call?.function?.name === 'string' && call.function.name.length > 0) block.name = call.function.name
      const fragment = typeof call?.function?.arguments === 'string' ? call.function.arguments : ''
      block.arguments += fragment
      yield {
        type: 'tool-call-delta',
        index: block.index,
        id: ToolCallId(block.id),
        ...(block.name === undefined ? {} : { name: block.name }),
        argumentsDelta: fragment,
      }
    }
    if (typeof chunk.choices?.[0]?.finish_reason === 'string') finish = finishReason(chunk.choices[0].finish_reason)
    const wireUsage = chunk.usage
    if (wireUsage !== undefined) usage = { inputTokens: Math.max(0, Number(wireUsage.prompt_tokens ?? 0)), outputTokens: Math.max(0, Number(wireUsage.completion_tokens ?? 0)) }
  }
}

export class OpenCodeAdapter extends LlmAdapter {
  constructor(
    private readonly options: () => { baseURL: string; models: readonly OpenCodeCatalogModel[]; maxTokens: number; defaultContextWindow: number; apiKey: string | undefined },
    private readonly attachments?: AttachmentStore,
  ) { super() }
  providerInfo(provider: string) { return { id: provider, name: 'OpenCode Zen' } }
  listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    return Promise.resolve(this.options().models.map(model => ({ provider, id: model.id, name: model.name, ...(model.description === undefined ? {} : { description: model.description }) })))
  }
  resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    const config = this.options(); const found = config.models.find(item => item.id === model)
    return Promise.resolve({ provider, id: model, name: found?.name ?? model, ...(found?.description === undefined ? {} : { description: found.description }), context: { contextWindow: found?.contextWindow ?? config.defaultContextWindow }, defaultMaxTokens: found?.maxTokens ?? config.maxTokens })
  }
  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const config = this.options()
    const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'text/event-stream', 'User-Agent': 'opencode/1.0.0', 'HTTP-Referer': 'https://opencode.ai/', 'X-Title': 'opencode', 'X-Source': 'opencode' }
    if (config.apiKey !== undefined && config.apiKey.trim() !== '') headers.authorization = `Bearer ${config.apiKey.trim()}`
    let response: Response
    try { response = await fetch(`${config.baseURL.replace(/\/+$/u, '')}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(await serializeRequest(options, this.attachments)), ...(options.signal === undefined ? {} : { signal: options.signal }) }) }
    catch (error) { if (options.signal?.aborted) throw new LlmError('OpenCode request aborted by caller.', 'ABORTED', { cause: error }); throw new LlmError('OpenCode request failed.', 'TRANSPORT', { cause: error }) }
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).replace(/\s+/gu, ' ').trim().slice(0, 500)
      throw new LlmError(`OpenCode API error (HTTP ${response.status})${detail === '' ? '.' : `: ${detail}`}`, response.status === 401 || response.status === 403 ? 'AUTH' : response.status === 429 ? 'RATE_LIMIT' : `HTTP_${response.status}`, { status: response.status })
    }
    if (!response.body) throw new LlmError('OpenCode API returned no response body.', 'EMPTY_RESPONSE')
    yield* translate(response.body)
  }

  override async probeVision(provider: string, model: string, signal?: AbortSignal) {
    if (this.attachments === undefined) return { status: 'unknown' as const }
    const image = await this.attachments.saveImage({
      mediaType: 'image/png',
      name: 'zerowall-vision-probe.png',
      data: Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')),
    })
    try {
      for await (const chunk of this.stream({
        provider,
        model,
        maxTokens: 4,
        messages: [createUserMessage({ content: [
          { type: 'text', text: 'Describe the image in one word.' },
          { type: 'image', attachment: image },
        ], source: { kind: 'user' } })],
        ...(signal === undefined ? {} : { signal }),
      })) {
        if (chunk.type !== 'finish') continue
        if (chunk.reason.kind !== 'error' && chunk.reason.kind !== 'aborted') return { status: 'supported' as const, protocol: 'openai-completions' }
        const message = chunk.reason.kind === 'error' ? chunk.reason.failure.message : 'request aborted'
        return { status: explicitlyRejectsVision(message) ? 'unsupported' as const : 'unknown' as const, protocol: 'openai-completions', message }
      }
      return { status: 'unknown' as const, protocol: 'openai-completions', message: 'model did not finish' }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      return { status: explicitlyRejectsVision(message) ? 'unsupported' as const : 'unknown' as const, protocol: 'openai-completions', message }
    }
  }
}

function explicitlyRejectsVision(message: string): boolean {
  return /(?:image|vision|multimodal).{0,80}(?:not supported|unsupported|not allowed|text.?only)|(?:not supported|unsupported).{0,80}(?:image|vision|multimodal)/iu.test(message)
}

async function syncModels(baseURL: string, current: readonly OpenCodeCatalogModel[], logger: Context['logger']): Promise<OpenCodeCatalogModel[]> {
  try {
    const response = await fetch(`${baseURL}/models`, { headers: { accept: 'application/json', 'User-Agent': 'opencode/1.0.0' }, signal: AbortSignal.timeout(15_000) })
    if (!response.ok) return [...current]
    const body = await response.json() as { data?: Array<{ id?: string; name?: string }> }
    const ids = (body.data ?? []).map(item => item.id).filter((id): id is string => typeof id === 'string' && id.length > 0 && isFreeModel(id))
    if (ids.length === 0) return [...current]
    const known = new Map(current.map(model => [model.id, model]))
    return ids.map(id => known.get(id) ?? { id, name: id, contextWindow: DEFAULT_CONTEXT_WINDOW, maxTokens: DEFAULT_MAX_TOKENS })
  } catch (error) { logger.warn('llm-opencode: automatic model sync failed; keeping the built-in catalog'); logger.warn(error); return [...current] }
}

function isFreeModel(id: string): boolean {
  return id === 'big-pickle' || /(?:^|[-_])free(?:$|[-_])/iu.test(id)
}

export function apply(ctx: Context): void {
  let models: OpenCodeCatalogModel[] = [...DEFAULT_MODELS]
  const options = () => ({ baseURL: PUBLIC_BASE_URL, models, maxTokens: DEFAULT_MAX_TOKENS, defaultContextWindow: DEFAULT_CONTEXT_WINDOW, apiKey: process.env.OPENCODE_API_KEY })
  const adapter = new OpenCodeAdapter(options, ctx.attachments)
  ctx.llm.registerAdapter([PROVIDER], adapter)
  void syncModels(PUBLIC_BASE_URL, models, ctx.logger).then(next => { if (next.length === 0) return; models = next; ctx.emit('llm/adapters-updated') })
}

export default { name, inject, apply }
