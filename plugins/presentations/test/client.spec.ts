import { describe, expect, it, vi } from 'vitest'
import { addPresentationSlideToDraft, ensurePresentationProject, openPresentationWorkbench, resolvePresentationSlideImage } from '../src/client/plugin.js'

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

  it('loads presentation previews without crossing the current session attachment scope', async () => {
    const resolveImage = vi.fn()
    const previewSlide = vi.fn().mockResolvedValue({ ok: true, value: { presentationId: 'ppt-1', slideId: 'slide-1', slideIndex: 0, name: 'slide-01.png', uri: 'file:///slide-01.png', mediaType: 'image/png', byteSize: 1, base64: 'AA==' } })
    const slide = { id: 'slide-1', title: 'Slide', body: '', assetUris: [], visual: { attachment: { attachmentId: 'sha256:image', mediaType: 'image/png', bytes: 1, width: 1, height: 1 } } }
    await expect(resolvePresentationSlideImage({ conversation: { resolveImage } } as never, { previewSlide } as never, 'ppt-1', 'session-1', slide as never)).resolves.toBe('data:image/png;base64,AA==')
    expect(resolveImage).not.toHaveBeenCalled()
    expect(previewSlide).toHaveBeenCalledWith({ presentationId: 'ppt-1', slideId: 'slide-1' })
  })

  it('creates a new current-session draft image from presentation preview bytes', async () => {
    const addImageBytesToDraft = vi.fn().mockResolvedValue(undefined)
    const previewSlide = vi.fn().mockResolvedValue({ ok: true, value: { presentationId: 'ppt-1', slideId: 'slide-4', slideIndex: 3, name: 'slide-04.png', uri: 'file:///slide-04.png', mediaType: 'image/png', byteSize: 3, base64: 'AQID' } })
    const slide = { id: 'slide-4', title: 'Slide', body: '', assetUris: [] }
    await addPresentationSlideToDraft({ conversation: { addImageBytesToDraft } } as never, { previewSlide } as never, 'session-1', 'ppt-1', slide as never, 3)
    expect(addImageBytesToDraft).toHaveBeenCalledWith('session-1', {
      data: Uint8Array.of(1, 2, 3), mediaType: 'image/png', name: 'slide-04.png',
      contextText: 'PPT 页面引用：presentationId=ppt-1, slideId=slide-4, page=4',
    })
  })
})
