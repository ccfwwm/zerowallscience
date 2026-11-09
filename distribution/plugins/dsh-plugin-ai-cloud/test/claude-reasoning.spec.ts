import { Context } from '@deepseek-ai/cordis'
import { LlmRuntime, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AiCloudLlmController } from '../src/cloud/host/index.js'

const contexts: Context[] = []
afterEach(async () => {
  vi.unstubAllGlobals()
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
})

async function setup(modelId: string) {
  const ctx = new Context()
  contexts.push(ctx)
  const llm = new LlmRuntime(ctx)
  const controller = new AiCloudLlmController(ctx, {
    secrets: { get: async () => 'fixture-group-key', set: async () => {}, delete: async () => {} },
  })
  await controller.update({
    status: 'signedIn', balanceFreshness: 'current', lowBalance: false,
    models: [{ providerId: 'zerowall-ai-cloud-25-messages', groupId: '25', groupName: 'Claude',
      modelId, baseUrl: 'https://code.aicodeme.xyz', contextWindow: 200_000, maxOutputTokens: 64_000 }],
  })
  return { llm, provider: 'zerowall-ai-cloud-25-messages', modelId }
}

describe('Claude thinking controls', () => {
  it.each([
    ['claude-opus-4-6', ['low', 'medium', 'high', 'max']],
    ['claude-sonnet-4-6', ['low', 'medium', 'high', 'max']],
    ['Claude-Opus-4.7', ['low', 'medium', 'high', 'xhigh', 'max']],
    ['anthropic/claude-opus-4-6-fast', ['low', 'medium', 'high', 'max']],
    ['claude-sonnet-4-5-20250929', ['low', 'medium', 'high']],
    ['claude-haiku-4-5', ['low', 'medium', 'high']],
    ['claude-sonnet-4', ['low', 'medium', 'high']],
    ['claude-3-7-sonnet-20250219', ['low', 'medium', 'high']],
    ['claude-3-haiku-20240307', undefined],
  ] as const)('exposes supported intensities for %s', async (modelId, efforts) => {
    const { llm, provider } = await setup(modelId)
    const info = await llm.resolveModelInfo(provider, modelId)
    expect(info.reasoning?.efforts.map(effort => effort.id)).toEqual(efforts)
  })

  it.each([
    ['claude-opus-4-6', 'low', true],
    ['claude-opus-4-6', 'medium', true],
    ['claude-opus-4-6', 'high', true],
    ['claude-opus-4-6', 'max', true],
    ['claude-opus-4-7', 'xhigh', true],
    ['claude-sonnet-4-5', 'low', false],
    ['claude-sonnet-4-5', 'high', false],
  ] as const)('sends %s %s intensity to native Messages', async (selectedModel, effort, adaptive) => {
    const requests: Record<string, unknown>[] = []
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input, init) => {
      const request = new Request(input, init)
      expect(new URL(request.url).pathname).toBe('/v1/messages')
      expect(request.headers.get('x-api-key')).toBe('fixture-group-key')
      requests.push(await request.json() as Record<string, unknown>)
      const events = [
        { type: 'message_start', message: { id: 'msg_fixture', type: 'message', role: 'assistant', model: 'claude-opus-4-6', content: [], usage: { input_tokens: 1, output_tokens: 0 } } },
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'OK' } },
        { type: 'content_block_stop', index: 0 },
        { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } },
        { type: 'message_stop' },
      ]
      return new Response(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''),
        { headers: { 'content-type': 'text/event-stream' } })
    }))
    const { llm, provider, modelId } = await setup(selectedModel)
    const chunks: StreamChunk[] = []
    for await (const chunk of llm.stream({
      provider, model: modelId, reasoningEffort: ReasoningEffortId(effort), maxTokens: 4096,
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Reply OK' }] }],
      signal: new AbortController().signal,
    })) chunks.push(chunk)
    expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'stop' } })
    expect(requests).toHaveLength(1)
    if (adaptive) {
      expect(requests[0]).toMatchObject({ model: modelId, thinking: { type: 'adaptive' }, output_config: { effort } })
      expect(requests[0]?.thinking).not.toHaveProperty('budget_tokens')
    } else {
      expect(requests[0]).toMatchObject({ model: modelId, thinking: { type: 'enabled', budget_tokens: effort === 'low' ? 2048 : 16384 } })
      expect(requests[0]).not.toHaveProperty('output_config')
    }
    expect(requests[0]).not.toHaveProperty('reasoning_effort')
    if (effort === 'low') {
      await expect(JSON.stringify(requests[0], null, 2) + '\n').toMatchFileSnapshot(`./expected/${modelId}-thinking-low.json`)
    }
  })

  it('rejects unsupported Claude intensities before sending a request', async () => {
    const fetcher = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetcher)
    const { llm, provider, modelId } = await setup('claude-opus-4-6')
    for (const effort of ['off', 'minimal', 'xhigh']) {
      const chunks: StreamChunk[] = []
      for await (const chunk of llm.stream({
        provider, model: modelId, reasoningEffort: ReasoningEffortId(effort),
        messages: [{ role: 'user', content: [{ type: 'text', text: 'Reply OK' }] }],
        signal: new AbortController().signal,
      })) chunks.push(chunk)
      expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'error', failure: { code: 'UNSUPPORTED_REASONING_EFFORT' } } })
    }
    expect(fetcher).not.toHaveBeenCalled()
  })
})
