import { app, dialog, shell, systemPreferences, type BrowserWindow } from 'electron'
import { canGrantMicrophonePermission, canGrantWindowPermission, isTrustedAppUrl } from './security-policy.js'

export function secureWindow(window: BrowserWindow, trustedOrigin: () => string | undefined): void {
  let microphoneSettingsPromptOpen = false
  const offerMicrophoneSettings = (): void => {
    if (microphoneSettingsPromptOpen) return
    microphoneSettingsPromptOpen = true
    const chinese = app.getLocale().toLowerCase().startsWith('zh')
    void dialog.showMessageBox(window, {
      type: 'warning',
      title: chinese ? '麦克风权限' : 'Microphone access',
      message: chinese ? 'Windows 已关闭麦克风访问' : 'Microphone access is disabled in Windows',
      detail: chinese
        ? '请在系统设置中开启“麦克风访问”和“允许桌面应用访问麦克风”，然后返回并重新点击麦克风。'
        : 'Enable Microphone access and Let desktop apps access your microphone in Windows Settings, then return and click the microphone again.',
      buttons: chinese ? ['打开系统设置', '取消'] : ['Open Settings', 'Cancel'],
      defaultId: 0, cancelId: 1, noLink: true,
    }).then(result => {
      if (result.response === 0) void shell.openExternal('ms-settings:privacy-microphone').catch(() => undefined)
    }).catch(() => undefined).finally(() => { microphoneSettingsPromptOpen = false })
  }
  const microphoneBlockedByWindows = (): boolean => {
    if (process.platform !== 'win32') return false
    const status = systemPreferences.getMediaAccessStatus('microphone')
    if (status !== 'denied' && status !== 'restricted') return false
    offerMicrophoneSettings()
    return true
  }
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
  window.webContents.session.setPermissionCheckHandler((contents, permission, origin, details) => {
    const trusted = trustedOrigin()
    if (permission === 'media') {
      return trusted !== undefined
        && contents === window.webContents
        && canGrantMicrophonePermission(details.requestingUrl ?? origin, details.isMainFrame, [details.mediaType ?? 'unknown'], trusted)
        && !microphoneBlockedByWindows()
    }
    return trusted !== undefined
      && canGrantWindowPermission(permission, details.requestingUrl ?? origin, details.isMainFrame, trusted)
  })
  window.webContents.session.setPermissionRequestHandler((contents, permission, callback, details) => {
    const trusted = trustedOrigin()
    if (permission === 'media') {
      const allowed = trusted !== undefined
        && contents === window.webContents
        && canGrantMicrophonePermission(details.requestingUrl, details.isMainFrame, 'mediaTypes' in details ? details.mediaTypes ?? [] : [], trusted)
      if (!allowed) { callback(false); return }
      if (microphoneBlockedByWindows()) { callback(false); return }
      callback(true)
      return
    }
    callback(trusted !== undefined
      && canGrantWindowPermission(permission, details.requestingUrl, details.isMainFrame, trusted))
  })
}
