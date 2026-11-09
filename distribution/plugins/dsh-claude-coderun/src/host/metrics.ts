import { inputTotal, sumCounts, tokenKeys, tokenTotal, type ClaudeRunMetrics, type ClaudeTokenCounts, type ClaudeTokenKey } from '../shared/metrics.js'

type Row = Record<string, unknown>
const row = (value: unknown): Row | undefined => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Row : undefined
const count = (value: unknown): number | undefined => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined
function counters(value: unknown, model = false): ClaudeTokenCounts {
  const source = row(value) ?? {}, result: ClaudeTokenCounts = {}
  const sourceKeys: Record<ClaudeTokenKey, string> = model ? {
    inputTokens: 'inputTokens', outputTokens: 'outputTokens', cacheReadTokens: 'cacheReadInputTokens', cacheWriteTokens: 'cacheCreationInputTokens',
  } : { inputTokens: 'input_tokens', outputTokens: 'output_tokens', cacheReadTokens: 'cache_read_input_tokens', cacheWriteTokens: 'cache_creation_input_tokens' }
  for (const target of tokenKeys) {
    const key = sourceKeys[target]
    const value = count(source[key])
    if (value !== undefined) result[target] = value
  }
  const missing: ClaudeTokenKey[] = tokenKeys.filter(target => !Object.hasOwn(source, sourceKeys[target]))
  if (missing.length) result.incomplete = missing
  return result
}
function mergeUsage(current: ClaudeTokenCounts, patch: ClaudeTokenCounts): ClaudeTokenCounts {
  const incomplete: ClaudeTokenKey[] = [...(current.incomplete ?? [])]
  const result: ClaudeTokenCounts = { ...current, incomplete }
  for (const key of tokenKeys) {
    if (patch[key] === undefined) continue
    result[key] = patch[key]
    incomplete.splice(0, incomplete.length, ...incomplete.filter(item => item !== key))
  }
  if (!incomplete.length) {
    const { incomplete: _incomplete, ...complete } = result
    return complete
  }
  return result
}
interface RequestSample {
  model: string
  parent: string
  usage: ClaudeTokenCounts
  start: number
  first?: number
  end?: number
  outputConfirmed: boolean
}

/** One collector per query, including resumed queries. Never reads native history. */
export class ClaudeMetricsCollector {
  private samples = new Map<string, RequestSample>()
  private active = new Map<string, string>()
  private windows = new Map<string, number>()
  private latest: string | undefined
  private finalModels: Record<string, ClaudeTokenCounts> | undefined
  private finished = false
  constructor(private readonly identity: Pick<ClaudeRunMetrics, 'runId' | 'nativeSessionId' | 'provider' | 'model' | 'turn' | 'main'>,
    private readonly clock = Date.now, private readonly resumed = false) {}

  observe(value: unknown): boolean {
    const event = row(value)
    if (!event) return false
    const parent = typeof event.parent_tool_use_id === 'string' ? event.parent_tool_use_id : ''
    if (event.type === 'system' && event.subtype === 'compact_boundary') {
      if (!parent) this.latest = undefined
      return true
    }
    if (event.type === 'stream_event') {
      const body = row(event.event)
      if (!body) return false
      if (body.type === 'message_start') {
        const message = row(body.message)
        if (typeof message?.id !== 'string' || typeof message.model !== 'string') return false
        const key = JSON.stringify([parent, message.id])
        const existing = this.samples.get(key)
        if (!existing) this.samples.set(key, { model: message.model, parent, usage: counters(message.usage), start: this.clock(), outputConfirmed: false })
        this.active.set(parent, key)
        if (!parent && !existing) this.latest = key
        return !existing
      }
      const sample = this.samples.get(this.active.get(parent) ?? '')
      if (!sample) return false
      if (body.type === 'content_block_delta') {
        const delta = row(body.delta)
        if (sample.first === undefined && (typeof delta?.text === 'string' && delta.text.length > 0
          || typeof delta?.thinking === 'string' && delta.thinking.length > 0 || typeof delta?.partial_json === 'string' && delta.partial_json.length > 0)) sample.first = this.clock()
      }
      if (body.type === 'message_delta') {
        const next = counters(body.usage)
        if (next.outputTokens !== undefined) sample.outputConfirmed = true
        sample.usage = mergeUsage(sample.usage, next)
        return Object.keys(next).length > 0
      }
      if (body.type === 'message_stop' && sample.end === undefined) { sample.end = this.clock(); return true }
    }
    if (event.type === 'assistant') {
      const message = row(event.message)
      if (typeof message?.id !== 'string' || typeof message.model !== 'string' || message.model === '<synthetic>') return false
      const key = JSON.stringify([parent, message.id])
      // Complete assistant frames may repeat per block and carry placeholder output counts.
      if (this.samples.has(key)) return false
      const usage = counters(message.usage)
      const { outputTokens: _outputTokens, ...withoutOutput } = usage
      const incomplete: ClaudeTokenKey[] = [...new Set<ClaudeTokenKey>([...(withoutOutput.incomplete ?? []), 'outputTokens'])]
      const provisional: ClaudeTokenCounts = { ...withoutOutput, incomplete }
      this.samples.set(key, { model: message.model, parent, usage: provisional, start: this.clock(), outputConfirmed: false })
      if (!parent) this.latest = key
      return true
    }
    if (event.type === 'result') {
      const cumulative = row(event.modelUsage)
      // CLI 2.1.309 restores modelUsage on resume, despite SDK 0.3.263's
      // older "resumed sessions start fresh" type comment. The CLI's explicit
      // delta covers the same whole query tree without importing pre-upgrade
      // spend. Never infer an old-session baseline by scanning native logs.
      const source = row(event.model_usage_since_last_result) ?? (this.resumed ? undefined : cumulative)
      for (const [model, value] of Object.entries(cumulative ?? {})) {
        const window = count(row(value)?.contextWindow)
        if (window) this.windows.set(model, window)
      }
      if (source) {
        const models: Record<string, ClaudeTokenCounts> = Object.create(null)
        for (const [model, value] of Object.entries(source)) {
          if (model.length > 512) continue
          const usage = counters(value, true)
          if (Object.keys(usage).length) models[model] = usage
          const window = count(row(value)?.contextWindow)
          if (window) this.windows.set(model, window)
        }
        // Crash/startup results sometimes carry zeroed accounting. Preserve real partial samples.
        const hasActual = [...this.samples.values()].some(sample => tokenKeys.some(key => sample.usage[key] !== undefined && sample.usage[key]! > 0))
        if (Object.keys(models).length && !(event.is_error === true && hasActual && Object.values(models).every(value => tokenTotal(value) === 0))) this.finalModels = models
      }
      this.finished = true
      return true
    }
    return false
  }

  snapshot(finished = this.finished): ClaudeRunMetrics {
    const groups: Record<string, ClaudeTokenCounts[]> = Object.create(null)
    let steps = 0, decodeTokens = 0, decodeMs = 0, modelMs = 0
    for (const sample of this.samples.values()) {
      const usage = { ...sample.usage }
      if (!sample.outputConfirmed) delete usage.outputTokens
      ;(groups[sample.model] ??= []).push(usage)
      if (sample.parent || !this.identity.main || sample.end === undefined) continue
      steps++
      modelMs += Math.max(0, sample.end - sample.start)
      if (sample.first !== undefined && sample.end > sample.first && sample.outputConfirmed && sample.usage.outputTokens !== undefined) {
        decodeTokens += sample.usage.outputTokens
        decodeMs += sample.end - sample.first
      }
    }
    const models: Record<string, ClaudeTokenCounts> = Object.create(null)
    for (const [model, values] of Object.entries(groups)) models[model] = sumCounts(values)
    const sample = this.samples.get(this.latest ?? '')
    const used = sample ? inputTotal(sample.usage) : undefined
    const contextWindow = sample && this.windows.get(sample.model)
    return { ...this.identity, finished, settled: this.finalModels !== undefined, models: this.finalModels ?? models,
      steps, decodeTokens, decodeMs, modelMs,
      context: this.identity.main && sample && used !== undefined && contextWindow ? {
        model: sample.model, usedTokens: used + (sample.outputConfirmed ? sample.usage.outputTokens ?? 0 : 0), contextWindow,
      } : null }
  }
}
