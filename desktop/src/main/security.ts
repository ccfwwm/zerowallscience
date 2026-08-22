import { shell, type BrowserWindow } from 'electron'
import { canGrantWindowPermission, isTrustedAppUrl } from './security-policy.js'

export function secureWindow(window: BrowserWindow, trustedOrigin: () => string | undefined): void {
  window.webContents.setWindowOpenHandler(({ url }) => {
    const origin = trustedOrigin()
    if (origin !== undefined && isTrustedAppUrl(url, origin)) return { action: 'allow' }
    if (url.startsWith('https://') || url.startsWith('http://')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  window.webContents.on('will-navigate', (event, url) => {
    const origin = trustedOrigin()
    if (origin !== undefined && isTrustedAppUrl(url, origin)) return
    event.preventDefault()
    if (url.startsWith('https://') || url.startsWith('http://')) void shell.openExternal(url)
  })

  window.webContents.on('will-attach-webview', (event) => event.preventDefault())
  window.webContents.session.setPermissionCheckHandler((_contents, permission, origin, details) => {
    const trusted = trustedOrigin()
    return trusted !== undefined
      && canGrantWindowPermission(permission, details.requestingUrl ?? origin, details.isMainFrame, trusted)
  })
  window.webContents.session.setPermissionRequestHandler((_contents, permission, callback, details) => {
    const trusted = trustedOrigin()
    callback(trusted !== undefined
      && canGrantWindowPermission(permission, details.requestingUrl, details.isMainFrame, trusted))
  })
}
