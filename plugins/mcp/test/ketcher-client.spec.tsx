// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { render, cleanup } from '@testing-library/react'
import { apply } from '../src/client/index.js'

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })

it('uses the declared remote property and retries failed opens without persisting capability URLs', async () => {
  vi.useFakeTimers()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const dispose: Array<() => void> = []
  const request = { artifact_id: 'doc', url: 'http://127.0.0.1:9999/#doc:secret', sessionId: 's1', cwd: 'C:/work', createdAt: 1 }
  const remote = {
    pendingEditors: vi.fn(async () => ({ ok: true, value: [request] })),
    acknowledgeEditor: vi.fn(async () => ({ ok: true, value: undefined })),
  }
  const sidebar = {
    registerTab: vi.fn(() => () => {}),
    openTab: vi.fn().mockImplementationOnce(() => { throw new Error('sidebar reconnect') }),
  }
  const ctx = {
    remote: { zerowallMcp: remote },
    get: vi.fn(() => undefined), // Cordis does not resolve dotted service names.
    betterSidebar: sidebar,
    locale: { bind: () => (key: string) => key },
    slots: { inject: vi.fn(), register: vi.fn() },
    effect: (fn: () => () => void) => { dispose.push(fn()) },
  }
  try {
    apply(ctx as never)
    await vi.advanceTimersByTimeAsync(800)
    expect(remote.pendingEditors).toHaveBeenCalledOnce()
    expect(remote.acknowledgeEditor).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(800)
    expect(sidebar.openTab).toHaveBeenCalledTimes(2)
    expect(remote.acknowledgeEditor).toHaveBeenCalledWith('doc')
    expect(sidebar.openTab.mock.calls[1]?.[1]).toEqual({ sessionId: 's1', cwd: 'C:/work' })
    expect(JSON.stringify(sidebar.openTab.mock.calls)).not.toContain('secret')
    const descriptor = sidebar.registerTab.mock.calls[0]?.[0] as any
    const seed = sidebar.openTab.mock.calls[1]?.[0]
    const view = render(createElement(descriptor.component, { tab: { ...seed, id: 'native-generated-id' } }))
    expect(view.getByTitle('Ketcher Chemistry').getAttribute('src')).toBe(request.url)
    await vi.advanceTimersByTimeAsync(800)
    expect(sidebar.openTab).toHaveBeenCalledTimes(2)
    request.createdAt = 2
    request.url = 'http://127.0.0.1:9999/#doc:rotated'
    await vi.advanceTimersByTimeAsync(800)
    const reopened = sidebar.openTab.mock.calls[2]?.[0]
    // Native pages keep initial meta but update path on a later navigation.
    view.rerender(createElement(descriptor.component, { tab: { ...seed, id: 'native-generated-id', path: reopened.path } }))
    expect(view.getByTitle('Ketcher Chemistry').getAttribute('src')).toBe(request.url)
  } finally { dispose.reverse().forEach(fn => fn()) }
})
