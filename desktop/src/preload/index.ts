import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopInfo, DesktopUpdateStatus } from '../shared/contracts.js'

contextBridge.exposeInMainWorld('zerowallDesktop', {
  info: async (): Promise<DesktopInfo> => await ipcRenderer.invoke('desktop:info') as DesktopInfo,
  chooseDirectory: async (): Promise<string | null> => await ipcRenderer.invoke('desktop:choose-directory') as string | null,
  getUpdateStatus: async (): Promise<DesktopUpdateStatus> => await ipcRenderer.invoke('desktop:get-update-status') as DesktopUpdateStatus,
  checkForUpdates: async (): Promise<DesktopUpdateStatus> => await ipcRenderer.invoke('desktop:check-for-updates') as DesktopUpdateStatus,
  downloadUpdate: async (): Promise<DesktopUpdateStatus> => await ipcRenderer.invoke('desktop:download-update') as DesktopUpdateStatus,
  installUpdate: async (): Promise<boolean> => await ipcRenderer.invoke('desktop:install-update') as boolean,
  onUpdateStatus: (listener: (status: DesktopUpdateStatus) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: DesktopUpdateStatus) => listener(status)
    ipcRenderer.on('desktop:update-status', handler)
    return () => ipcRenderer.removeListener('desktop:update-status', handler)
  },
})
