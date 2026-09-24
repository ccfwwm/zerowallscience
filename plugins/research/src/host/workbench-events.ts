import { randomUUID } from 'node:crypto'
import type { JsonObject, ResearchStore } from '@zerowallscience/research-store'
import type { ScienceWorkbenchEvent, ScienceWorkbenchEventType, ScienceWorkbenchEventsResponse, ScienceToolId } from '../shared/workbench.js'

/**
 * Durable event cursor for the workbench. Events are stored in the research
 * audit chain, so reconnecting a browser never depends on React memory and
 * does not re-run a scientific job.
 */
export class ScienceWorkbenchEventStore {
  constructor(private readonly store: ResearchStore) {}

  private all(projectId: string, sessionId: string): ScienceWorkbenchEvent[] {
    return this.store.listAuditEvents(projectId)
      .filter(item => item.action === 'science-workbench.event' && item.details.sessionId === sessionId)
      .map(item => item.details as unknown as ScienceWorkbenchEvent)
      .sort((a, b) => a.sequence - b.sequence)
  }

  append(input: {
    sessionId: string
    projectId: string
    type: ScienceWorkbenchEventType
    tool?: ScienceToolId
    studyId?: string
    assetId?: string
    artifactId?: string
    viewerId?: string
    runId?: string
    toolCallId?: string
    messageId?: string
    payload?: JsonObject
  }): ScienceWorkbenchEvent {
    const sessionId = input.sessionId.trim()
    if (!sessionId) throw new Error('A workbench sessionId is required.')
    const prior = this.all(input.projectId, sessionId)
    const event: ScienceWorkbenchEvent = {
      protocol: 'science-workbench/1', eventId: randomUUID(), sequence: (prior.at(-1)?.sequence ?? 0) + 1,
      sessionId, type: input.type, payload: input.payload ?? {}, createdAt: new Date().toISOString(),
      ...(input.projectId ? { projectId: input.projectId } : {}), ...(input.studyId ? { studyId: input.studyId } : {}),
      ...(input.tool ? { tool: input.tool } : {}), ...(input.assetId ? { assetId: input.assetId } : {}),
      ...(input.artifactId ? { artifactId: input.artifactId } : {}), ...(input.viewerId ? { viewerId: input.viewerId } : {}),
      ...(input.runId ? { runId: input.runId } : {}), ...(input.toolCallId ? { toolCallId: input.toolCallId } : {}),
      ...(input.messageId ? { messageId: input.messageId } : {}),
    }
    // eventId lives in the redacted details payload. Audit entityId is a
    // research graph foreign key and cannot safely contain an event UUID.
    this.store.recordAuditEvent(input.projectId, 'science-workbench.event', event as unknown as JsonObject)
    return event
  }

  events(projectId: string, sessionId: string, afterSequence = 0, limit = 200): ScienceWorkbenchEvent[] {
    const boundedAfter = Number.isFinite(afterSequence) && afterSequence >= 0 ? Math.floor(afterSequence) : 0
    const boundedLimit = Math.min(1000, Math.max(1, Math.floor(limit || 200)))
    return this.all(projectId, sessionId)
      .filter(item => Number(item.sequence) > boundedAfter)
      .slice(0, boundedLimit)
  }

  latestRequest(projectId: string, sessionId: string, requestId: string): ScienceWorkbenchEvent | undefined {
    const wanted = requestId.trim()
    if (!wanted) return undefined
    return this.all(projectId, sessionId).filter(event => event.payload.requestId === wanted).at(-1)
  }

  ownsRun(projectId: string, sessionId: string, runId: string): boolean {
    return this.all(projectId, sessionId).some(event => event.runId === runId || event.payload.runId === runId)
  }

  read(projectId: string, sessionId: string, afterSequence = 0, limit = 200): ScienceWorkbenchEventsResponse {
    const boundedLimit = Math.min(500, Math.max(1, Math.floor(limit || 200)))
    const page = this.events(projectId, sessionId, afterSequence, boundedLimit + 1)
    const events = page.slice(0, boundedLimit)
    const all = this.all(projectId, sessionId)
    const lastSequence = all.at(-1)?.sequence ?? (Number(afterSequence) || 0)
    return { protocol: 'science-workbench/1', sessionId, events, lastSequence, hasMore: page.length > boundedLimit }
  }
}
