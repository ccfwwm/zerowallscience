import { Context } from '@deepseek-ai/cordis'
import { expect, it } from 'vitest'
import { ownMediaRuntime } from '../src/shared-runtime.js'

it('keeps one real Cordis runtime until the last catalog identity is disabled', async () => {
  const ctx = new Context()
  let starts = 0, stops = 0
  const feature = { apply() { starts++; return () => { stops++ } } }
  const entry = { apply: (ctx: Context) => ownMediaRuntime(ctx, 'host', feature) }
  try {
    const old = ctx.plugin(entry); await old
    const renamed = ctx.plugin(entry); await renamed
    expect(starts).toBe(1)
    await old.dispose(); expect(stops).toBe(0)
    await renamed.dispose(); expect(stops).toBe(1)
    const enabledAgain = ctx.plugin(entry); await enabledAgain
    expect(starts).toBe(2)
    await enabledAgain.dispose(); expect(stops).toBe(2)
  } finally { await ctx.fiber.dispose() }
})
