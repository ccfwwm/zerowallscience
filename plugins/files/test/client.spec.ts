// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement, type ComponentType } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  const inspect = vi.fn().mockResolvedValue({ ok: true, value: file })
  const ctx = {
    remote: { zerowallFiles: { materializeOriginal: materialize, downloadOriginal: download, inspectOriginalMetadata: inspect } },
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
    attachmentViewer: () => attachmentViewer,
  }
}

afterEach(() => {
  delete (window as any).zerowallDesktop
})

describe('attachment client actions', () => {
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

  it('opens the session-scoped original viewer without a workspace', async () => {
    const state = context()
    apply(state.ctx)

    window.dispatchEvent(new CustomEvent('zerowall:attachment-open', {
      detail: { file, sessionId: 'session-2' },
    }))

    await waitFor(() => expect(state.materialize).toHaveBeenCalledWith({ sessionId: 'session-2', attachmentId: 'attachment-1' }))
    expect(state.ctx.betterSidebar.openFile).toHaveBeenCalledWith({ sessionId: 'session-2' }, 'C:/workspace/.zerowall/uploads/paper.pdf', 'paper.pdf')
    state.disposers.forEach(dispose => dispose())
  })

  it('falls back to text copy and removes action listeners on disposal', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const state = context()
    apply(state.ctx)

    window.dispatchEvent(new CustomEvent('zerowall:attachment-copy', {
      detail: { file, sessionId: 'session-3' },
    }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('paper.pdf'))

    state.disposers.forEach(dispose => dispose())
    expect(state.unregister).toHaveBeenCalledOnce()
    window.dispatchEvent(new CustomEvent('zerowall:attachment-open', {
      detail: { file, sessionId: 'session-3' },
    }))
    await Promise.resolve()
    expect(state.ctx.betterSidebar.openFile).not.toHaveBeenCalled()
  })

  it('uses the registering plugin remote when the better-sidebar component scope has no remote inject', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
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
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('paper.pdf'))
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
