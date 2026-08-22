import { describe, expect, it, vi } from 'vitest'
import { hideWindowToTray, showWindowFromTray, type TrayManagedWindow } from '../src/main/tray-window.js'

function fakeWindow(destroyed = false): TrayManagedWindow {
  return {
    focus: vi.fn(),
    hide: vi.fn(),
    isDestroyed: () => destroyed,
    setSkipTaskbar: vi.fn(),
    show: vi.fn(),
  }
}

describe('desktop tray window behavior', () => {
  it('hides a Windows window and removes its taskbar button', () => {
    const window = fakeWindow()
    hideWindowToTray(window, 'win32')
    expect(window.hide).toHaveBeenCalledOnce()
    expect(window.setSkipTaskbar).toHaveBeenCalledWith(true)
  })

  it('restores and focuses a Windows window from the tray', () => {
    const window = fakeWindow()
    showWindowFromTray(window, 'win32')
    expect(window.setSkipTaskbar).toHaveBeenCalledWith(false)
    expect(window.show).toHaveBeenCalledOnce()
    expect(window.focus).toHaveBeenCalledOnce()
  })

  it('does not touch a destroyed window', () => {
    const window = fakeWindow(true)
    hideWindowToTray(window, 'darwin')
    showWindowFromTray(window, 'darwin')
    expect(window.hide).not.toHaveBeenCalled()
    expect(window.show).not.toHaveBeenCalled()
  })
})
