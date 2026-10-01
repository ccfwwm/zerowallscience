// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement, type ComponentType } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
vi.mock('../src/client/universal-viewer.js', () => ({ installUniversalViewer: vi.fn(), UniversalPreview: ({ name }: { name: string }) => createElement('div', { 'data-testid': 'universal-preview' }, name + ' 通用预览') }))

import { apply } from '../src/client/index.js'
import type { PreparedFile } from '../src/shared/types.js'

const file: PreparedFile = {
  attachmentId: 'attachment-1',
  name: 'paper.pdf',
  mediaType: 'application/pdf',
  bytes: 2048,
  sha256: 'a'.repeat(64),
  storageStatus: 'stored',
}

function context() {
  const disposers: Array<() => void> = []
  const unregister = vi.fn()
  let attachmentViewer: ComponentType<any> | undefined
  const materialize = vi.fn().mockResolvedValue({
    ok: true, value: { path: 'C:/workspace/.zerowall/uploads/paper.pdf' },
  })
  const download = vi.fn().mockResolvedValue({ ok: true, value: { ...file, data: Buffer.from('%PDF-1.7').toString('base64') } })
  const readOriginalRange = vi.fn(async () => {
    const result = await download()
    const bytes = Buffer.from(result.value.data, 'base64')
    return { ok: true, value: { data: result.value.data, bytes: bytes.length, version: file.sha256, eof: true, name: result.value.name } }
  })
  const inspect = vi.fn().mockResolvedValue({ ok: true, value: file })
  const openResource = vi.fn()
  const ctx = {
    remote: { zerowallFiles: { materializeOriginal: materialize, downloadOriginal: download, inspectOriginalMetadata: inspect, readOriginalRange } },
    get: (name: string) => name === 'remote.zerowallFiles'
      ? { materializeOriginal: materialize, downloadOriginal: download, inspectOriginalMetadata: inspect, readOriginalRange }
      : name === 'sidebarRight' ? { openResource } : undefined,
    betterSidebar: {
      registerTab: vi.fn((descriptor: { id: string; component: ComponentType<any> }) => {
        if (descriptor.id === 'zerowall:attachment-viewer') attachmentViewer = descriptor.component
        return unregister
      }),
      openFile: vi.fn(),
      openTab: vi.fn(),
    },
    effect: vi.fn((mount: () => void | (() => void)) => {
      const dispose = mount()
      if (typeof dispose === 'function') disposers.push(dispose)
    }),
  }
  return {
    ctx: ctx as any,
    disposers,
    unregister,
    materialize,
    download,
    inspect,
    openResource,
    attachmentViewer: () => attachmentViewer,
  }
}

afterEach(() => {
  cleanup()
  delete (window as any).zerowallDesktop
})

describe('attachment client actions', () => {
  it.each(['research.docx', 'research.pptx', 'research.xlsx', 'RESEARCH.XLS', 'facts.csv', 'facts.tsv'])('opens %s with native DSH in both workspace and detached sessions', async name => {
    const state = context()
    state.materialize.mockResolvedValue({ ok: true, value: { path: 'C:/科研#文件/' + name } })
    apply(state.ctx)
    for (const cwd of ['C:/workspace', undefined]) {
      const complete = vi.fn()
      window.dispatchEvent(new CustomEvent('zerowall:attachment-open', { detail: { file: { ...file, name }, sessionId: 'session-1', cwd, complete } }))
      await waitFor(() => expect(complete).toHaveBeenCalledWith(true))
      expect(state.openResource).toHaveBeenLastCalledWith(`dsh-resource://file/session/session-1/C%3A/%E7%A7%91%E7%A0%94%23%E6%96%87%E4%BB%B6/${name}`, { kind: 'text' })
    }
    expect(state.ctx.betterSidebar.openFile).not.toHaveBeenCalled()
    expect(state.ctx.betterSidebar.openTab).not.toHaveBeenCalled()
    expect(state.download).not.toHaveBeenCalled()
    state.disposers.forEach(dispose => dispose())
  })

  it('does not open a native Office file when materialization authorization fails', async () => {
    const state = context()
    state.materialize.mockResolvedValue({ ok: false, error: { code: 'denied', message: 'Session has no attachment' } })
    apply(state.ctx)
    const complete = vi.fn()
    window.dispatchEvent(new CustomEvent('zerowall:attachment-open', { detail: { file: { ...file, name: 'research.pptx' }, sessionId: 'session-1', complete } }))
    await waitFor(() => expect(complete).toHaveBeenCalledWith(false, expect.stringContaining('denied')))
    expect(state.openResource).not.toHaveBeenCalled()
    state.disposers.forEach(dispose => dispose())
  })
  it('opens workspace attachments in the original-byte Sidebar viewer', async () => {
    const state = context()
    apply(state.ctx)

    window.dispatchEvent(new CustomEvent('zerowall:attachment-open', {
      detail: { file, sessionId: 'session-1', cwd: 'C:/workspace' },
    }))

    await waitFor(() => expect(state.materialize).toHaveBeenCalledWith({ sessionId: 'session-1', attachmentId: 'attachment-1' }))
    expect(state.ctx.betterSidebar.openFile).toHaveBeenCalledWith({ sessionId: 'session-1', cwd: 'C:/workspace' }, 'C:/workspace/.zerowall/uploads/paper.pdf', 'paper.pdf')
    state.disposers.forEach(dispose => dispose())
  })

  it('opens the session-scoped read-only viewer without a workspace', async () => {
    const state = context()
    apply(state.ctx)

    window.dispatchEvent(new CustomEvent('zerowall:attachment-open', {
      detail: { file, sessionId: 'session-2' },
    }))

    await waitFor(() => expect(state.ctx.betterSidebar.openTab).toHaveBeenCalledWith(expect.objectContaining({
      type: 'zerowall:attachment-viewer',
      meta: expect.objectContaining({ attachmentId: 'attachment-1' }),
    }), { sessionId: 'session-2' }))
    expect(state.materialize).not.toHaveBeenCalled()
    state.disposers.forEach(dispose => dispose())
  })

  it('reports unsupported file copy without copying the filename and removes listeners', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const state = context()
    apply(state.ctx)

    const complete = vi.fn()
    window.dispatchEvent(new CustomEvent('zerowall:attachment-copy', {
      detail: { file, sessionId: 'session-3', complete },
    }))
    await waitFor(() => expect(complete).toHaveBeenCalledWith(false, '系统剪贴板不支持复制此文件。'))
    expect(writeText).not.toHaveBeenCalled()

    state.disposers.forEach(dispose => dispose())
    expect(state.unregister).toHaveBeenCalledOnce()
    window.dispatchEvent(new CustomEvent('zerowall:attachment-open', {
      detail: { file, sessionId: 'session-3' },
    }))
    await Promise.resolve()
    expect(state.ctx.betterSidebar.openFile).not.toHaveBeenCalled()
  })

  it('copies actual PDF bytes through the desktop clipboard bridge', async () => {
    const copyFile = vi.fn().mockResolvedValue(true)
    ;(window as any).zerowallDesktop = { copyFile }
    const state = context()
    apply(state.ctx)
    const complete = vi.fn()
    window.dispatchEvent(new CustomEvent('zerowall:attachment-copy', {
      cancelable: true, detail: { file, sessionId: 'session-copy', complete },
    }))
    await waitFor(() => expect(complete).toHaveBeenCalledWith(true, undefined))
    expect(copyFile).toHaveBeenCalledWith({
      name: 'paper.pdf', mediaType: 'application/pdf', data: Buffer.from('%PDF-1.7').toString('base64'),
    })
    state.disposers.forEach(dispose => dispose())
  })

  it('re-adds downloaded text bytes only to the matching composer session', async () => {
    const state = context()
    const text = Buffer.from('alpha\nbeta', 'utf8')
    state.download.mockResolvedValue({ ok: true, value: { ...file, name: 'notes.txt', mediaType: 'text/plain', bytes: text.length, data: text.toString('base64') } })
    apply(state.ctx)
    const received = vi.fn((event: Event) => {
      const detail = (event as CustomEvent<{ files: File[]; sessionId: string; complete: (success: boolean) => void }>).detail
      if (detail.sessionId !== 'session-readd') return
      event.preventDefault()
      detail.complete(true)
    })
    window.addEventListener('zerowall:attachment-files', received)
    const complete = vi.fn()
    window.dispatchEvent(new CustomEvent('zerowall:attachment-readd', {
      cancelable: true, detail: { attachmentId: file.attachmentId, sessionId: 'session-readd', complete },
    }))
    await waitFor(() => expect(complete).toHaveBeenCalledWith(true))
    const delivered = (received.mock.calls[0]![0] as CustomEvent<{ files: File[]; sessionId: string }>).detail
    expect(delivered.sessionId).toBe('session-readd')
    expect(delivered.files[0]?.name).toBe('notes.txt')
    expect(Buffer.from(await delivered.files[0]!.arrayBuffer())).toEqual(text)
    window.removeEventListener('zerowall:attachment-files', received)
    state.disposers.forEach(dispose => dispose())
  })

  it('renders PDF and text originals in the session-scoped read-only viewer', async () => {
    const previousCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
    const previousRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:attachment-preview') })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
    const state = context()
    apply(state.ctx)
    const Viewer = state.attachmentViewer()!
    try {
      const pdfView = render(createElement(Viewer, {
        ctx: {}, store: {}, scope: { sessionId: 'preview-session' },
        tab: { id: 'pdf-preview', type: 'zerowall:attachment-viewer', meta: { attachmentId: file.attachmentId } },
        visible: true,
      }))
      expect(await screen.findByTestId('universal-preview')).toHaveProperty('textContent', 'paper.pdf 通用预览')
      pdfView.unmount()

      const source = Buffer.from('Text attachment preview', 'utf8')
      state.inspect.mockResolvedValue({ ok: true, value: { ...file, name: 'notes.txt', mediaType: 'text/plain', bytes: source.length } })
      state.download.mockResolvedValue({ ok: true, value: { ...file, name: 'notes.txt', mediaType: 'text/plain', bytes: source.length, data: source.toString('base64') } })
      render(createElement(Viewer, {
        ctx: {}, store: {}, scope: { sessionId: 'preview-session' },
        tab: { id: 'text-preview', type: 'zerowall:attachment-viewer', meta: { attachmentId: file.attachmentId } },
        visible: true,
      }))
      expect(await screen.findByText('Text attachment preview')).toBeTruthy()
    } finally {
      state.disposers.forEach(dispose => dispose())
      if (previousCreate === undefined) delete (URL as any).createObjectURL
      else Object.defineProperty(URL, 'createObjectURL', previousCreate)
      if (previousRevoke === undefined) delete (URL as any).revokeObjectURL
      else Object.defineProperty(URL, 'revokeObjectURL', previousRevoke)
    }
  })

  it('uses the registering plugin remote when the better-sidebar component scope has no remote inject', async () => {
    const copyFile = vi.fn().mockResolvedValue(true)
    ;(window as any).zerowallDesktop = { copyFile }
    const state = context()
    apply(state.ctx)
    const Viewer = state.attachmentViewer()
    expect(Viewer).toBeDefined()

    const sidebarCtx = Object.defineProperty({}, 'remote', {
      get: () => { throw new Error('cannot get property "remote" without inject') },
    })
    render(createElement(Viewer!, {
      ctx: sidebarCtx,
      store: {},
      scope: { sessionId: 'session-4' },
      tab: { id: 'attachment-tab', type: 'zerowall:attachment-viewer', meta: { attachmentId: 'attachment-1' } },
      visible: true,
    }))

    expect(await screen.findByText('paper.pdf')).toBeTruthy()
    expect(state.inspect).toHaveBeenCalledWith({ sessionId: 'session-4', attachmentId: 'attachment-1' })
    fireEvent.click(screen.getByTitle('复制文件'))
    await waitFor(() => expect(state.download).toHaveBeenCalledWith({ sessionId: 'session-4', attachmentId: 'attachment-1' }))
    await waitFor(() => expect(copyFile).toHaveBeenCalledWith({
      name: 'paper.pdf', mediaType: 'application/pdf', data: Buffer.from('%PDF-1.7').toString('base64'),
    }))
    state.disposers.forEach(dispose => dispose())
  })

  it('shows the actual Typert failure details returned by the Host', async () => {
    const state = context()
    state.inspect.mockResolvedValueOnce({
      ok: false,
      error: { code: 'not-found', message: 'Uploaded file metadata is missing.', details: {} },
    })
    apply(state.ctx)
    const Viewer = state.attachmentViewer()

    render(createElement(Viewer!, {
      ctx: {},
      store: {},
      scope: { sessionId: 'session-5' },
      tab: { id: 'attachment-tab', type: 'zerowall:attachment-viewer', meta: { attachmentId: 'attachment-1' } },
      visible: true,
    }))

    expect((await screen.findByRole('alert')).textContent).toBe(
      'zerowallFiles.inspectOriginalMetadata failed: not-found: Uploaded file metadata is missing.',
    )
    state.disposers.forEach(dispose => dispose())
  })
})
