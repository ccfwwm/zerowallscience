import { Context } from '@deepseek-ai/cordis'
import { LlmRuntime } from '@deepseek-ai/dsh-llm'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import { afterEach, expect, it, vi } from 'vitest'
import { AiCloudLlmController } from '../src/cloud/host/index.js'

const contexts: Context[] = []
afterEach(async () => {
  vi.unstubAllGlobals()
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
})

function responseEvents(model: string): object[] {
  if (model.startsWith('claude')) return [
    { type: 'message_start', message: { id: 'msg_fixture', type: 'message', role: 'assistant', model, content: [], usage: { input_tokens: 1, output_tokens: 0 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'OK' } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } }, { type: 'message_stop' },
  ]
  if (model.startsWith('gpt')) {
    const response = { id: 'resp_fixture', object: 'response', model, status: 'completed', output: [], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } }
    return [
      { type: 'response.created', response },
      { type: 'response.output_item.added', output_index: 0, item: { id: 'msg_fixture', type: 'message', role: 'assistant', content: [] } },
      { type: 'response.content_part.added', item_id: 'msg_fixture', output_index: 0, content_index: 0, part: { type: 'output_text', text: '' } },
      { type: 'response.output_text.delta', item_id: 'msg_fixture', output_index: 0, content_index: 0, delta: 'OK' },
      { type: 'response.completed', response },
    ]
  }
  if (model.startsWith('gemini')) return [{ candidates: [{ content: { parts: [{ text: 'OK' }], role: 'model' }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 } }]
  return [
    { id: 'chatcmpl_fixture', choices: [{ index: 0, delta: { role: 'assistant', content: 'OK' }, finish_reason: null }] },
    { id: 'chatcmpl_fixture', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } },
  ]
}

it.each([
  ['gpt-6.1-sol', 'responses'], ['deepseek-v4-flash', 'completions'], ['gemini-4-argon-search', 'gemini'], ['claude-opus-4-6', 'messages'],
])('uses upstream output defaults for %s and preserves an explicit caller cap', async (model, protocol) => {
  const requests: Record<string, unknown>[] = []
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input, init) => {
    const request = new Request(input, init)
    requests.push(await request.json() as Record<string, unknown>)
    return new Response(responseEvents(model).map(event => {
      const type = 'type' in event ? event.type : undefined
      return `${type ? `event: ${type}\n` : ''}data: ${JSON.stringify(event)}\n\n`
    }).join(''), { headers: { 'content-type': 'text/event-stream' } })
  }))
  const ctx = new Context()
  contexts.push(ctx)
  const llm = new LlmRuntime(ctx)
  const provider = `zerowall-ai-cloud-1-${protocol}`
  const controller = new AiCloudLlmController(ctx, { secrets: { get: async () => 'fixture-key', set: async () => {}, delete: async () => {} } })
  await controller.update({ status: 'signedIn', balanceFreshness: 'current', lowBalance: false,
    models: [{ providerId: provider, groupId: '1', groupName: 'Fixture', modelId: model, baseUrl: 'https://code.aicodeme.xyz', contextWindow: 1_000_000, maxOutputTokens: 128_000 }],
  })
  expect(await llm.resolveModelInfo(provider, model)).not.toHaveProperty('defaultMaxTokens')
  for (const maxTokens of [undefined, 4096]) {
    const chunks: StreamChunk[] = []
    for await (const chunk of llm.stream({ provider, model, ...(maxTokens === undefined ? {} : { maxTokens }),
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Reply OK' }] }], signal: new AbortController().signal,
    })) chunks.push(chunk)
    expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'stop' } })
  }
  expect(requests).toHaveLength(2)
  if (protocol === 'messages') {
    expect(requests[0]).toHaveProperty('max_tokens', 128_000)
    expect(requests[1]).toHaveProperty('max_tokens', 4096)
  } else if (protocol === 'gemini') {
    expect(requests[0]?.generationConfig).not.toHaveProperty('maxOutputTokens')
    expect(requests[1]?.generationConfig).toHaveProperty('maxOutputTokens', 4096)
  } else {
    for (const field of ['max_output_tokens', 'max_completion_tokens', 'max_tokens']) expect(requests[0]).not.toHaveProperty(field)
    expect(requests[1]).toHaveProperty(protocol === 'responses' ? 'max_output_tokens' : 'max_completion_tokens', 4096)
  }
})
