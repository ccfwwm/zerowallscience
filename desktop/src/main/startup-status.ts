import type { StartupStatus } from '../shared/contracts.js'

/** Progress events cannot overwrite a terminal failure or completed startup. */
export function nextStartupStatus(current: StartupStatus, update: Partial<StartupStatus>, now = Date.now()): StartupStatus {
  if (current.phase !== 'starting' && update.phase === undefined) return current
  const next = { ...current, segment: undefined, durationMs: undefined, ...update }
  if (update.phase === 'starting') {
    next.startedAt = now
    next.finishedAt = undefined
    next.diagnostics = undefined
  } else if (update.phase === 'failed' || update.phase === 'ready') next.finishedAt = now
  return next
}
