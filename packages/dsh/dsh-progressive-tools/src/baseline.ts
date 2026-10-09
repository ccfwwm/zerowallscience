/**
 * Local size and cost accounting. Character counts, byte counts, estimated
 * tokens, and server usage are separate. Missing prices stay unknown.
 * Nothing here is written into a model-visible tool result.
 */

export interface UsageRecord {
  readonly source: 'server' | 'unknown'
  readonly inputTokens?: number
  readonly cachedInputTokens?: number
  readonly outputTokens?: number
}

export interface BillingConfig {
  readonly currency: string
  readonly inputPerMillion: number
  readonly cachedInputPerMillion: number
  readonly outputPerMillion: number
}

export interface CostReport {
  readonly currency: string
  readonly amount: number | null
  readonly reason: 'computed' | 'unknown'
}

export function costFromUsage(usage: UsageRecord | undefined, billing: BillingConfig | undefined): CostReport {
  if (usage?.source !== 'server' || billing === undefined
    || usage.inputTokens === undefined
    || usage.outputTokens === undefined) {
    return { currency: billing?.currency ?? 'unknown', amount: null, reason: 'unknown' }
  }
  const cached = usage.cachedInputTokens ?? 0
  const uncached = Math.max(0, usage.inputTokens - cached)
  const amount = (uncached * billing.inputPerMillion
    + cached * billing.cachedInputPerMillion
    + usage.outputTokens * billing.outputPerMillion) / 1_000_000
  return { currency: billing.currency, amount, reason: 'computed' }
}

export interface SizeMark {
  readonly characters: number
  readonly bytes: number
  readonly estimatedTokens: number
  readonly estimateBasis: 'characters-per-token'
}

export function markSize(text: string, charactersPerToken: number): SizeMark {
  return {
    characters: text.length,
    bytes: Buffer.byteLength(text),
    estimatedTokens: Math.ceil(text.length / charactersPerToken),
    estimateBasis: 'characters-per-token',
  }
}

export interface TraceEvent {
  readonly kind: 'discovery' | 'execution' | 'result' | 'lifecycle'
  readonly targetTool?: string
  readonly dispatcher?: string
  readonly parent?: string
  readonly characters?: number
  readonly note?: string
}

/** Attribute nested code execution to the real target, not the dispatcher. */
export function attributeTarget(chain: readonly string[]): string | undefined {
  const filtered = chain.filter(name => name !== 'run_code' && name !== 'tool_dispatch' && name !== 'tool_search')
  return filtered.at(-1)
}

export interface BaselineReport {
  readonly pluginVersion: string
  readonly hostVersion: string
  readonly config: unknown
  readonly catalogToolCount: number
  readonly requests: readonly {
    readonly index: number
    readonly input: SizeMark
    readonly usage: UsageRecord
    readonly cost: CostReport
  }[]
  readonly discovery: readonly TraceEvent[]
  readonly executions: readonly TraceEvent[]
  readonly omittedDefinitionTokens: number
  readonly omittedDefinitionNote: string
}

export function buildBaselineReport(input: {
  readonly pluginVersion: string
  readonly hostVersion: string
  readonly config: unknown
  readonly catalogToolCount: number
  readonly omittedDefinitionTokens: number
  readonly requestText: string
  readonly charactersPerToken: number
  readonly usage?: UsageRecord
  readonly billing?: BillingConfig
  readonly traces: readonly TraceEvent[]
}): BaselineReport {
  const usage = input.usage ?? { source: 'unknown' }
  return {
    pluginVersion: input.pluginVersion,
    hostVersion: input.hostVersion,
    config: input.config,
    catalogToolCount: input.catalogToolCount,
    requests: [{
      index: 1,
      input: markSize(input.requestText, input.charactersPerToken),
      usage,
      cost: costFromUsage(input.usage, input.billing),
    }],
    discovery: input.traces.filter(trace => trace.kind === 'discovery'),
    executions: input.traces.filter(trace => trace.kind === 'execution' || trace.kind === 'result'),
    omittedDefinitionTokens: input.omittedDefinitionTokens,
    omittedDefinitionNote: 'Estimate of deferred definitions absent from the top-level tool list. Not a net task saving and not a bill.',
  }
}
