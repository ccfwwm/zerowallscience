import { afterEach, describe, expect, it, vi } from 'vitest'
import { OpenCodeAdapter } from '../src/host/index.ts'

afterEach(() => vi.restoreAllMocks())

describe('OpenCodeAdapter', () => {
  it('streams anonymously without an Authorization header', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      'data: {"choices":[{"delta":{"content":"OK"}}]}\n\n'
      + 'data: {"choices":[{"finish_reason":"stop","delta":{}}]}\n\n'
      + 'data: [DONE]\n\n',
      { status: 200, headers: { 'content-type': 'text/event-stream' } },
    ))
    const adapter = new OpenCodeAdapter(() => ({ baseURL: 'https://opencode.test/v1', models: [], maxTokens: 128, defaultContextWindow: 1024, apiKey: undefined }))
    const chunks = []
    for await (const chunk of adapter.stream({ provider: 'opencode-zen', model: 'big-pickle', messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] })) chunks.push(chunk)
    expect(chunks.some(chunk => chunk.type === 'text-delta' && chunk.text === 'OK')).toBe(true)
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(new Headers(init.headers).has('authorization')).toBe(false)
  })

  it('translates streamed tool calls so image generation can be dispatched', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-image","type":"function","function":{"name":"generate_image","arguments":"{\\"prompt\\":\\"cat\\""}}]},"index":0,"finish_reason":null}]}\n\n'
      + 'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":",\\"output_path\\":\\"cat.png\\"}"}}]},"index":0,"finish_reason":null}]}\n\n'
      + 'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":12,"completion_tokens":4}}\n\n'
      + 'data: [DONE]\n\n',
      { status: 200, headers: { 'content-type': 'text/event-stream' } },
    ))
    const adapter = new OpenCodeAdapter(() => ({ baseURL: 'https://opencode.test/v1', models: [], maxTokens: 128, defaultContextWindow: 1024, apiKey: undefined }))
    const chunks = []
    for await (const chunk of adapter.stream({
      provider: 'opencode-zen',
      model: 'x-preview-free',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'make an image' }] }],
      tools: [{ name: 'generate_image', description: 'Generate a PNG', parameters: { type: 'object' } }],
    })) chunks.push(chunk)

    expect(chunks.some(chunk => chunk.type === 'tool-call-delta' && chunk.name === 'generate_image')).toBe(true)
    expect(chunks.find(chunk => chunk.type === 'block-end' && chunk.block.type === 'tool-call')).toMatchObject({
      block: { type: 'tool-call', id: 'call-image', name: 'generate_image', arguments: '{"prompt":"cat","output_path":"cat.png"}' },
    })
    expect(chunks.at(-1)).toEqual({ type: 'finish', reason: { kind: 'tool-calls' } })

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    const body = JSON.parse(String(init.body)) as { tools?: Array<{ function?: { name?: string } }> }
    expect(body.tools?.[0]?.function?.name).toBe('generate_image')
  })
})
