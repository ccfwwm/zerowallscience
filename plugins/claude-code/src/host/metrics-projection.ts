import { z } from 'zod'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import { sumCounts, type ClaudeMetrics, type ClaudeRunMetrics, type ClaudeTokenCounts } from '../shared/metrics.js'

const number = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const counts = z.object({ inputTokens: number.optional(), outputTokens: number.optional(), cacheReadTokens: number.optional(), cacheWriteTokens: number.optional(), incomplete: z.array(z.enum(['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens'])).optional() }).strict()
const context = z.object({ model: z.string(), usedTokens: number, contextWindow: number.positive() }).strict().nullable()
const route = z.object({ provider: z.string(), model: z.string() }).strict()
export const runMetricsSchema = z.object({
  runId: z.string(), nativeSessionId: z.string(), provider: z.string(), model: z.string(), turn: number,
  main: z.boolean(), finished: z.boolean(), settled: z.boolean(), models: z.record(z.string(), counts),
  steps: number, decodeTokens: number, decodeMs: number, modelMs: number, context,
}).strict()
const storedRunSchema = runMetricsSchema.extend({ revision: number.optional() })
const stateSchema = z.object({
  runs: z.record(z.string(), storedRunSchema), latest: z.string().nullable(), invalidated: z.boolean(),
  nextRevision: number.optional(),
  contextAfterRevision: number.optional(),
  // This was added after the first projection records. Optional keeps those
  // snapshots replayable while guarding against late events from an older
  // model after the current route changes.
  route: route.nullable().optional(),
}).strict()
type State = z.infer<typeof stateSchema>
declare module '@deepseek-ai/dsh-session-projection/types' { interface SessionProjectionStateMap { zerowallClaudeMetrics: State } }
const viewSchema = z.object({ models: z.record(z.string(), counts), usage: counts, turns: number, steps: number,
  decodeTokens: number, decodeMs: number, modelMs: number, incomplete: z.boolean(), context }).strict()

export function metricsView(state: State): ClaudeMetrics {
  const runs = Object.values(state.runs)
  // Collectors normalize CLI cumulative results to this invocation's delta.
  // Upsert by run ID, including retries in the same DSH turn.
  const groups: Record<string, ClaudeTokenCounts[]> = Object.create(null)
  for (const run of runs) for (const [model, usage] of Object.entries(run.models)) (groups[model] ??= []).push(usage)
  const models: Record<string, ClaudeTokenCounts> = Object.create(null)
  for (const [model, values] of Object.entries(groups)) models[model] = sumCounts(values)
  const main = runs.filter(run => run.main)
  const sum = (key: 'steps' | 'decodeTokens' | 'decodeMs' | 'modelMs') => main.reduce((total, run) => total + run[key], 0)
  return { models, usage: sumCounts(Object.values(models)), turns: new Set(main.map(run => run.turn)).size,
    steps: sum('steps'), decodeTokens: sum('decodeTokens'), decodeMs: sum('decodeMs'), modelMs: sum('modelMs'),
    incomplete: runs.some(run => !run.settled) || Object.values(models).some(usage => Boolean(usage.incomplete?.length)),
    context: state.invalidated ? null : state.runs[state.latest ?? '']?.context ?? null }
}

export const claudeMetricsProjection = {
  key: 'zerowallClaudeMetrics', stateVersion: 1, stateSchema, init: () => ({ runs: {}, latest: null, invalidated: false, route: null, nextRevision: 1, contextAfterRevision: 0 }),
  apply: (state, event) => {
    if (event.type === 'zerowall-claude/metrics') {
      const parsed = runMetricsSchema.safeParse(event.data)
      if (!parsed.success) return state
      const run: ClaudeRunMetrics = parsed.data
      const previous = state.runs[run.runId]
      const revision = previous?.revision ?? state.nextRevision ?? 1
      const nextRevision = previous?.revision === undefined ? revision + 1 : state.nextRevision ?? revision + 1
      const savedRun = { ...run, revision }
      const runs = { ...state.runs, [run.runId]: savedRun }
      if (!run.main) return { ...state, runs, nextRevision }
      if (revision < (state.runs[state.latest ?? '']?.revision ?? 0)) return { ...state, runs, nextRevision }
      const activeRoute = state.route ?? null
      const sameRoute = activeRoute === null || (activeRoute.provider === run.provider && activeRoute.model === run.model)
      return { ...state, runs, latest: run.runId, invalidated: !sameRoute || revision < (state.contextAfterRevision ?? 0), nextRevision }
    }
    if (event.type === 'model/selection' || event.type === 'request/header') {
      const route = event.type === 'model/selection' ? event.data : event.data.header.config
      if (route && typeof route.provider === 'string' && typeof route.model === 'string') {
        const latest = state.runs[state.latest ?? '']
        const changed = state.route !== null && state.route !== undefined && (state.route.provider !== route.provider || state.route.model !== route.model)
        return { ...state, route: { provider: route.provider, model: route.model },
          contextAfterRevision: changed ? state.nextRevision ?? 1 : state.contextAfterRevision ?? 0,
          invalidated: changed || state.invalidated || latest === undefined || latest.provider !== route.provider || latest.model !== route.model }
      }
    }
    return state
  },
  wire: { viewSchema, view: metricsView },
} satisfies ProjectionDefinition<'zerowallClaudeMetrics', State>
