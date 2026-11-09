import { normalizeContext } from '@earendil-works/pi-ai'
import { afterEach, expect, it, vi } from 'vitest'
import { resolveManagedProfiles } from '../src/cloud/host/profile-resolver.js'

const nativeFetch = globalThis.fetch

afterEach(() => { vi.stubGlobal('fetch', nativeFetch) })

it('streams Gemini groups through the native Google Generative Language endpoint', async () => {
  const requests: Array<{ url: string; headers: Headers; body: Record<string, unknown> }> = []
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input, init) => {
    requests.push({
      url: String(input),
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    })
    const response = {
      candidates: [{ content: { parts: [{ text: 'native Gemini response' }], role: 'model' }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
    }
    return new Response(`data: ${JSON.stringify(response)}\n\n`, { headers: { 'content-type': 'text/event-stream' } })
  }))

  const route = 'zerowall-ai-cloud-10-gemini'
  const modelId = 'gemini-4-argon-search'
  const profile = resolveManagedProfiles({
    [route]: {
      api: 'google-generative-ai',
      baseURL: 'https://code.aicodeme.xyz/v1beta',
      compat: {},
      defaultInput: ['text', 'image'],
      models: [{ id: modelId, input: ['text', 'image'] }],
    },
  }).get(route)
  if (profile?.piProvider === undefined) throw new Error('Gemini route did not create a provider.')
  const model = profile.piProvider.getModels()[0]
  if (model === undefined) throw new Error('Gemini route did not create a model.')

  const stream = profile.piProvider.stream(model, normalizeContext({ messages: [{ role: 'user', content: 'hello', timestamp: 0 }] }), { apiKey: 'fixture-group-key' })
  const events: string[] = []
  for await (const event of stream) if (event.type === 'text_delta') events.push(event.delta)

  expect(events.join('')).toBe('native Gemini response')
  expect(requests).toHaveLength(1)
  const request = requests[0]!
  const url = new URL(request.url)
  expect(url.origin).toBe('https://code.aicodeme.xyz')
  expect(url.pathname).toBe('/v1beta/models/gemini-4-argon-search:streamGenerateContent')
  expect(url.searchParams.get('alt')).toBe('sse')
  expect(request.headers.get('x-goog-api-key')).toBe('fixture-group-key')
  expect(request.headers.get('authorization')).toBeNull()
  expect(request.body).toMatchObject({ contents: [{ role: 'user', parts: [{ text: 'hello' }] }] })
})
