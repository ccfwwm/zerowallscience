import type { AttachmentStore } from '@deepseek-ai/dsh-attachment'
import {
  createUserMessage, LlmAdapter, type GenerateOptions, type LlmModelInfo,
  type LlmProbeAttempt, type LlmResolvedModelInfo, type LlmVisionProbeResult, type StreamChunk,
} from '@deepseek-ai/dsh-llm'
import { createProvider, type Api, type Model } from '@earendil-works/pi-ai'
import * as openaiCompletions from '@earendil-works/pi-ai/api/openai-completions'
import type { ModelCatalog, OpenCodeCatalogModel } from './catalog.ts'
import { ZEN_BASE_URL } from './catalog.ts'
import { toStreamChunks } from './events.ts'
import { deriveRequestIds, disguiseHeaders } from './ids.ts'
import { toPiContext } from './messages.ts'

export const PROVIDER_ID = 'opencode2dsh'
const ANONYMOUS_KEY = 'public'

function piModel(model: OpenCodeCatalogModel): Model<Api> {
  return {
    id: model.id, name: model.name, provider: PROVIDER_ID, api: 'openai-completions',
    baseUrl: `${ZEN_BASE_URL}/v1`, reasoning: false,
    input: model.supportsImages ? ['text', 'image'] : ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: model.contextWindow, maxTokens: model.maxTokens,
  }
}

function safeProbeMessage(value: unknown): string {
  const message = value instanceof Error ? value.message : String(value)
  return message
    .replace(/Bearer\s+[^\s,;]+/giu, 'Bearer [redacted]')
    .replace(/(api[_ -]?key|token|secret)\s*[:=]\s*[^\s,;]+/giu, '$1=[redacted]')
    .slice(0, 240)
}

function rejectsVision(message: string): boolean {
  return /(?:image|vision|multimodal).{0,80}(?:not supported|unsupported|not allowed|text.?only)|(?:not supported|unsupported).{0,80}(?:image|vision|multimodal)/iu.test(message)
}

export class OpenCode2DshAdapter extends LlmAdapter {
  private readonly provider = createProvider<Api>({
    id: PROVIDER_ID,
    name: PROVIDER_ID,
    baseUrl: `${ZEN_BASE_URL}/v1`,
    auth: { apiKey: { name: 'OpenCode Zen anonymous lane', resolve: async () => ({ auth: { apiKey: ANONYMOUS_KEY } }) } },
    models: [],
    api: openaiCompletions,
  })

  constructor(private readonly catalog: ModelCatalog, private readonly attachments?: AttachmentStore) { super() }

  override providerInfo(provider: string) { return { id: provider, name: PROVIDER_ID } }

  override listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    const seen = new Set<string>()
    return Promise.resolve(this.catalog.list().flatMap(model => {
      if (seen.has(model.id)) return []
      seen.add(model.id)
      return [{ provider, id: model.id, name: model.name, ...(model.description === undefined ? {} : { description: model.description }), inputModalities: model.supportsImages ? ['text', 'image'] as const : ['text'] as const }]
    }))
  }

  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    const found = this.catalog.model(model) ?? { id: model, name: model, contextWindow: 262_144, maxTokens: 32_768, supportsImages: false }
    return Promise.resolve({ provider, id: model, name: found.name, ...(found.description === undefined ? {} : { description: found.description }), inputModalities: found.supportsImages ? ['text', 'image'] : ['text'], context: { contextWindow: found.contextWindow }, defaultMaxTokens: found.maxTokens })
  }

  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const found = this.catalog.model(options.model) ?? { id: options.model, name: options.model, contextWindow: 262_144, maxTokens: 32_768, supportsImages: false }
    const ids = deriveRequestIds(options.messages)
    const events = this.provider.streamSimple(piModel(found), await toPiContext(options, this.attachments), {
      apiKey: ANONYMOUS_KEY,
      sessionId: ids.session,
      headers: disguiseHeaders(ids),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
      ...(options.maxTokens === undefined ? {} : { maxTokens: options.maxTokens }),
      maxRetries: 0,
    })
    yield* toStreamChunks(events)
  }

  override async probeModel(provider: string, model: string, signal?: AbortSignal): Promise<readonly LlmProbeAttempt[]> {
    const startedAt = Date.now()
    try {
      let terminal: Extract<StreamChunk, { type: 'finish' }> | undefined
      for await (const chunk of this.stream({ provider, model, maxTokens: 4, messages: [createUserMessage({ content: [{ type: 'text', text: 'Reply with OK.' }], source: { kind: 'user' } })], ...(signal === undefined ? {} : { signal }) })) {
        if (chunk.type === 'finish') terminal = chunk
      }
      if (terminal === undefined) return [{ protocol: 'openai-completions', ok: false, message: 'model produced no terminal event', latencyMs: Date.now() - startedAt }]
      if (terminal.reason.kind === 'error' || terminal.reason.kind === 'aborted') {
        return [{ protocol: 'openai-completions', ok: false, message: safeProbeMessage(terminal.reason.failure.message), latencyMs: Date.now() - startedAt }]
      }
      return [{ protocol: 'openai-completions', ok: true, latencyMs: Date.now() - startedAt }]
    } catch (error) {
      return [{ protocol: 'openai-completions', ok: false, message: safeProbeMessage(error), latencyMs: Date.now() - startedAt }]
    }
  }

  override async probeVision(provider: string, model: string, signal?: AbortSignal): Promise<LlmVisionProbeResult> {
    const metadata = this.catalog.model(model)
    if (metadata !== undefined && !metadata.supportsImages) return { status: 'unsupported', protocol: 'metadata', message: 'model catalog declares text-only input' }
    if (this.attachments === undefined) return { status: 'unknown', protocol: 'openai-completions', message: 'durable attachment service unavailable' }
    const image = await this.attachments.saveImage({ mediaType: 'image/png', name: 'zerowall-vision-probe.png', data: Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')) })
    let terminal: Extract<StreamChunk, { type: 'finish' }> | undefined
    try {
      for await (const chunk of this.stream({ provider, model, maxTokens: 4, messages: [createUserMessage({ content: [{ type: 'text', text: 'Describe the image in one word.' }, { type: 'image', attachment: image }], source: { kind: 'user' } })], ...(signal === undefined ? {} : { signal }) })) {
        if (chunk.type === 'finish') terminal = chunk
      }
      if (terminal === undefined) return { status: 'unknown', protocol: 'openai-completions', message: 'model produced no terminal event' }
      if (terminal.reason.kind !== 'error' && terminal.reason.kind !== 'aborted') return { status: 'supported', protocol: 'openai-completions' }
      const message = safeProbeMessage(terminal.reason.failure.message)
      return { status: rejectsVision(message) ? 'unsupported' : 'unknown', protocol: 'openai-completions', message }
    } catch (error) {
      const message = safeProbeMessage(error)
      return { status: rejectsVision(message) ? 'unsupported' : 'unknown', protocol: 'openai-completions', message }
    }
  }
}
