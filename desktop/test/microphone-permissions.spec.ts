import type { BrowserWindow, Session, WebContents } from 'electron'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { secureWindow } from '../src/main/security.js'

const native = vi.hoisted(() => ({
  status: vi.fn(() => 'granted'),
  showMessageBox: vi.fn(async () => ({ response: 1 })),
  openExternal: vi.fn(async () => {}),
}))
vi.mock('electron', () => ({
  app: { getLocale: () => 'zh-CN' },
  dialog: { showMessageBox: native.showMessageBox },
  shell: { openExternal: native.openExternal },
  systemPreferences: { getMediaAccessStatus: native.status },
}))

const origin = 'http://127.0.0.1:43127'

function fixture() {
  const setPermissionCheckHandler = vi.fn<Session['setPermissionCheckHandler']>()
  const setPermissionRequestHandler = vi.fn<Session['setPermissionRequestHandler']>()
  const contents = {
    setWindowOpenHandler: vi.fn(), on: vi.fn(),
    session: { setPermissionCheckHandler, setPermissionRequestHandler },
  } as unknown as WebContents
  const window = { webContents: contents } as BrowserWindow
  secureWindow(window, () => `${origin}/?token=desktop-launch-token`)
  return {
    window, contents,
    check: setPermissionCheckHandler.mock.calls[0]![0]!,
    request: setPermissionRequestHandler.mock.calls[0]![0]!,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  native.status.mockReturnValue('granted')
  native.showMessageBox.mockResolvedValue({ response: 1 })
})

describe('desktop microphone permission', () => {
  it('allows the active main frame audio request through both Electron handlers', () => {
    const f = fixture(), decision = vi.fn()
    expect(f.check(f.contents, 'media', origin, { requestingUrl: `${origin}/`, isMainFrame: true, mediaType: 'audio' })).toBe(true)
    f.request(f.contents, 'media', decision, { requestingUrl: `${origin}/`, isMainFrame: true, mediaTypes: ['audio'] })
    expect(decision).toHaveBeenCalledExactlyOnceWith(true)
    expect(native.status).toHaveBeenCalledWith('microphone')
  })

  it('rejects camera, mixed capture, foreign frames and splash pages', () => {
    const f = fixture(), decision = vi.fn()
    const validCheck = { requestingUrl: `${origin}/`, isMainFrame: true, mediaType: 'audio' as const }
    expect(f.check(f.contents, 'media', origin, { ...validCheck, mediaType: 'video' })).toBe(false)
    expect(f.check(f.contents, 'media', origin, { ...validCheck, isMainFrame: false })).toBe(false)
    expect(f.check({} as WebContents, 'media', origin, validCheck)).toBe(false)
    expect(f.check(f.contents, 'media', origin, { ...validCheck, requestingUrl: 'file:///splash.html' })).toBe(false)
    for (const request of [
      { requestingUrl: `${origin}/`, isMainFrame: true, mediaTypes: ['video'] },
      { requestingUrl: `${origin}/`, isMainFrame: true, mediaTypes: ['audio', 'video'] },
      { requestingUrl: 'https://example.com/', isMainFrame: true, mediaTypes: ['audio'] },
      { requestingUrl: `${origin}/`, isMainFrame: false, mediaTypes: ['audio'] },
    ]) {
      f.request(f.contents, 'media', decision, request)
      expect(decision).toHaveBeenLastCalledWith(false)
    }
    expect(native.status).not.toHaveBeenCalled()
  })

  it('asks before opening Windows microphone settings when system access is denied', async () => {
    vi.stubGlobal('process', { ...process, platform: 'win32' })
    native.status.mockReturnValue('denied')
    let resolveConfirmation!: (value: { response: number }) => void
    const confirmation = new Promise<{ response: number }>(resolve => { resolveConfirmation = resolve })
    native.showMessageBox.mockReturnValueOnce(confirmation)
    const f = fixture(), decision = vi.fn()
    expect(f.check(f.contents, 'media', origin, { requestingUrl: `${origin}/`, isMainFrame: true, mediaType: 'audio' })).toBe(false)
    f.request(f.contents, 'media', decision, { requestingUrl: `${origin}/`, isMainFrame: true, mediaTypes: ['audio'] })
    expect(decision).toHaveBeenCalledExactlyOnceWith(false)
    expect(native.showMessageBox).toHaveBeenCalledTimes(1)
    expect(native.openExternal).not.toHaveBeenCalled()
    resolveConfirmation({ response: 0 })
    await vi.waitFor(() => expect(native.openExternal).toHaveBeenCalledExactlyOnceWith('ms-settings:privacy-microphone'))
  })
})
