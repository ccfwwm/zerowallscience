import { Context } from '@deepseek-ai/cordis'
import { expect, it, vi } from 'vitest'
import { installDefaultReasoning } from '../src/host/reasoning-default.js'

it('applies High to the routed request and preserves explicit effort, model and other parameters', async () => {
  const ctx = new Context()
  const resolveModelInfo = vi.fn(async () => ({ reasoning: { efforts: [{ id: 'high', name: 'High' }] } }))
  ctx.provide('llm', { resolveModelInfo } as any)
  installDefaultReasoning(ctx)
  // Reproduce the later session selection waterfall that removes inherited effort.
  ctx.on('agent/request', async (_payload, next) => ({ ...await next(), provider: 'selected-provider', model: 'selected-model' }))
  const run = (config: any) => ctx.waterfall('agent/request', { signal: new AbortController().signal, turn: 1, step: 1 }, async () => config)
  expect(await run({ maxTokens: 12345 })).toEqual({ provider: 'selected-provider', model: 'selected-model', reasoningEffort: 'high', maxTokens: 12345 })
  for (const effort of ['low', 'xhigh', 'off']) expect((await run({ reasoningEffort: effort })).reasoningEffort).toBe(effort)
  resolveModelInfo.mockResolvedValueOnce({ reasoning: { efforts: [] } })
  expect((await run({})).reasoningEffort).toBeUndefined()
  await ctx.fiber.dispose()
})
