export type ZeroWallPluginTypes = Record<string, never>

/** Advisory metadata only: consumers must filter names through their scoped registry. */
export interface TaskRouteHint {
  id: string
  skills: readonly string[]
  tools: readonly string[]
}

export interface TaskRoutingService {
  terms(query: string): readonly string[]
  match(query: string): readonly TaskRouteHint[]
  isContinuation(query: string): boolean
}
