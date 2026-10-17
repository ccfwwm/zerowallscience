import { afterEach, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { createUserMessage, LlmAdapter, LlmError, ReasoningEffortId, resolveRetryPolicy, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmFailure, StreamChunk } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjections from '../../../deepseek-harness/packages/session/session-projection/src/index.ts'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools, { defineContentToolFixture } from '../../../deepseek-harness/packages/core/tools/src/index.ts'
import Agents from '@deepseek-ai/dsh-agent'
import AgentLoop from '../../../deepseek-harness/packages/core/agent-loop/src/index.ts'
import * as retry from '../../../deepseek-harness/packages/llm/llm-retry/src/index.ts'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import { ManagedPiAiAdapter, managedRetryPolicy, managedStream } from '../src/host/managed-adapter.js'

const upstream: LlmFailure = {
  code: 'INVALID_REQUEST',
  message: 'zerowall-ai-cloud-56-responses API error (400): {"message":"Upstream request failed","type":"upstream_error"}',
}
const flattenedUpstream: LlmFailure = {
  code: 'PI_AI_ERROR',
  message: 'upstream_error: The service is temporarily unavailable. Please retry later.',
}
const success: StreamChunk[] = [
  { type: 'block-start', index: 0, blockType: 'text' },
  { type: 'text-delta', index: 0, text: 'recovered' },
  { type: 'block-end', index: 0, block: { type: 'text', text: 'recovered' } },
  { type: 'finish', reason: { kind: 'stop' } },
]
let ctx: Context | undefined
afterEach(async () => { await ctx?.fiber.dispose(); ctx = undefined; vi.useRealTimers() })

async function setup(failure: LlmFailure, failures: number, scenario: { completedTool?: boolean; thrown?: boolean } = {}) {
  vi.useFakeTimers()
  const requests: GenerateOptions[] = []
  const execute = vi.fn(async () => [{ type: 'text' as const, text: 'saved once' }])
  class Adapter extends LlmAdapter {
    override providerRetryPolicy() { return resolveRetryPolicy(managedRetryPolicy, 'test') }
    override async resolveModel(provider: string, model: string) {
      return { provider, id: model, name: model, reasoning: { efforts: [{ id: ReasoningEffortId('xhigh'), name: 'xhigh' }] } }
    }
    async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
      requests.push(options)
      yield* managedStream((async function* () {
        if (scenario.completedTool && requests.length === 1) {
          yield { type: 'block-start', index: 0, blockType: 'tool-call' } as const
          yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: ToolCallId('save-once'), name: 'save_result', arguments: '{}' } } as const
          yield { type: 'finish', reason: { kind: 'tool-calls' } } as const
          return
        }
        if (requests.length > failures + (scenario.completedTool ? 1 : 0)) { yield* success; return }
        // Partial output belongs to the failed attempt, and is not a new turn.
        yield { type: 'block-start', index: 0, blockType: 'text' } as const
        yield { type: 'text-delta', index: 0, text: 'partial' } as const
        if (failure.code === 'STREAM_CLOSED' || scenario.thrown) throw new LlmError(failure.message, failure.code)
        yield { type: 'finish', reason: { kind: 'error', failure } } as const
      })())
    }
  }
  ctx = new Context()
  for (const plugin of [LlmRuntime, SessionStore, SessionProjections, SystemPrompt, Tools, Agents]) await ctx.plugin(plugin)
  if (scenario.completedTool) ctx.tools.register(defineContentToolFixture({ name: 'save_result', description: 'save once', parameters: {}, execute }))
  await ctx.plugin(Object.assign((inner: Context) => retry.apply(inner, {}, { random: () => 0.5 }), { inject: retry.inject }))
  await ctx.plugin(AgentLoop, { agents: [] })
  ctx.llm.registerAdapter(['zerowall-ai-cloud-56-responses'], new Adapter())
  const agent = await ctx.agentLoop.create(SessionId('cloud-retry'), {
    provider: 'zerowall-ai-cloud-56-responses', model: 'gpt-6.1-sol', reasoningEffort: ReasoningEffortId('xhigh'),
  })
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'continue' }], source: { kind: 'user' } }))
  // Flush asynchronous setup before advancing the cancellable backoff timers.
  for (let i = 0; i < 10 && requests.length === 0; i++) await vi.advanceTimersByTimeAsync(0)
  await vi.advanceTimersByTimeAsync(20_000)
  await agent.whenIdle()
  return { agent, requests, execute }
}

it('retries the exact flattened PI_AI_ERROR from the installed session five times in one turn', async () => {
  const { agent, requests } = await setup(flattenedUpstream, 5)
  expect(requests).toHaveLength(6)
  expect(agent.session.snapshotEvents().filter(e => e.type === 'llm/retry').map(e => e.data.retry)).toEqual([1, 2, 3, 4, 5])
  expect(agent.session.snapshotEvents().filter(e => e.type === 'turn/start')).toHaveLength(1)
  expect(agent.session.deriveMessages().at(-1)?.content).toEqual([{ type: 'text', text: 'recovered' }])
  for (const request of requests) expect(request).toMatchObject({ model: 'gpt-6.1-sol', reasoningEffort: 'xhigh' })
})

it('retries a thrown flattened upstream failure without replaying a completed tool', async () => {
  const { agent, requests, execute } = await setup(flattenedUpstream, 1, { completedTool: true, thrown: true })
  expect(requests).toHaveLength(3)
  expect(execute).toHaveBeenCalledOnce()
  const events = agent.session.snapshotEvents()
  expect(events.filter(e => e.type === 'llm/retry')).toHaveLength(1)
  expect(events.filter(e => e.type === 'tool/call')).toHaveLength(1)
  expect(events.filter(e => e.type === 'tool/result')).toHaveLength(1)
  expect(events.filter(e => e.type === 'turn/start')).toHaveLength(1)
  expect(agent.session.deriveMessages().at(-1)?.content).toEqual([{ type: 'text', text: 'recovered' }])
  expect(requests[2]?.messages).toEqual(requests[1]?.messages)
})

it.each([
  'Unexpected non-whitespace character after JSON at position 282926 (line 1 column 282927)',
  'Unexpected end of JSON input',
])('recovers malformed provider JSON without replaying completed tools: %s', async message => {
  const { agent, requests, execute } = await setup({ code: 'PI_AI_ERROR', message }, 1, { completedTool: true })
  expect(requests).toHaveLength(3)
  expect(execute).toHaveBeenCalledOnce()
  expect(agent.session.snapshotEvents().filter(e => e.type === 'llm/retry')).toHaveLength(1)
  expect(agent.session.deriveMessages().at(-1)?.content).toEqual([{ type: 'text', text: 'recovered' }])
})

it.each([
  { code: 'AUTH', message: flattenedUpstream.message },
  { code: 'PI_AI_ERROR', message: 'Unsupported parameter: upstream_error is not a valid option' },
  { code: 'PI_AI_ERROR', message: 'pi-ai deferred response for model "gpt-6.1-sol" is not supported' },
  { code: 'PI_AI_ERROR', message: '{"error":{"type":"invalid_request_error","message":"Invalid value"}}' },
  { code: 'PI_AI_ERROR', message: '{"error":{"type":"authentication_error","message":"Invalid API key"}}' },
  { code: 'ABORTED', message: 'user cancelled' },
  { code: 'QUOTA_EXCEEDED', message: 'quota exhausted' },
  { code: 'INVALID_REQUEST', message: 'Unexpected end of JSON input' },
])('does not retry other failures: $code / $message', async failure => {
  const { requests } = await setup(failure, Infinity)
  expect(requests).toHaveLength(1)
})

it.each([
  'pi-ai stream for model "gpt-6.1-sol" ended pending',
  'pi-ai stream error',
  'Unrecognized upstream gateway failure',
])('bounds recovery of unclassified provider failures without replaying tools: %s', async message => {
  const { agent, requests, execute } = await setup({ code: 'PI_AI_ERROR', message }, 5, { completedTool: true })
  expect(requests).toHaveLength(7)
  expect(execute).toHaveBeenCalledOnce()
  expect(agent.session.snapshotEvents().filter(e => e.type === 'llm/retry')).toHaveLength(5)
  expect(agent.session.deriveMessages().at(-1)?.content).toEqual([{ type: 'text', text: 'recovered' }])
})

it('also stops unclassified provider failures after five retries', async () => {
  const { agent, requests } = await setup({ code: 'PI_AI_ERROR', message: 'pi-ai stream error' }, Infinity)
  expect(requests).toHaveLength(6)
  expect(agent.session.snapshotEvents().filter(e => e.type === 'llm/retry')).toHaveLength(5)
})

it('retries the reported HTTP 400 upstream_error five times and completes the same turn', async () => {
  const { agent, requests } = await setup(upstream, 5)
  expect(requests).toHaveLength(6)
  const events = agent.session.snapshotEvents()
  expect(events.filter(e => e.type === 'llm/retry').map(e => e.data.retry)).toEqual([1, 2, 3, 4, 5])
  expect(events.filter(e => e.type === 'turn/start')).toHaveLength(1)
  expect(agent.session.deriveMessages().at(-1)?.content).toEqual([{ type: 'text', text: 'recovered' }])
  for (const request of requests) expect(request).toMatchObject({ model: 'gpt-6.1-sol', reasoningEffort: 'xhigh' })
})

it('stops after the fifth retry when the upstream remains unavailable', async () => {
  const { agent, requests } = await setup(upstream, Infinity)
  expect(requests).toHaveLength(6)
  expect(agent.session.snapshotEvents().filter(e => e.type === 'llm/retry')).toHaveLength(5)
})

it('recovers a truncated stream without committing its partial response', async () => {
  const { agent, requests } = await setup({ code: 'STREAM_CLOSED', message: 'stream ended without a terminal event' }, 1)
  expect(requests).toHaveLength(2)
  expect(agent.session.deriveMessages().at(-1)?.content).toEqual([{ type: 'text', text: 'recovered' }])
})

it('does not retry an actual invalid request', async () => {
  const { agent, requests } = await setup({ code: 'INVALID_REQUEST', message: 'API error (400): {"error":{"type":"invalid_request_error","message":"Unsupported parameter"}}' }, Infinity)
  expect(requests).toHaveLength(1)
  expect(agent.session.snapshotEvents().filter(e => e.type === 'llm/retry')).toHaveLength(0)
})

it('normalizes both direct and frozen pi-ai calls while preserving the exact request', async () => {
  const stream = vi.fn(async function* (_options: GenerateOptions): AsyncIterable<StreamChunk> {
    yield { type: 'finish', reason: { kind: 'error', failure: upstream } }
  })
  vi.spyOn(PiAiAdapter.prototype, 'stream').mockImplementation(stream)
  vi.spyOn(PiAiAdapter.prototype, 'prepareCall').mockResolvedValue({ model: { provider: 'route', id: 'gpt-6.1-sol', name: 'gpt-6.1-sol' }, stream })
  const adapter = new ManagedPiAiAdapter({ profiles: () => new Map(), resolveApiKey: async () => 'test-only' })
  const options: GenerateOptions = { provider: 'route', model: 'gpt-6.1-sol', messages: [], reasoningEffort: ReasoningEffortId('xhigh') }
  for (const source of [adapter.stream(options), (await adapter.prepareCall('route', options.model)).stream(options)]) {
    const chunks = []
    for await (const chunk of source) chunks.push(chunk)
    expect(chunks).toMatchObject([{ type: 'finish', reason: { kind: 'error', failure: { code: 'SERVER', message: upstream.message } } }])
  }
  expect(stream.mock.calls.every(([request]) => request === options)).toBe(true)
})
