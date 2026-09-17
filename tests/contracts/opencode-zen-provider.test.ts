import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Context } from '../../deepseek-harness/vendor/cordis/src/index.ts'
import LlmRuntime from '../../deepseek-harness/packages/llm/llm/src/index.ts'
import { AttachmentId, AttachmentStore, ImageVariantId } from '../../deepseek-harness/packages/attachment/attachment/src/index.ts'
import type {
  ImageAttachmentLimits,
  ImageAttachmentRef,
  ImageRequestPolicy,
  RequestImageAttachment,
  SaveImageAttachment,
  StoredImageAttachment,
} from '../../deepseek-harness/packages/attachment/attachment/src/types.ts'
import { buildModelCatalog } from '../../deepseek-harness/packages/api/session-controller/src/catalog.ts'

const PROVIDER = 'opencode-zen-free-provider'
const originalFetch = globalThis.fetch
const requests: Array<{ url: string; headers: Headers; body: unknown }> = []
let completionResponse: 'success' | 'free-tier' | 'auth' = 'success'
let catalogFailuresRemaining = 0
let zenCatalogRequests = 0

const chatEvents = [
  '{"choices":[{"delta":{"role":"assistant","content":""},"index":0,"finish_reason":null}]}',
  '{"choices":[{"delta":{"content":"OK"},"index":0,"finish_reason":null}]}',
  '{"choices":[{"delta":{},"index":0,"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":1}}',
  '[DONE]',
]

function urlOf(input: string | URL | Request): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

async function bodyOf(input: string | URL | Request, init?: RequestInit): Promise<unknown> {
  if (init?.body !== undefined && typeof init.body === 'string') return JSON.parse(init.body)
  if (input instanceof Request) {
    const text = await input.clone().text()
    return text === '' ? undefined : JSON.parse(text)
  }
  return undefined
}

function sse(events: readonly string[]): Response {
  return new Response(events.map(event => `data: ${event}\n\n`).join(''), {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })
}

async function mockFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = urlOf(input)
  if (url === 'https://unpkg.com/opencode-ai@latest/package.json') return Response.json({ version: '1.18.31' })
  if (url === 'https://opencode.ai/zen/v1/models') {
    zenCatalogRequests += 1
    if (catalogFailuresRemaining > 0) {
      catalogFailuresRemaining -= 1
      return Response.json({ error: 'temporary outage' }, { status: 503 })
    }
    return Response.json({ data: [
      { id: 'mimo-v2.5-free' },
      { id: 'muse-spark-free' },
      { id: 'retired-free' },
      { id: 'missing-metadata-free' },
      { id: 'paid-model' },
    ] })
  }
  if (url === 'https://models.dev/api.json') {
    return Response.json({ opencode: { models: {
      'mimo-v2.5-free': {
        name: 'MiMo V2.5 Free',
        limit: { context: 262_144, output: 32_768 },
        modalities: { input: ['text', 'image'] },
        reasoning_options: [{ type: 'effort', values: ['low', 'high'] }],
      },
      'muse-spark-free': {
        name: 'Muse Spark Free',
        modalities: { input: ['text'] },
        reasoning_options: [{ type: 'effort', values: ['minimal', 'medium', 'xhigh'] }],
      },
      'retired-free': { name: 'Retired', status: 'deprecated' },
      'paid-model': { name: 'Paid' },
    } } })
  }

  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
  requests.push({ url, headers, body: await bodyOf(input, init) })
  if (completionResponse === 'free-tier') {
    return Response.json({ type: 'error', error: { type: 'FreeTierError', message: 'Free quota is unavailable in this region' } }, { status: 403 })
  }
  if (completionResponse === 'auth') {
    return Response.json({ type: 'error', error: { type: 'AuthError', message: 'Authentication required' } }, { status: 403 })
  }
  if (url.endsWith('/responses')) {
    return Response.json({ type: 'error', error: { type: 'ModelError', message: 'responses route selected' } }, { status: 418 })
  }
  return sse(chatEvents)
}

async function waitForCatalog(ctx: Context): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if ((await ctx.llm.listModels(PROVIDER)).length > 0) return
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error('OpenCode Zen catalog did not arrive')
}

async function boot(options: { attachments?: boolean } = {}): Promise<{ ctx: Context; updates: number[] }> {
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  const updates: number[] = []
  ctx.on('llm/adapters-updated', () => { updates.push(Date.now()) })
  const provider = await import('../../desktop/node_modules/@jiesou/dsh-opencode-zen-free-provider/lib/index.js')
  await ctx.plugin(provider, {})
  if (options.attachments === true) await ctx.plugin(TestAttachmentStore)
  await waitForCatalog(ctx)
  return { ctx, updates }
}

class TestAttachmentStore extends AttachmentStore {
  readonly imageLimits: ImageAttachmentLimits = {
    maxImageBytes: 1024,
    maxImagesPerMessage: 1,
    maxMessageImageBytes: 1024,
    maxImagePixels: 1,
    maxImageDimension: 1,
    mediaTypes: ['image/png'],
  }

  validateImage(): Promise<void> { return Promise.resolve() }

  saveImage(input: SaveImageAttachment): Promise<ImageAttachmentRef> {
    return Promise.resolve({
      attachmentId: AttachmentId(`sha256:${'a'.repeat(64)}`),
      mediaType: input.mediaType,
      bytes: input.data.byteLength,
      width: 1,
      height: 1,
    })
  }

  readImage(ref: ImageAttachmentRef): Promise<StoredImageAttachment> {
    return Promise.resolve({ ref, data: Uint8Array.of(137, 80, 78, 71) })
  }

  override readImageRequest(ref: ImageAttachmentRef, _policy: ImageRequestPolicy): Promise<RequestImageAttachment> {
    const data = Uint8Array.of(137, 80, 78, 71)
    return Promise.resolve({
      variantId: ImageVariantId(`sha256:${'b'.repeat(64)}`),
      attachment: ref,
      data,
      mediaType: ref.mediaType,
      bytes: data.byteLength,
      width: 1,
      height: 1,
      depth: 'uchar',
      space: 'srgb',
      hasAlpha: true,
    })
  }
}

beforeAll(() => {
  globalThis.fetch = mockFetch as typeof fetch
})

afterAll(() => {
  globalThis.fetch = originalFetch
})

describe.sequential('OpenCode Zen Free mounted adapter', () => {
  it('recovers from a transient startup catalog failure and publishes the session catalog', async () => {
    catalogFailuresRemaining = 1
    zenCatalogRequests = 0
    const { ctx } = await boot()
    try {
      expect(zenCatalogRequests).toBeGreaterThanOrEqual(2)
      const catalog = await buildModelCatalog(ctx, { provider: 'deepseek-official', model: 'deepseek-v4-flash' }, { refresh: true })
      expect(catalog.groups).toContainEqual(expect.objectContaining({
        id: PROVIDER,
        name: 'OpenCode Zen Free',
        models: expect.arrayContaining([
          expect.objectContaining({ id: 'mimo-v2.5-free' }),
        ]),
      }))
    } finally {
      catalogFailuresRemaining = 0
      await ctx.fiber.dispose()
    }
  })

  it('filters the live catalog and atomically publishes reasoning and modality metadata', async () => {
    const { ctx, updates } = await boot()
    try {
      const models = await ctx.llm.listModels(PROVIDER)
      expect(models.map(model => model.id)).toEqual(['mimo-v2.5-free', 'muse-spark-free'])
      expect(ctx.llm.listProviders()).toContainEqual({ id: PROVIDER, name: 'OpenCode Zen Free' })
      expect(ctx.llm.listConfigurableProviders()).toContainEqual({
        provider: PROVIDER,
        displayName: 'OpenCode Zen Free',
        settingsNs: PROVIDER,
        settingsPath: [],
      })
      const mimo = await ctx.llm.resolveModelInfo(PROVIDER, 'mimo-v2.5-free')
      expect(mimo.context?.contextWindow).toBe(1_048_576)
      expect(mimo.inputModalities).toEqual(['text', 'image'])
      expect(mimo.reasoning?.efforts.map(effort => effort.id)).toEqual(['low', 'high'])
      expect(updates.length).toBeGreaterThanOrEqual(2)
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('routes chat and Responses models through their declared protocols', async () => {
    const { ctx } = await boot()
    requests.length = 0
    completionResponse = 'success'
    try {
      const chunks = []
      for await (const chunk of ctx.llm.stream({
        provider: PROVIDER,
        model: 'mimo-v2.5-free',
        reasoningEffort: 'low',
        messages: [],
      })) chunks.push(chunk)
      expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'stop' } })
      expect(requests[0]?.url).toBe('https://opencode.ai/zen/v1/chat/completions')
      expect(requests[0]?.headers.get('user-agent')).toBe('opencode/1.18.31')
      expect(requests[0]?.body).toMatchObject({ model: 'mimo-v2.5-free', reasoning_effort: 'low' })

      for await (const _chunk of ctx.llm.stream({ provider: PROVIDER, model: 'muse-spark-free', messages: [] })) { /* drain */ }
      expect(requests[1]?.url).toBe('https://opencode.ai/zen/v1/responses')
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('performs real text and image probes through the mounted adapter', async () => {
    const { ctx } = await boot({ attachments: true })
    requests.length = 0
    completionResponse = 'success'
    try {
      const text = await ctx.llm.probeModel(PROVIDER, 'mimo-v2.5-free')
      const vision = await ctx.llm.probeVision(PROVIDER, 'mimo-v2.5-free')
      expect(text).toContainEqual(expect.objectContaining({ protocol: 'native', ok: true }))
      expect(vision).toMatchObject({ status: 'supported', protocol: 'native' })
      expect(requests).toHaveLength(2)
      expect(JSON.stringify(requests[1]?.body)).toContain('image_url')
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('keeps free-tier refusals unavailable while genuine authentication failures require login', async () => {
    const { ctx } = await boot()
    try {
      completionResponse = 'free-tier'
      const freeTier = await buildModelCatalog(ctx, { provider: PROVIDER, model: 'mimo-v2.5-free' }, {
        check: true,
        refresh: true,
        provider: PROVIDER,
        model: 'mimo-v2.5-free',
      })
      expect(freeTier.groups[0]?.models[0]).toMatchObject({
        status: 'unavailable',
        statusMessage: expect.stringContaining('Free quota is unavailable in this region'),
      })

      completionResponse = 'auth'
      const auth = await buildModelCatalog(ctx, { provider: PROVIDER, model: 'mimo-v2.5-free' }, {
        check: true,
        refresh: true,
        provider: PROVIDER,
        model: 'mimo-v2.5-free',
      })
      expect(auth.groups[0]?.models[0]).toMatchObject({
        status: 'requires-login',
        statusMessage: expect.stringContaining('Authentication required'),
      })
    } finally {
      completionResponse = 'success'
      await ctx.fiber.dispose()
    }
  })
})
