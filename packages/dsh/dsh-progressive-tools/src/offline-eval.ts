import { readFileSync } from 'node:fs'
import { costFromUsage } from './baseline.js'
import type { UsageRecord } from './baseline.js'
import { summarizeGroup } from './evaluate.js'
import type { ExperimentGroup, ExperimentSummary, TaskResult } from './evaluate.js'

export interface OfflineArm {
  readonly group: ExperimentGroup
  readonly label: string
  readonly modelVisibleCharacters: number
  readonly programValueCharacters: number
}

export interface OfflineComparison {
  readonly paidRun: 'not-executed'
  readonly reason: string
  readonly arms: readonly OfflineArm[]
  readonly summaries: readonly ExperimentSummary[]
}

export function compareOfflineArms(arms: readonly OfflineArm[]): OfflineComparison {
  const results: TaskResult[] = arms.map(arm => ({
    group: arm.group,
    task: arm.label,
    success: true,
    requests: 1,
    usage: { source: 'unknown' } satisfies UsageRecord,
    searches: arm.group === 'A' ? 0 : 1,
    repeatedDiscoveries: 0,
    parameterErrors: 0,
    compressionCharactersSaved: Math.max(0, arm.programValueCharacters - arm.modelVisibleCharacters),
    rereadCharacters: 0,
  }))
  return {
    paidRun: 'not-executed',
    reason: 'No server usage, price config, or live session was supplied. Character arms are fixture measurements, not a bill.',
    arms,
    summaries: (['A', 'B', 'C', 'D', 'E'] as const).map(group =>
      summarizeGroup(group, results.filter(result => result.group === group), undefined),
    ),
  }
}

export function redactedFixtureCost(path: string): { reason: 'unknown' | 'computed' } {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as { requests?: { usage?: UsageRecord }[] }
  const usage = parsed.requests?.[0]?.usage
  return { reason: costFromUsage(usage, undefined).reason }
}
