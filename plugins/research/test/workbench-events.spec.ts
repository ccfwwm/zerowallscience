import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ResearchStore } from '../../../store/src/index.js'
import { ScienceWorkbenchEventStore } from '../src/host/workbench-events.js'
import { scienceViewerAction, workbenchTabTitle } from '../src/host/workbench-router.js'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'science-workbench-events-'))
  const store = new ResearchStore(join(root, 'research.sqlite'))
  const project = store.createProject({ name: 'Workbench', rootPath: root })
  const events = new ScienceWorkbenchEventStore(store)
  cleanups.push(async () => { store.close(); await rm(root, { recursive: true, force: true }) })
  return { store, project, events }
}

describe('ScienceWorkbenchEventStore', () => {
  it('persists per-session monotonic events and replays after a cursor', async () => {
    const { events, project, store } = await fixture()
    const first = events.append({ sessionId: 's1', projectId: project.id, type: 'tab.open', tool: 'imagej', payload: { requestId: 'r1' } })
    const second = events.append({ sessionId: 's1', projectId: project.id, type: 'run.accepted', tool: 'imagej', runId: 'run-1' })
    events.append({ sessionId: 's2', projectId: project.id, type: 'tab.open', tool: 'he' })
    expect(second.sequence).toBe(first.sequence + 1)
    expect(events.read(project.id, 's1', first.sequence)).toMatchObject({ sessionId: 's1', events: [{ eventId: second.eventId, sequence: 2 }], lastSequence: 2, hasMore: false })
    expect(store.listAuditEvents(project.id).filter(item => item.action === 'science-workbench.event')).toHaveLength(3)
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

describe('science workbench router helpers', () => {
  it('maps tool actions to existing science viewer actions', () => {
    expect(scienceViewerAction('imagej')).toBe('image_open')
    expect(scienceViewerAction('cells', 'analyze')).toBe('cell_analyze')
    expect(scienceViewerAction('he', 'he_segment')).toBe('he_segment')
    expect(scienceViewerAction('cells', 'cells_open')).toBe('cell_open')
    expect(scienceViewerAction('brainglobe', 'brainglobe_open')).toBe('brain_open')
    expect(scienceViewerAction('canvas', 'canvas_open')).toBe('canvas_render')
    expect(() => scienceViewerAction('he', 'he_unknown')).toThrow(/Unsupported workbench operation/u)
    expect(workbenchTabTitle('brainglobe')).toBe('脑图谱')
  })
})
