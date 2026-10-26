export const tokenKeys = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens'] as const
export type ClaudeTokenKey = (typeof tokenKeys)[number]

/** SDK counters are disjoint. Undefined means unreported, never an implicit zero. */
export interface ClaudeTokenCounts {
  inputTokens?: number | undefined
  outputTokens?: number | undefined
  cacheReadTokens?: number | undefined
  cacheWriteTokens?: number | undefined
  /** Buckets whose totals are partial because one or more requests omitted them. */
  incomplete?: ClaudeTokenKey[] | undefined
}
export interface ClaudeContextReading {
  model: string
  usedTokens: number
  contextWindow: number
}
/** Complete replacement snapshot for one plugin-owned query invocation. */
export interface ClaudeRunMetrics {
  runId: string
  nativeSessionId: string
  provider: string
  model: string
  turn: number
  main: boolean
  finished: boolean
  settled: boolean
  models: Record<string, ClaudeTokenCounts>
  steps: number
  decodeTokens: number
  decodeMs: number
  modelMs: number
  context: ClaudeContextReading | null
}
export interface ClaudeMetrics {
  models: Record<string, ClaudeTokenCounts>
  usage: ClaudeTokenCounts
  turns: number
  steps: number
  decodeTokens: number
  decodeMs: number
  modelMs: number
  incomplete: boolean
  context: ClaudeContextReading | null
}
export function sumCounts(rows: readonly ClaudeTokenCounts[]): ClaudeTokenCounts {
  const result: ClaudeTokenCounts = {}
  const incomplete = new Set<(typeof tokenKeys)[number]>()
  for (const key of tokenKeys) {
    const reported = rows.filter(row => row[key] !== undefined)
    // Keep confirmed values while recording that an omitted request bucket
    // makes the aggregate partial. This lets the UI show evidence without a
    // misleading total or implicit zero.
    if (reported.length) result[key] = reported.reduce((sum, row) => sum + row[key]!, 0)
    if (rows.some(row => row[key] === undefined || row.incomplete?.includes(key))) incomplete.add(key)
  }
  if (incomplete.size) result.incomplete = [...incomplete]
  return result
}
export function inputTotal(value: ClaudeTokenCounts): number | undefined {
  if (value.incomplete?.some(key => key === 'inputTokens' || key === 'cacheReadTokens' || key === 'cacheWriteTokens')) return undefined
  return value.inputTokens === undefined || value.cacheReadTokens === undefined || value.cacheWriteTokens === undefined
    ? undefined : value.inputTokens + value.cacheReadTokens + value.cacheWriteTokens
}
export function tokenTotal(value: ClaudeTokenCounts): number | undefined {
  if (value.incomplete?.length) return undefined
  const input = inputTotal(value)
  return input === undefined || value.outputTokens === undefined ? undefined : input + value.outputTokens
}
declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap { 'zerowall-claude/metrics': ClaudeRunMetrics }
}
declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap { zerowallClaudeMetrics: ClaudeMetrics }
}
