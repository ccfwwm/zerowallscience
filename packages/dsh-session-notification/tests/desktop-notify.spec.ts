import { afterEach, describe, expect, it, vi } from 'vitest'
import { browserPermission, requestBrowserPermission, showBrowserNotification } from '../src/client/browser-notify.ts'

afterEach(() => vi.unstubAllGlobals())
describe('native desktop notification bridge', () => {
  it('works even when Chromium has denied browser permission and forwards the session', async () => {
    const showNotification = vi.fn(async () => true)
    vi.stubGlobal('Notification', { permission: 'denied', requestPermission: vi.fn() })
    vi.stubGlobal('zerowallDesktop', { showNotification })
    expect(browserPermission()).toBe('granted')
    expect(await requestBrowserPermission()).toBe('granted')
    expect(showBrowserNotification('完成', '研究会话', 'completed', 'session-b')).toBe(true)
    expect(showNotification).toHaveBeenCalledWith({ title: '完成', body: '研究会话', tag: 'completed', sessionId: 'session-b' })
  })
  it('keeps browser permission behavior when no desktop bridge exists', () => {
    vi.stubGlobal('Notification', { permission: 'denied' })
    expect(browserPermission()).toBe('denied')
  })
})
