import { describe, expect, it, vi } from 'vitest'

const handlers = new Map<string, Function>()
vi.mock('electron', () => ({ ipcMain: { removeHandler: (name: string) => handlers.delete(name), handle: (name: string, cb: Function) => handlers.set(name, cb) } }))
import { registerWindowControls } from '../src/main/window-controls.js'

describe('desktop window boundary', () => {
  function setup() {
    const frame = { url: 'http://127.0.0.1:4567/' }
    let maximized = false
    const window = { webContents: { mainFrame: frame, send: vi.fn() }, isDestroyed: () => false, isMaximized: () => maximized, isFullScreen: () => false, isFocused: () => true,
      minimize: vi.fn(), close: vi.fn(), maximize: vi.fn(() => { maximized = true }), unmaximize: vi.fn(() => { maximized = false }), on: vi.fn(), once: vi.fn() }
    const quitStartup = vi.fn()
    const cover = { mainFrame: { url: 'file:///C:/app/splash.html?version=6.5.0' } }
    registerWindowControls(window as any, () => 'http://127.0.0.1:4567/?token=test', 'file:///C:/app/splash.html', () => cover as any, quitStartup)
    const invoke = (action: string, event: any = { sender: window.webContents, senderFrame: frame }) => handlers.get('desktop:window-control')!(event, action)
    return { window, frame, cover, invoke, quitStartup }
  }
  it('restores after maximizing and routes close through the existing tray lifecycle', () => {
    const { window, invoke } = setup()
    expect(invoke('toggle-maximize').maximized).toBe(true)
    expect(invoke('toggle-maximize').maximized).toBe(false)
    invoke('minimize'); invoke('close')
    expect(window.minimize).toHaveBeenCalledOnce(); expect(window.close).toHaveBeenCalledOnce()
  })
  it('rejects child frames, other windows, foreign origins and unrelated local documents', () => {
    const { window, frame, invoke } = setup()
    expect(() => invoke('close', { sender: window.webContents, senderFrame: { ...frame } })).toThrow('Untrusted window')
    expect(() => invoke('close', { sender: {}, senderFrame: frame })).toThrow('Untrusted window')
    for (const url of ['https://example.com/', 'http://127.0.0.1:9876/', 'file:///C:/other.html']) {
      frame.url = url; expect(() => invoke('close')).toThrow('Untrusted document')
    }
    expect(window.close).not.toHaveBeenCalled()
  })
  it('authorizes the startup cover main frame but rejects its child frames', () => {
    const { cover, window, invoke } = setup()
    expect(invoke('state', { sender: cover, senderFrame: cover.mainFrame }).maximized).toBe(false)
    expect(() => invoke('close', { sender: cover, senderFrame: { ...cover.mainFrame } })).toThrow('Untrusted window')
    expect(window.close).not.toHaveBeenCalled()
  })
  it('allows the splash exit path without exposing it to the workbench', () => {
    const { cover, invoke, quitStartup } = setup()
    expect(() => invoke('quit-startup')).toThrow('Unknown window operation')
    expect(quitStartup).not.toHaveBeenCalled()
    invoke('quit-startup', { sender: cover, senderFrame: cover.mainFrame })
    expect(quitStartup).toHaveBeenCalledOnce()
  })
  it('keeps startup controls available and rejects unknown operations', () => {
    const { frame, invoke } = setup(); frame.url = 'file:///C:/app/splash.html?version=6.3.0'
    expect(invoke('state').maximized).toBe(false)
    expect(() => invoke('destroy')).toThrow('Unknown window operation')
  })
})
