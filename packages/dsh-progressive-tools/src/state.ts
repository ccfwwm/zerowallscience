import { searchCatalog } from './catalog.js'
import type {
  ActiveGroupState,
  ResolvedConfig,
  SearchMatch,
  SearchResultValue,
  StateSnapshot,
  ToolCatalog,
} from './types.js'

export interface ProgressiveState {
  catalog: ToolCatalog
  readonly active: Map<string, ActiveGroupState>
  currentTurn: number
}

export function createProgressiveState(catalog: ToolCatalog, currentTurn = 0): ProgressiveState {
  return { catalog, active: new Map(), currentTurn }
}

export function snapshotState(state: ProgressiveState): StateSnapshot {
  return {
    activeGroups: [...state.active.values()].sort((left, right) => left.id.localeCompare(right.id)),
  }
}

export function restoreSnapshot(state: ProgressiveState, snapshot: StateSnapshot): void {
  state.active.clear()
  for (const entry of snapshot.activeGroups) {
    if (!state.catalog.groups.has(entry.id)) continue
    state.active.set(entry.id, { ...entry })
  }
}

function activeTokenEstimate(state: ProgressiveState): number {
  return [...state.active.keys()].reduce(
    (total, id) => total + (state.catalog.groups.get(id)?.estimatedTokens ?? 0),
    0,
  )
}

function evictToBudget(
  state: ProgressiveState,
  config: ResolvedConfig,
  protectedGroups: ReadonlySet<string>,
): string[] {
  const evicted: string[] = []
  const candidates = (): ActiveGroupState[] => [...state.active.values()]
    .filter(entry => !protectedGroups.has(entry.id))
    .sort((left, right) => left.lastUsedTurn - right.lastUsedTurn
      || left.activatedAtTurn - right.activatedAtTurn
      || left.id.localeCompare(right.id))
  while (state.active.size > config.maxActiveGroups || activeTokenEstimate(state) > config.maxActiveToolTokens) {
    const candidate = candidates()[0]
    if (candidate === undefined) break
    state.active.delete(candidate.id)
    evicted.push(candidate.id)
  }
  return evicted
}

export function activateGroups(
  state: ProgressiveState,
  groupIds: readonly string[],
  turn: number,
  config: ResolvedConfig,
): { activated: string[]; evicted: string[] } {
  const activated: string[] = []
  for (const id of groupIds) {
    if (!state.catalog.groups.has(id)) continue
    const current = state.active.get(id)
    state.active.set(id, {
      id,
      activatedAtTurn: current?.activatedAtTurn ?? turn,
      lastUsedTurn: turn,
    })
    activated.push(id)
  }
  return {
    activated,
    evicted: evictToBudget(state, config, new Set(activated)),
  }
}

export function expireGroups(state: ProgressiveState, turn: number, config: ResolvedConfig): string[] {
  if (config.retentionTurns === 0) return []
  const expired: string[] = []
  for (const entry of state.active.values()) {
    if (turn - entry.lastUsedTurn < config.retentionTurns) continue
    state.active.delete(entry.id)
    expired.push(entry.id)
  }
  return expired
}

export function touchTool(state: ProgressiveState, toolName: string, turn: number): void {
  const groupId = state.catalog.toolToGroup.get(toolName)
  if (groupId === undefined) return
  const current = state.active.get(groupId)
  if (current === undefined) return
  state.active.set(groupId, { ...current, lastUsedTurn: turn })
}

function resultValue(
  state: ProgressiveState,
  action: SearchResultValue['action'],
  query: string,
  matches: readonly SearchMatch[],
  activatedGroups: readonly string[],
  evictedGroups: readonly string[],
): SearchResultValue {
  const activeGroups = [...state.active.keys()].sort()
  const activeTools = activeGroups.flatMap(id =>
    state.catalog.groups.get(id)?.tools.map(tool => tool.name) ?? [],
  ).sort()
  const estimatedActiveTokens = activeTokenEstimate(state)
  return {
    protocol: 'dsh-progressive-tools/v1',
    action,
    query,
    matches,
    activatedGroups,
    evictedGroups,
    activeGroups,
    activeTools,
    estimatedActiveTokens,
    estimatedCatalogTokens: state.catalog.totalEstimatedTokens,
    estimatedSavedTokens: Math.max(0, state.catalog.totalEstimatedTokens - estimatedActiveTokens),
    catalogTools: state.catalog.tools.size,
    state: snapshotState(state),
  }
}

export function proposeSearch(
  source: ProgressiveState,
  action: SearchResultValue['action'],
  query: string,
  limit: number,
  config: ResolvedConfig,
): SearchResultValue {
  const state = createProgressiveState(source.catalog, source.currentTurn)
  restoreSnapshot(state, snapshotState(source))
  if (action === 'status') return resultValue(state, action, '', [], [], [])
  if (action === 'reset') {
    const evicted = [...state.active.keys()].sort()
    state.active.clear()
    return resultValue(state, action, '', [], [], evicted)
  }
  const matches = searchCatalog(state.catalog, query, limit)
  const selected = matches.slice(0, config.activationGroupLimit).map(match => match.group)
  const { activated, evicted } = activateGroups(state, selected, state.currentTurn, config)
  return resultValue(state, action, query, matches, activated, evicted)
}
