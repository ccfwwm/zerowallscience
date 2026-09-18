import { ipcMain, type BrowserWindow } from 'electron'

/** Window operations are accepted only from this window's top-level document. */
export function registerWindowControls(window: BrowserWindow, trustedUrl: () => string | undefined, splashUrl: string): void {
  const state = () => ({ maximized: window.isMaximized(), fullscreen: window.isFullScreen(), focused: window.isFocused() })
  const publish = () => { if (!window.isDestroyed()) window.webContents.send('desktop:window-state', state()) }
  const channel = 'desktop:window-control'
  ipcMain.removeHandler(channel)
  ipcMain.handle(channel, (event, action: unknown) => {
    const frame = event.senderFrame
    if (event.sender !== window.webContents || frame !== window.webContents.mainFrame) throw new Error('Untrusted window')
    const url = new URL(frame.url)
    const trusted = trustedUrl()
    if (!(url.protocol === 'file:' && url.pathname === new URL(splashUrl).pathname)
      && !(trusted && url.origin === new URL(trusted).origin)) throw new Error('Untrusted document')
    if (action === 'minimize') window.minimize()
    else if (action === 'toggle-maximize') window.isMaximized() ? window.unmaximize() : window.maximize()
    else if (action === 'close') window.close()
    else if (action !== 'state') throw new Error('Unknown window operation')
    return state()
  })
  window.on('maximize', publish); window.on('unmaximize', publish); window.on('enter-full-screen', publish); window.on('leave-full-screen', publish); window.on('focus', publish); window.on('blur', publish)
  window.once('closed', () => ipcMain.removeHandler(channel))
}
