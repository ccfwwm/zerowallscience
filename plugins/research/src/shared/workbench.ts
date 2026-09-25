import type { JsonObject } from '@zerowallscience/research-store/types'

/** Stable identifiers used by the conversation router and the workbench UI. */
export type ScienceToolId =
  | 'home' | 'imagej' | 'he' | 'molecule' | 'sanger' | 'flow' | 'canvas'
  | 'cells' | 'sequence' | 'brainglobe'

export type ResearchViewerState =
  | 'empty' | 'importing' | 'loading' | 'ready'
  | 'engine-unconfigured' | 'failed' | 'process-started'

export type ResearchToolDescriptor = {
  id: string
  title: string
  description: string
  image: string
  acceptedExtensions: string[]
  viewerRoute: string
  skillId: string
}

export type ScienceTab = {
  id: string
  tool: ScienceToolId
  title: string
  sessionId: string
  projectId?: string | undefined
  studyId?: string | undefined
  assetId?: string | undefined
  artifactId?: string | undefined
  viewerId?: string | undefined
  runId?: string | undefined
  /**
   * Bumped whenever the same asset is selected again, so a viewer can tell a
   * repeat selection of the current file from a no-op re-render and re-run its
   * open action instead of ignoring the click.
   */
  revision?: number | undefined
  dirty: boolean
  lastFocusedAt: string
}

export type ScienceWorkbenchEventType =
  | 'tab.open' | 'tab.focus' | 'asset.selected'
  | 'run.accepted' | 'run.progress' | 'run.completed' | 'run.failed' | 'run.cancelled'
  | 'artifact.created' | 'engine.status' | 'conversation.reply'

export type ScienceWorkbenchEvent = {
  protocol: 'science-workbench/1'
  eventId: string
  sequence: number
  sessionId: string
  projectId?: string
  studyId?: string
  tool?: ScienceToolId
  assetId?: string
  artifactId?: string
  viewerId?: string
  runId?: string
  toolCallId?: string
  messageId?: string
  type: ScienceWorkbenchEventType
  payload: JsonObject
  createdAt: string
}

export type ScienceWorkbenchAction = 'open' | 'focus' | 'analyze' | 'status' | 'cancel' | 'export' | 'engine'

export type ScienceWorkbenchRequest = {
  action: ScienceWorkbenchAction
  sessionId: string
  projectId?: string
  studyId?: string
  tool?: ScienceToolId
  assetId?: string
  artifactId?: string
  viewerId?: string
  runId?: string
  operation?: string
  skillId?: string
  actionId?: string
  parameters?: JsonObject
  requestId: string
  expectedRevision?: number
}

export type ScienceWorkbenchEventsResponse = {
  protocol: 'science-workbench/1'
  sessionId: string
  events: ScienceWorkbenchEvent[]
  lastSequence: number
  hasMore: boolean
}

export function isScienceToolId(value: unknown): value is ScienceToolId {
  return typeof value === 'string' && ['home', 'imagej', 'he', 'molecule', 'sanger', 'flow', 'canvas', 'cells', 'sequence', 'brainglobe'].includes(value)
}

export function requireScienceTool(value: unknown): ScienceToolId {
  if (!isScienceToolId(value)) throw new Error(`Unknown science workbench tool: ${String(value)}`)
  return value
}

export function eventJson(event: ScienceWorkbenchEvent): JsonObject {
  return JSON.parse(JSON.stringify(event)) as JsonObject
}
