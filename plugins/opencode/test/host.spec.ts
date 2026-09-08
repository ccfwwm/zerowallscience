import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { ModelCatalog, STATIC_FREE_MODELS, decodeModelsDev } from '../src/host/catalog.ts'
import { OpenCode2DshAdapter, PROVIDER_ID } from '../src/host/zen-adapter.ts'

afterEach(() => vi.restoreAllMocks())

function catalog(): ModelCatalog { return new ModelCatalog() }

function successfulStream(text = 'OK'): Response {
  return new Response(
    `data: {"choices":[{"delta":{"content":"${text}"}}]}\n\n`
    + 'data: {"choices":[{"finish_reason":"stop","delta":{}}],"usage":{"prompt_tokens":2,"completion_tokens":1}}\n\n'
    + 'data: [DONE]\n\n',
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  )
}

describe('OpenCode2DshAdapter', () => {
  it('registers the new provider and sends public auth with CLI correlation headers', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(successfulStream())
    const adapter = new OpenCode2DshAdapter(catalog())
    const chunks: StreamChunk[] = []
    for await (const chunk of adapter.stream({ provider: PROVIDER_ID, model: 'big-pickle', messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] })) chunks.push(chunk)

    expect(adapter.providerInfo(PROVIDER_ID)).toEqual({ id: 'opencode2dsh', name: 'opencode2dsh' })
    expect(chunks.at(-1)).toEqual({ type: 'finish', reason: { kind: 'stop' } })
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(String(url)).toBe('https://opencode.ai/zen/v1/chat/completions')
    const headers = new Headers((init as RequestInit).headers)
    expect(headers.get('authorization')).toBe('Bearer public')
    expect(headers.get('user-agent')).toMatch(/^opencode\/1\.18\.21/u)
    expect(headers.get('x-opencode-client')).toBe('cli')
    expect(headers.get('x-opencode-session')).toMatch(/^ses_/u)
    expect(headers.get('x-opencode-request')).toMatch(/^req_/u)
  })

  it('translates tool calls and usage through pi-ai', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","type":"function","function":{"name":"lookup","arguments":"{\\"id\\":"}}]},"finish_reason":null}]}\n\n'
      + 'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"1}"}}]},"finish_reason":null}]}\n\n'
      + 'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":12,"completion_tokens":4}}\n\n'
      + 'data: [DONE]\n\n',
      { status: 200, headers: { 'content-type': 'text/event-stream' } },
    ))
    const chunks: StreamChunk[] = []
    for await (const chunk of new OpenCode2DshAdapter(catalog()).stream({
      provider: PROVIDER_ID, model: 'big-pickle',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'lookup' }] }],
      tools: [{ name: 'lookup', description: 'Lookup', parameters: { type: 'object' } }],
    })) chunks.push(chunk)
    expect(chunks.some(chunk => chunk.type === 'tool-call-delta')).toBe(true)
    expect(chunks).toContainEqual({ type: 'usage', usage: { inputTokens: 12, outputTokens: 4 } })
    expect(chunks.at(-1)).toEqual({ type: 'finish', reason: { kind: 'tool-calls' } })
  })

  it('sends durable images through pi-ai as image_url wire content', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(successfulStream('white'))
    const ref = { attachmentId: `sha256:${'c'.repeat(64)}`, mediaType: 'image/png' as const, bytes: 1, width: 1, height: 1 }
    const attachments = { readImage: vi.fn(async () => ({ ref, data: Uint8Array.of(255) })) } as unknown as AttachmentStore
    const adapter = new OpenCode2DshAdapter(catalog(), attachments)
    for await (const _chunk of adapter.stream({ provider: PROVIDER_ID, model: 'mimo-v2.5-free', messages: [{ id: 'u1', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'look' }, { type: 'image', attachment: ref }] }] })) { /* consume */ }
    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)) as { messages: Array<{ content: unknown }> }
    expect(JSON.stringify(body.messages[0]?.content)).toContain('data:image/png;base64,/w==')
  })

  it('waits for the terminal finish before declaring a probe successful', async () => {
    class LateFailureAdapter extends OpenCode2DshAdapter {
      override async *stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
        yield { type: 'block-start', index: 0, blockType: 'text' }
        yield { type: 'text-delta', index: 0, text: 'partial' }
        yield { type: 'finish', reason: { kind: 'error', failure: { message: 'HTTP 429 rate limit', code: 'RATE_LIMIT' } } }
      }
    }
    const result = await new LateFailureAdapter(catalog()).probeModel(PROVIDER_ID, 'big-pickle')
    expect(result).toMatchObject([{ protocol: 'openai-completions', ok: false, message: 'HTTP 429 rate limit' }])
  })

  it('reports a completed probe and classifies text-only vision metadata without a request', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(successfulStream())
    const adapter = new OpenCode2DshAdapter(catalog())
    expect(await adapter.probeModel(PROVIDER_ID, 'big-pickle')).toMatchObject([{ ok: true, protocol: 'openai-completions' }])
    expect(await adapter.probeVision(PROVIDER_ID, 'big-pickle')).toMatchObject({ status: 'unsupported', protocol: 'metadata' })
  })

  it('returns a failed attempt for upstream authentication errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"error":{"message":"unauthorized"}}', { status: 401 }))
    const result = await new OpenCode2DshAdapter(catalog()).probeModel(PROVIDER_ID, 'big-pickle')
    expect(result).toMatchObject([{ ok: false, protocol: 'openai-completions' }])
    expect(result[0]?.message).toMatch(/401|unauthorized/iu)
  })

  it('runs the image probe for a catalog-declared vision model', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(successfulStream('white'))
    const ref = { attachmentId: `sha256:${'d'.repeat(64)}`, mediaType: 'image/png' as const, bytes: 1, width: 1, height: 1 }
    const attachments = {
      saveImage: vi.fn(async () => ref),
      readImage: vi.fn(async () => ({ ref, data: Uint8Array.of(255) })),
    } as unknown as AttachmentStore
    const result = await new OpenCode2DshAdapter(catalog(), attachments).probeVision(PROVIDER_ID, 'mimo-v2.5-free')
    expect(result).toEqual({ status: 'supported', protocol: 'openai-completions' })
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})

describe('ModelCatalog', () => {
  it('decodes free pricing, limits, names, and image input from models.dev', () => {
    const models = decodeModelsDev({ opencode: { models: {
      free: { id: 'free', name: 'Free Vision', attachment: true, modalities: { input: ['text', 'image'] }, limit: { context: 1000, output: 200 }, cost: { input: 0, output: 0 } },
      paid: { id: 'paid', cost: { input: 1, output: 2 } },
      old: { id: 'old-free', deprecated: true, cost: { input: 0, output: 0 } },
    } } })
    expect(models.get('free')).toMatchObject({ name: 'Free Vision', contextWindow: 1000, maxTokens: 200, supportsImages: true, inputCost: 0, outputCost: 0, deprecated: false })
    expect(models.get('old-free')?.deprecated).toBe(true)
  })

  it('intersects the live list with free metadata while retaining verified static models', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => String(url).includes('models.dev')
      ? new Response(JSON.stringify({ opencode: { models: {
        'big-pickle': {},
        'new-free': { name: 'New Free', cost: { input: 0, output: 0 }, limit: { context: 4096, output: 512 }, attachment: true },
        paid: { cost: { input: 1, output: 1 } },
      } } }), { status: 200 })
      : new Response(JSON.stringify({ data: [{ id: 'big-pickle' }, { id: 'new-free' }, { id: 'paid' }] }), { status: 200 }))
    const modelCatalog = new ModelCatalog({ fetchImpl: fetchImpl as typeof fetch })
    await modelCatalog.refreshOnce()
    expect(modelCatalog.list()).toEqual([
      expect.objectContaining({ id: 'big-pickle' }),
      expect.objectContaining({ id: 'new-free', contextWindow: 4096, maxTokens: 512, supportsImages: true }),
    ])
  })

  it('publishes adapter updates only when the effective catalog changes', async () => {
    let revision = 0
    const onRefresh = vi.fn()
    const fetchImpl = vi.fn(async (url: string | URL | Request) => String(url).includes('models.dev')
      ? new Response(JSON.stringify({ opencode: { models: {
        'big-pickle': { name: revision === 0 ? 'Big Pickle' : 'Big Pickle Updated', cost: { input: 0, output: 0 } },
      } } }), { status: 200 })
      : new Response(JSON.stringify({ data: [{ id: 'big-pickle' }] }), { status: 200 }))
    const modelCatalog = new ModelCatalog({ fetchImpl: fetchImpl as typeof fetch, onRefresh })

    await modelCatalog.refreshOnce()
    expect(onRefresh).toHaveBeenCalledOnce()
    await modelCatalog.refreshOnce()
    expect(onRefresh).toHaveBeenCalledOnce()
    revision = 1
    await modelCatalog.refreshOnce()
    expect(onRefresh).toHaveBeenCalledTimes(2)
  })

  it('falls back to the static catalog and writes a bounded health snapshot', async () => {
    const root = await mkdtemp(join(tmpdir(), 'opencode2dsh-'))
    const statusPath = join(root, 'adapter-status.json')
    const modelCatalog = new ModelCatalog({ fetchImpl: vi.fn(async () => { throw new Error('offline') }) as typeof fetch, statusPath })
    await modelCatalog.refreshOnce()
    expect(modelCatalog.list().map(model => model.id)).toEqual([...STATIC_FREE_MODELS].map(model => model.id).sort())
    const status = JSON.parse(await readFile(statusPath, 'utf8')) as { status: string; exposed: number; lastError: string }
    expect(status).toMatchObject({ status: 'pending', exposed: STATIC_FREE_MODELS.length })
    expect(status.lastError).toContain('offline')
  })

  it('uses a fresh models.dev cache when metadata refresh fails', async () => {
    const root = await mkdtemp(join(tmpdir(), 'opencode2dsh-cache-'))
    const cachePath = join(root, 'models.json')
    const warmFetch = vi.fn(async (url: string | URL | Request) => String(url).includes('models.dev')
      ? new Response(JSON.stringify({ opencode: { models: { 'cached-free': { name: 'Cached Free', attachment: true, cost: { input: 0, output: 0 } } } } }), { status: 200 })
      : new Response(JSON.stringify({ data: [{ id: 'cached-free' }] }), { status: 200 }))
    await new ModelCatalog({ fetchImpl: warmFetch as typeof fetch, cachePath }).refreshOnce()

    const coldFetch = vi.fn(async (url: string | URL | Request) => String(url).includes('models.dev')
      ? Promise.reject(new Error('metadata offline'))
      : Promise.resolve(new Response(JSON.stringify({ data: [{ id: 'cached-free' }] }), { status: 200 })))
    const cached = new ModelCatalog({ fetchImpl: coldFetch as typeof fetch, cachePath })
    await cached.refreshOnce()
    expect(cached.list()).toEqual([expect.objectContaining({ id: 'cached-free', name: 'Cached Free', supportsImages: true })])
  })
})
