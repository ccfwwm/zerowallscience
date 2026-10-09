import type { CostReport, UsageRecord } from './baseline.js'
import { costFromUsage } from './baseline.js'
import type { BillingConfig } from './baseline.js'

export type ExperimentGroup = 'A' | 'B' | 'C' | 'D' | 'E'

export interface TaskResult {
  readonly group: ExperimentGroup
  readonly task: string
  readonly success: boolean
  readonly failureReason?: string
  readonly requests: number
  readonly usage: UsageRecord
  readonly searches: number
  readonly repeatedDiscoveries: number
  readonly parameterErrors: number
  readonly compressionCharactersSaved: number
  readonly rereadCharacters: number
}

export interface ExperimentSummary {
  readonly group: ExperimentGroup
  readonly tasks: number
  readonly successes: number
  readonly cost: CostReport
  readonly requests: number
  readonly searches: number
  readonly repeatedDiscoveries: number
  readonly parameterErrors: number
  readonly compressionCharactersSaved: number
  readonly rereadCharacters: number
  readonly paidRun: 'not-executed'
}

export function summarizeGroup(
  group: ExperimentGroup,
  results: readonly TaskResult[],
  billing: BillingConfig | undefined,
): ExperimentSummary {
  const successes = results.filter(result => result.success).length
  const requests = results.reduce((total, result) => total + result.requests, 0)
  const inputTokens = results.every(result => result.usage.inputTokens !== undefined)
    ? results.reduce((total, result) => total + (result.usage.inputTokens ?? 0), 0)
    : undefined
  const cached = results.every(result => result.usage.cachedInputTokens !== undefined)
    ? results.reduce((total, result) => total + (result.usage.cachedInputTokens ?? 0), 0)
    : undefined
  const output = results.every(result => result.usage.outputTokens !== undefined)
    ? results.reduce((total, result) => total + (result.usage.outputTokens ?? 0), 0)
    : undefined
  const usage: UsageRecord = inputTokens === undefined
    ? { source: 'unknown' }
    : {
        source: 'server',
        inputTokens,
        ...(cached === undefined ? {} : { cachedInputTokens: cached }),
        ...(output === undefined ? {} : { outputTokens: output }),
      }
  return {
    group,
    tasks: results.length,
    successes,
    cost: costFromUsage(usage.source === 'server' && output !== undefined ? usage : { source: 'unknown' }, billing),
    requests,
    searches: results.reduce((total, result) => total + result.searches, 0),
    repeatedDiscoveries: results.reduce((total, result) => total + result.repeatedDiscoveries, 0),
    parameterErrors: results.reduce((total, result) => total + result.parameterErrors, 0),
    compressionCharactersSaved: results.reduce((total, result) => total + result.compressionCharactersSaved, 0),
    rereadCharacters: results.reduce((total, result) => total + result.rereadCharacters, 0),
    paidRun: 'not-executed',
  }
}
