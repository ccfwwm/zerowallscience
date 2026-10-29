import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ResearchStore } from '../../research-store/src/index.js'
import { ResearchConversationEventStore } from '../src/host/conversation-events.js'
import { scienceViewerAction, scienceViewerTitle } from '../src/host/conversation-router.js'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'science-conversation-events-'))
  const store = new ResearchStore(join(root, 'research.sqlite'))
  const project = store.createProject({ name: 'Research conversation', rootPath: root })
  const events = new ResearchConversationEventStore(store)
  cleanups.push(async () => { store.close(); await rm(root, { recursive: true, force: true }) })
  return { store, project, events }
}

describe('ResearchConversationEventStore', () => {
  it('persists per-session monotonic events and replays after a cursor', async () => {
    const { events, project, store } = await fixture()
    const first = events.append({ sessionId: 's1', projectId: project.id, type: 'viewer.open', tool: 'imagej', payload: { requestId: 'r1' } })
    const second = events.append({ sessionId: 's1', projectId: project.id, type: 'run.accepted', tool: 'imagej', runId: 'run-1' })
    events.append({ sessionId: 's2', projectId: project.id, type: 'viewer.open', tool: 'he' })
    expect(second.sequence).toBe(first.sequence + 1)
    expect(events.read(project.id, 's1', first.sequence)).toMatchObject({ sessionId: 's1', events: [{ eventId: second.eventId, sequence: 2 }], lastSequence: 2, hasMore: false })
    expect(store.listAuditEvents(project.id).filter(item => item.action === 'research-conversation.event')).toHaveLength(3)
    expect(first).toMatchObject({ protocol: 'research-conversation/1', type: 'viewer.open' })
  })

  it('reads legacy workbench events as conversation events for idempotent retries', async () => {
    const { events, project, store } = await fixture()
    store.recordAuditEvent(project.id, 'science-workbench.event', {
      protocol: 'science-workbench/1', eventId: 'old-event', sequence: 1, sessionId: 's1',
      type: 'tab.open', tool: 'imagej', payload: { requestId: 'legacy-request' }, createdAt: new Date().toISOString(),
    })
    expect(events.latestRequest(project.id, 's1', 'legacy-request')).toMatchObject({
      protocol: 'research-conversation/1', type: 'viewer.open', eventId: 'old-event',
    })
    expect(events.append({ sessionId: 's1', projectId: project.id, type: 'run.accepted' }).sequence).toBe(2)
  })

  it('bounds a replay page and leaves the cursor usable', async () => {
    const { events, project } = await fixture()
    for (let i = 0; i < 3; i++) events.append({ sessionId: 's1', projectId: project.id, type: 'run.progress', payload: { index: i } })
    const page = events.read(project.id, 's1', 0, 2)
    expect(page.events).toHaveLength(2)
    expect(page.hasMore).toBe(true)
    expect(page.events[1]?.sequence).toBe(2)
  })
})

describe('conversation research router helpers', () => {
  it('maps tool actions to existing science viewer actions', () => {
    expect(scienceViewerAction('imagej')).toBe('image_open')
    expect(scienceViewerAction('cells', 'analyze')).toBe('cell_analyze')
    expect(scienceViewerAction('he', 'he_segment')).toBe('he_segment')
    expect(scienceViewerAction('cells', 'cells_open')).toBe('cell_open')
    expect(scienceViewerAction('brainglobe', 'brainglobe_open')).toBe('brain_open')
    expect(() => scienceViewerAction('brainglobe')).toThrow(/requires an explicit operation/u)
    expect(scienceViewerAction('canvas', 'canvas_open')).toBe('canvas_render')
    expect(() => scienceViewerAction('he', 'he_unknown')).toThrow(/Unsupported research operation/u)
    expect(scienceViewerTitle('brainglobe')).toBe('脑图谱')
  })
})
