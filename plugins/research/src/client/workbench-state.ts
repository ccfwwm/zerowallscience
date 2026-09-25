import type { ScienceTab, ScienceToolId } from '../shared/workbench.js'

export type ScienceTabAction =
  | { type: 'open'; id: string; tool: ScienceToolId; title: string; sessionId: string; projectId?: string | undefined; studyId?: string | undefined; assetId?: string | undefined; artifactId?: string | undefined; viewerId?: string | undefined; runId?: string | undefined }
  | { type: 'focus'; id: string }
  /**
   * Re-add a panel the durable log says this session once had, without taking
   * the focus. Catch-up replays history, and a replayed `tab.open` that reached
   * `open` would move the user's selection to whatever the last recorded event
   * happened to be — the ImageJ tab losing focus to the brain atlas on a fresh
   * mount. Same tab-list effect as `open`, none of the navigation.
   */
  | { type: 'reopen'; id: string; tool: ScienceToolId; title: string; sessionId: string; projectId?: string | undefined; studyId?: string | undefined; assetId?: string | undefined; artifactId?: string | undefined; viewerId?: string | undefined; runId?: string | undefined }
  | { type: 'select'; id: string; assetId?: string | undefined; viewerId?: string | undefined; runId?: string | undefined; revision?: number | undefined }
  | { type: 'close'; id: string }
  /**
   * Drops the active selection without touching the tab list. Selecting 主页 is
   * a focus change, not a rewrite: re-dispatching `tabs` from a render closure
   * would replace the list with a stale copy and drop whatever the event poll
   * opened in the meantime.
   */
  | { type: 'blur' }
  | { type: 'restore'; tabs: ScienceTab[]; activeId?: string | null | undefined }

export type ScienceTabState = { tabs: ScienceTab[]; activeId?: string | undefined }

function now(): string { return new Date().toISOString() }

export function scienceTabReducer(state: ScienceTabState, action: ScienceTabAction): ScienceTabState {
  if (action.type === 'restore') return { tabs: action.tabs, activeId: action.activeId === null ? undefined : action.activeId && action.tabs.some(tab => tab.id === action.activeId) ? action.activeId : action.tabs[0]?.id }
  if (action.type === 'blur') return { tabs: state.tabs, activeId: undefined }
  const index = state.tabs.findIndex(tab => tab.id === action.id)
  if (action.type === 'open' || action.type === 'reopen') {
    const existing = state.tabs.find(tab => tab.id === action.id)
    const tab = existing ? { ...existing, title: action.title, lastFocusedAt: now(), ...(action.assetId ? { assetId: action.assetId } : {}), ...(action.viewerId ? { viewerId: action.viewerId } : {}), ...(action.runId ? { runId: action.runId } : {}) } : { id: action.id, tool: action.tool, title: action.title, sessionId: action.sessionId, projectId: action.projectId, studyId: action.studyId, assetId: action.assetId, artifactId: action.artifactId, viewerId: action.viewerId, runId: action.runId, dirty: false, lastFocusedAt: now() }
    // `reopen` touches the list only: a catch-up replay must not be able to
    // take the focus from the tab the user is actually looking at.
    // Replayed history restores the panel list only. It must never choose a
    // viewer as the active page when the workbench is mounted on its home
    // cards, including when this is the first tab being re-added.
    if (action.type === 'reopen') return { tabs: existing ? state.tabs.map(item => item.id === action.id ? tab : item) : [...state.tabs, tab], activeId: state.activeId }
    return { tabs: existing ? state.tabs.map(item => item.id === action.id ? tab : item) : [...state.tabs, tab], activeId: action.id }
  }
  if (index < 0) return state
  if (action.type === 'focus') return { tabs: state.tabs.map(tab => tab.id === action.id ? { ...tab, lastFocusedAt: now() } : tab), activeId: action.id }
  if (action.type === 'select') return { tabs: state.tabs.map(tab => tab.id === action.id ? { ...tab, assetId: action.assetId ?? tab.assetId, viewerId: action.viewerId ?? tab.viewerId, runId: action.runId ?? tab.runId, revision: action.revision ?? tab.revision ?? 0 } : tab), activeId: action.id }
  const tabs = state.tabs.filter(tab => tab.id !== action.id)
  return { tabs, activeId: state.activeId === action.id ? tabs[Math.max(0, index - 1)]?.id : state.activeId }
}
