import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopClipboardFile, DesktopInfo, DesktopUpdateStatus, McpEnvironmentStatus } from '../shared/contracts.js'

contextBridge.exposeInMainWorld('zerowallDesktop', {
  info: async (): Promise<DesktopInfo> => await ipcRenderer.invoke('desktop:info') as DesktopInfo,
  chooseDirectory: async (): Promise<string | null> => await ipcRenderer.invoke('desktop:choose-directory') as string | null,
  copyFile: async (input: DesktopClipboardFile): Promise<boolean> => await ipcRenderer.invoke('desktop:clipboard-copy-file', input) as boolean,
  getUpdateStatus: async (): Promise<DesktopUpdateStatus> => await ipcRenderer.invoke('desktop:get-update-status') as DesktopUpdateStatus,
  checkForUpdates: async (): Promise<DesktopUpdateStatus> => await ipcRenderer.invoke('desktop:check-for-updates') as DesktopUpdateStatus,
  downloadUpdate: async (): Promise<DesktopUpdateStatus> => await ipcRenderer.invoke('desktop:download-update') as DesktopUpdateStatus,
  installUpdate: async (): Promise<boolean> => await ipcRenderer.invoke('desktop:install-update') as boolean,
  getMcpEnvironmentStatus: async (): Promise<McpEnvironmentStatus> => await ipcRenderer.invoke('desktop:mcp-environment:get-status') as McpEnvironmentStatus,
  retryMcpEnvironment: async (): Promise<McpEnvironmentStatus> => await ipcRenderer.invoke('desktop:mcp-environment:retry') as McpEnvironmentStatus,
  selectMcpEnvironment: async (): Promise<McpEnvironmentStatus> => await ipcRenderer.invoke('desktop:mcp-environment:select-path') as McpEnvironmentStatus,
  onMcpEnvironmentStatus: (listener: (status: McpEnvironmentStatus) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: McpEnvironmentStatus) => listener(status)
    ipcRenderer.on('desktop:mcp-environment:status-changed', handler)
    return () => ipcRenderer.removeListener('desktop:mcp-environment:status-changed', handler)
  },
  onUpdateStatus: (listener: (status: DesktopUpdateStatus) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: DesktopUpdateStatus) => listener(status)
    ipcRenderer.on('desktop:update-status', handler)
    return () => ipcRenderer.removeListener('desktop:update-status', handler)
  },
})
