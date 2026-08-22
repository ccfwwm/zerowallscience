export interface TrayManagedWindow {
  focus(): void
  hide(): void
  isDestroyed(): boolean
  setSkipTaskbar(skip: boolean): void
  show(): void
}

export function hideWindowToTray(window: TrayManagedWindow, platform: NodeJS.Platform): void {
  if (window.isDestroyed()) return
  window.hide()
  if (platform === 'win32') window.setSkipTaskbar(true)
}

export function showWindowFromTray(window: TrayManagedWindow, platform: NodeJS.Platform): void {
  if (window.isDestroyed()) return
  if (platform === 'win32') window.setSkipTaskbar(false)
  window.show()
  window.focus()
}
