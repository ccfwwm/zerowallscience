import { describe, expect, it, vi } from 'vitest'
import { ensurePresentationProject, openPresentationWorkbench, resolvePresentationSlideImage } from '../src/client/plugin.js'

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

  it('falls back to the persisted slide file when the conversation attachment is unavailable', async () => {
    const resolveImage = vi.fn().mockRejectedValue(new Error('attachment is outside this session'))
    const previewSlide = vi.fn().mockResolvedValue({ ok: true, value: { uri: 'file:///slide-01.png', mediaType: 'image/png', byteSize: 1, base64: 'AA==' } })
    const slide = { id: 'slide-1', title: 'Slide', body: '', assetUris: [], visual: { attachment: { attachmentId: 'sha256:image', mediaType: 'image/png', bytes: 1, width: 1, height: 1 } } }
    await expect(resolvePresentationSlideImage({ conversation: { resolveImage } } as never, { previewSlide } as never, 'ppt-1', 'session-1', slide as never)).resolves.toBe('data:image/png;base64,AA==')
    expect(resolveImage).toHaveBeenCalledOnce()
    expect(previewSlide).toHaveBeenCalledWith({ presentationId: 'ppt-1', slideId: 'slide-1' })
  })
})
