import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import { expect, it } from 'vitest'
import { managedRetryPolicy, managedStream } from '../src/cloud/host/managed-adapter.js'

async function collect(chunks: StreamChunk[]): Promise<StreamChunk[]> {
  async function* source() { yield* chunks }
  const result: StreamChunk[] = []
  for await (const chunk of managedStream(source())) result.push(chunk)
  return result
}

it('classifies empty upstream length responses as retryable failures', async () => {
  const chunks = await collect([
    { type: 'usage', usage: { inputTokens: 0, outputTokens: 0 } },
    { type: 'finish', reason: { kind: 'max-tokens' } },
  ])
  expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'error', failure: { code: 'EMPTY_RESPONSE' } } })
  expect(managedRetryPolicy.retryableCodes).toContain('EMPTY_RESPONSE')
})

it.each<StreamChunk>([
  { type: 'text-delta', index: 0, text: 'partial' },
  { type: 'reasoning-delta', index: 0, text: 'thinking' },
  { type: 'usage', usage: { inputTokens: 12, outputTokens: 0, reasoningTokens: 100 } },
  { type: 'block-end', index: 0, block: { type: 'text', text: 'partial' } },
])('preserves actual truncation after generation: %j', async generated => {
  const finish: StreamChunk = { type: 'finish', reason: { kind: 'max-tokens' } }
  expect(await collect([generated, finish])).toEqual([generated, finish])
})
