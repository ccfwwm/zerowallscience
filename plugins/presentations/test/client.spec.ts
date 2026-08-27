import { describe, expect, it, vi } from 'vitest'
import { ensurePresentationProject, openPresentationWorkbench } from '../src/client/plugin.js'

describe('presentation workbench routing', () => {
  it('opens a session-scoped tab for the selected presentation', () => {
    const openTab = vi.fn()
    openPresentationWorkbench({ openTab }, { sessionId: 'session-1', projectId: 'project-1', presentationId: 'ppt-1', title: '结果汇报' })
    expect(openTab).toHaveBeenCalledWith({
      type: 'zerowall:presentation-workbench', id: 'zerowall:presentation:ppt-1', title: '结果汇报',
      meta: { presentationId: 'ppt-1', projectId: 'project-1' },
    }, { sessionId: 'session-1' })
  })

  it('resolves a selected project without creating a new one', async () => {
    const project = { id: 'p1', name: 'Genome', rootPath: 'C:\\work\\genome' }
    const ensureProjectForSession = vi.fn()
    const resolved = await ensurePresentationProject({ ensureProjectForSession }, [project], 'p1', 'session-1')
    expect(ensureProjectForSession).not.toHaveBeenCalled()
    expect(resolved).toBe(project)
  })

  it('asks Host to ensure the current workspace project when no selection exists', async () => {
    const project = { id: 'p1', name: 'Genome', rootPath: 'C:\\work\\genome' }
    const ensureProjectForSession = vi.fn().mockResolvedValue({ ok: true, value: project })
    const resolved = await ensurePresentationProject({ ensureProjectForSession }, [], undefined, 'session-1')
    expect(ensureProjectForSession).toHaveBeenCalledWith('session-1')
    expect(resolved).toBe(project)
  })
})
