import { afterEach, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { createUserMessage, LlmAdapter, LlmError, ReasoningEffortId, resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmFailure, StreamChunk } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjections from '../../../deepseek-harness/packages/session/session-projection/src/index.ts'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import Agents from '@deepseek-ai/dsh-agent'
import AgentLoop from '../../../deepseek-harness/packages/core/agent-loop/src/index.ts'
import * as retry from '../../../deepseek-harness/packages/llm/llm-retry/src/index.ts'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import { ManagedPiAiAdapter, managedRetryPolicy, managedStream } from '../src/host/managed-adapter.js'

const upstream: LlmFailure = {
  code: 'INVALID_REQUEST',
  message: 'zerowall-ai-cloud-56-responses API error (400): {"message":"Upstream request failed","type":"upstream_error"}',
}
const success: StreamChunk[] = [
  { type: 'block-start', index: 0, blockType: 'text' },
  { type: 'text-delta', index: 0, text: 'recovered' },
  { type: 'block-end', index: 0, block: { type: 'text', text: 'recovered' } },
  { type: 'finish', reason: { kind: 'stop' } },
]
let ctx: Context | undefined
afterEach(async () => { await ctx?.fiber.dispose(); ctx = undefined; vi.useRealTimers() })

async function setup(failure: LlmFailure, failures: number) {
  vi.useFakeTimers()
  const requests: GenerateOptions[] = []
  class Adapter extends LlmAdapter {
    override providerRetryPolicy() { return resolveRetryPolicy(managedRetryPolicy, 'test') }
    override async resolveModel(provider: string, model: string) {
      return { provider, id: model, name: model, reasoning: { efforts: [{ id: ReasoningEffortId('xhigh'), name: 'xhigh' }] } }
    }
    async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
      requests.push(options)
      yield* managedStream((async function* () {
        if (requests.length > failures) { yield* success; return }
        // Partial output belongs to the failed attempt, and is not a new turn.
        yield { type: 'block-start', index: 0, blockType: 'text' } as const
        yield { type: 'text-delta', index: 0, text: 'partial' } as const
        if (failure.code === 'STREAM_CLOSED') throw new LlmError(failure.message, failure.code)
        yield { type: 'finish', reason: { kind: 'error', failure } } as const
      })())
    }
  }
  ctx = new Context()
  for (const plugin of [LlmRuntime, SessionStore, SessionProjections, SystemPrompt, Tools, Agents]) await ctx.plugin(plugin)
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
  return { agent, requests }
}

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
