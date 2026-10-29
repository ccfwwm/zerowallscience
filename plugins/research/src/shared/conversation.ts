import type { ResearchJsonObject } from './types.js'

/** Stable identifiers used by conversation routing and optional scientific viewers. */
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

export type ResearchConversationEventType =
  | 'viewer.open' | 'viewer.focus' | 'asset.selected'
  | 'run.accepted' | 'run.progress' | 'run.completed' | 'run.failed' | 'run.cancelled'
  | 'artifact.created' | 'engine.status' | 'conversation.reply'

export type ResearchConversationEvent = {
  protocol: 'research-conversation/1'
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
  type: ResearchConversationEventType
  payload: ResearchJsonObject
  createdAt: string
}

export type ResearchConversationEventsResponse = {
  protocol: 'research-conversation/1'
  sessionId: string
  events: ResearchConversationEvent[]
  lastSequence: number
  hasMore: boolean
}

export function isScienceToolId(value: unknown): value is ScienceToolId {
  return typeof value === 'string' && ['home', 'imagej', 'he', 'molecule', 'sanger', 'flow', 'canvas', 'cells', 'sequence', 'brainglobe'].includes(value)
}

export function requireScienceTool(value: unknown): ScienceToolId {
  if (!isScienceToolId(value)) throw new Error(`Unknown research tool: ${String(value)}`)
  return value
}

export function eventJson(event: ResearchConversationEvent): ResearchJsonObject {
  return JSON.parse(JSON.stringify(event)) as ResearchJsonObject
}
