import { describe, expect, it } from 'vitest'
import { ClaudeMetricsCollector } from '../src/host/metrics.js'
import { claudeMetricsProjection, metricsView, runMetricsSchema } from '../src/host/metrics-projection.js'
import { inputTotal, sumCounts, tokenTotal } from '../src/shared/metrics.js'

const identity = { runId: 'r1', nativeSessionId: 'n1', provider: 'route', model: 'alias', turn: 1, main: true }
const raw = { input_tokens: 10, output_tokens: 1, cache_read_input_tokens: 60, cache_creation_input_tokens: 30 }
const model = { inputTokens: 10, outputTokens: 20, cacheReadInputTokens: 60, cacheCreationInputTokens: 30, contextWindow: 200_000 }
function fixture(extra = {}, resumed = false) {
  let now = 0
  const collector = new ClaudeMetricsCollector({ ...identity, ...extra }, () => now, resumed)
  const send = (event: unknown, time = now) => { now = time; return collector.observe(event) }
  const stream = (event: unknown, time = now, parent: string | null = null) => send({ type: 'stream_event', parent_tool_use_id: parent, event }, time)
  const start = (id = 'm1', time = now, parent: string | null = null) => stream({ type: 'message_start', message: { id, model: 'actual', usage: raw } }, time, parent)
  const finish = (id = 'm1', time = now) => {
    start(id, time)
    stream({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'x' } }, time + 100)
    stream({ type: 'message_delta', usage: { output_tokens: 20 } }, time + 1000)
    stream({ type: 'message_stop' }, time + 1100)
  }
  const result = (value: unknown = { actual: model }, error = false) => send({ type: 'result', modelUsage: value, is_error: error })
  return { collector, send, stream, start, finish, result }
}
describe('Claude SDK accounting', () => {
  it('replaces cumulative stream samples, ignores duplicated assistant blocks, and replaces provisional totals with whole-query modelUsage', () => {
    const f = fixture()
    f.finish()
    f.send({ type: 'assistant', message: { id: 'm1', model: 'actual', usage: raw } })
    f.send({ type: 'assistant', message: { id: 'm1', model: 'actual', usage: raw } })
    f.stream({ type: 'message_delta', usage: { output_tokens: 20 } })
    expect(f.collector.snapshot()).toMatchObject({ steps: 1, models: { actual: { inputTokens: 10, outputTokens: 20, cacheReadTokens: 60, cacheWriteTokens: 30 } } })
    f.result({ actual: { ...model, outputTokens: 70 }, helper: { ...model, outputTokens: 5 } })
    const snapshot = f.collector.snapshot()
    expect(snapshot.models.actual?.outputTokens).toBe(70)
    expect(tokenTotal(sumCounts(Object.values(snapshot.models)))).toBe(275)
    expect(snapshot.decodeTokens).toBe(20)
    expect(snapshot.context).toEqual({ model: 'actual', usedTokens: 120, contextWindow: 200000 })
  })
  it('excludes a long tool wait and nested-agent timing from weighted output speed', () => {
    const f = fixture()
    f.finish('m1', 0)
    f.finish('m2', 100000)
    f.start('nested', 200000, 'task-1')
    f.stream({ type: 'content_block_delta', delta: { text: 'child' } }, 200100, 'task-1')
    f.stream({ type: 'message_delta', usage: { output_tokens: 500 } }, 201000, 'task-1')
    f.stream({ type: 'message_stop' }, 201100, 'task-1')
    expect(f.collector.snapshot()).toMatchObject({ steps: 2, decodeTokens: 40, decodeMs: 2000, modelMs: 2200 })
  })
  it('counts tool argument and thinking output, without adding thinking tokens to output again', () => {
    const f = fixture(); f.start()
    f.stream({ type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'reason' } }, 100)
    f.stream({ type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{}' } }, 200)
    f.stream({ type: 'message_delta', usage: { output_tokens: 20 } }, 900)
    f.stream({ type: 'message_stop' }, 1100)
    f.result({ actual: { ...model, thinkingTokens: 12 } })
    expect(f.collector.snapshot()).toMatchObject({ decodeTokens: 20, decodeMs: 1000 })
    expect(tokenTotal(f.collector.snapshot().models.actual!)).toBe(120)
  })
  it('does not substitute assistant placeholder output counts for missing stream output', () => {
    const f = fixture(); f.send({ type: 'assistant', message: { id: 'm', model: 'actual', usage: raw } })
    expect(f.collector.snapshot().models.actual?.outputTokens).toBeUndefined()
    expect(f.collector.snapshot()).toMatchObject({ decodeMs: 0, context: null, settled: false })
  })
  it('keeps missing caches unknown, supports true zeroes, and rejects invalid counters', () => {
    const f = fixture(); f.result({ actual: { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: -1, cacheCreationInputTokens: NaN } })
    expect(f.collector.snapshot().models.actual).toEqual({ inputTokens: 0, outputTokens: 0 })
    expect(tokenTotal(f.collector.snapshot().models.actual!)).toBeUndefined()
    expect(inputTotal(sumCounts([{ inputTokens: 5 }, { inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }]))).toBeUndefined()
  })
  it('hides stale context after compaction until a subsequent main-loop sample', () => {
    const f = fixture(); f.finish(); f.result()
    expect(f.collector.snapshot().context).not.toBeNull()
    f.send({ type: 'system', subtype: 'compact_boundary', compact_metadata: { pre_tokens: 100000 } })
    expect(f.collector.snapshot().context).toBeNull()
    f.finish('m2', 10000)
    expect(f.collector.snapshot().context?.usedTokens).toBe(120)
  })
  it('does not borrow capacity from another model or guess a window', () => {
    const f = fixture(); f.finish(); f.result({ other: model })
    expect(f.collector.snapshot().context).toBeNull()
  })
  it('preserves reported partial data on cancellation and a zeroed crash result', () => {
    const f = fixture(); f.finish()
    f.result({ actual: { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 } }, true)
    expect(f.collector.snapshot(true)).toMatchObject({ finished: true, settled: false, models: { actual: { outputTokens: 20 } } })
  })
  it('never guesses decode duration when stream boundaries are missing', () => {
    const f = fixture(); f.start(); f.stream({ type: 'message_delta', usage: { output_tokens: 30 } }); f.stream({ type: 'message_stop' })
    expect(f.collector.snapshot().decodeMs).toBe(0)
  })
  it('uses the CLI 2.1.309 per-result delta on resume instead of importing restored historical spend', () => {
    const f = fixture({}, true); f.finish()
    f.send({ type: 'result', modelUsage: { actual: { ...model, inputTokens: 9999, outputTokens: 8888 } },
      model_usage_since_last_result: { actual: model, internal: { ...model, outputTokens: 7 } } })
    expect(f.collector.snapshot()).toMatchObject({ settled: true, models: { actual: { inputTokens: 10, outputTokens: 20 }, internal: { outputTokens: 7 } } })
    expect(f.collector.snapshot().context?.usedTokens).toBe(120)
  })
  it('does not invent a historical baseline when a resumed older CLI omits the delta', () => {
    const f = fixture({}, true); f.finish(); f.result({ actual: { ...model, inputTokens: 9999 } })
    expect(f.collector.snapshot()).toMatchObject({ settled: false, models: { actual: { inputTokens: 10, outputTokens: 20 } } })
  })
  it('keeps confirmed fields when another request omits one bucket', () => {
    const known = sumCounts([{ inputTokens: 5, outputTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 0 }, { inputTokens: 7, outputTokens: 3, cacheReadTokens: 8 }])
    expect(known).toEqual({ inputTokens: 12, outputTokens: 5, cacheReadTokens: 8, cacheWriteTokens: 0, incomplete: ['cacheWriteTokens'] })
    expect(tokenTotal(known)).toBeUndefined()
  })
  it('separates main and nested messages with the same provider message ID', () => {
    const f = fixture(); f.finish(); f.start('m1', 9000, 'task-1')
    f.stream({ type: 'message_delta', usage: { output_tokens: 3 } }, 9100, 'task-1')
    expect(f.collector.snapshot().models.actual?.outputTokens).toBe(23)
    expect(f.collector.snapshot().steps).toBe(1)
  })
})
describe('durable Claude metrics projection', () => {
  const fold = (state: ReturnType<typeof claudeMetricsProjection.init>, type: string, data: unknown) => claudeMetricsProjection.apply(state, { type, data } as never)
  const initial = () => claudeMetricsProjection.init()
  it('upserts snapshots and replays identical records without double counting', () => {
    const f = fixture(); f.finish(); f.result()
    let state = initial()
    for (let n = 0; n < 4; n++) state = fold(state, 'zerowall-claude/metrics', f.collector.snapshot())
    expect(metricsView(state)).toMatchObject({ turns: 1, steps: 1, usage: { inputTokens: 10, outputTokens: 20 } })
    expect(metricsView(state)).toEqual(metricsView(JSON.parse(JSON.stringify(state))))
  })
  it('adds fresh resumed-query totals exactly once across turns and counts external children only as usage', () => {
    let state = initial()
    for (const [extra, totals] of [[{}, { inputTokens: 10, outputTokens: 20, cacheReadInputTokens: 60, cacheCreationInputTokens: 30 }],
      [{ runId: 'r2', turn: 2 }, { inputTokens: 30, outputTokens: 60, cacheReadInputTokens: 120, cacheCreationInputTokens: 60 }],
      [{ runId: 'child', nativeSessionId: 'child-native', main: false }, { inputTokens: 10, outputTokens: 20, cacheReadInputTokens: 60, cacheCreationInputTokens: 30 }]] as const) {
      const resumed = 'runId' in extra && extra.runId === 'r2'
      const f = fixture(extra, resumed); f.finish()
      if (resumed) f.send({ type: 'result', modelUsage: { actual: totals }, model_usage_since_last_result: { actual: { ...totals, inputTokens: 20, outputTokens: 40 } } })
      else f.result({ actual: totals })
      state = fold(state, 'zerowall-claude/metrics', f.collector.snapshot())
    }
    expect(metricsView(state)).toMatchObject({ turns: 2, steps: 2, decodeTokens: 40, usage: { inputTokens: 40, outputTokens: 80 } })
  })
  it('upserts a retry in the same turn independently and cannot let late older frames restore its context', () => {
    const old = fixture(); old.finish(); old.result()
    let state = fold(initial(), 'zerowall-claude/metrics', old.collector.snapshot())
    const retry = fixture({ runId: 'retry' }); retry.finish('m2'); retry.result({ actual: { ...model, outputTokens: 30 } })
    state = fold(state, 'zerowall-claude/metrics', retry.collector.snapshot())
    const view = metricsView(state)
    state = fold(state, 'zerowall-claude/metrics', old.collector.snapshot())
    expect(metricsView(state)).toEqual(view)
    expect(view).toMatchObject({ turns: 1, steps: 2, usage: { outputTokens: 50 } })
  })
  it('keeps context invalid after switching away and back until a new run starts', () => {
    const f = fixture(); f.finish(); f.result()
    let state = fold(initial(), 'model/selection', { provider: 'route', model: 'alias' })
    state = fold(state, 'zerowall-claude/metrics', f.collector.snapshot())
    state = fold(state, 'model/selection', { provider: 'route', model: 'next' })
    state = fold(state, 'model/selection', { provider: 'route', model: 'alias' })
    state = fold(state, 'zerowall-claude/metrics', f.collector.snapshot())
    expect(metricsView(state).context).toBeNull()
  })
  it('invalidates context on selection/header changes but keeps recorded totals', () => {
    const f = fixture(); f.finish(); f.result()
    const state = fold(initial(), 'zerowall-claude/metrics', f.collector.snapshot())
    expect(metricsView(fold(state, 'model/selection', { provider: 'other', model: 'next' })).context).toBeNull()
    expect(metricsView(fold(state, 'request/header', { header: { config: { provider: 'route', model: 'next' } } })).usage).toEqual(metricsView(state).usage)
  })
  it('does not let a late old-model run restore context after a route change', () => {
    const old = fixture(); old.finish(); old.result()
    let state = fold(initial(), 'zerowall-claude/metrics', old.collector.snapshot())
    state = fold(state, 'model/selection', { provider: 'route', model: 'next' })
    expect(metricsView(state).context).toBeNull()
    const lateOld = fixture({ runId: 'late-old', model: 'old-alias' }); lateOld.finish(); lateOld.result()
    state = fold(state, 'zerowall-claude/metrics', lateOld.collector.snapshot())
    expect(metricsView(state).context).toBeNull()
    const fresh = fixture({ runId: 'fresh', model: 'next' }); fresh.finish(); fresh.result()
    state = fold(state, 'zerowall-claude/metrics', fresh.collector.snapshot())
    expect(metricsView(state).context?.model).toBe('actual')
  })
  it('invalidates previous context when starting a new binding and isolates sessions', () => {
    const f = fixture(); f.finish(); f.result()
    const state = fold(initial(), 'zerowall-claude/metrics', f.collector.snapshot())
    const fresh = fixture({ runId: 'r2', nativeSessionId: 'new-native', turn: 2 })
    expect(metricsView(fold(state, 'zerowall-claude/metrics', fresh.collector.snapshot())).context).toBeNull()
    expect(metricsView(initial()).usage).toEqual({})
  })
  it('validates persisted counter records and ignores malformed plugin events', () => {
    const f = fixture(); const bad = { ...f.collector.snapshot(), decodeMs: -1 }
    expect(runMetricsSchema.safeParse(bad).success).toBe(false)
    const state = initial(); expect(fold(state, 'zerowall-claude/metrics', bad)).toBe(state)
  })
})
