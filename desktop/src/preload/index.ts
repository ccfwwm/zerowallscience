import { contextBridge, ipcRenderer } from 'electron'
import { mountWindowChrome } from './window-chrome.js'
import type { DesktopClipboardFile, DesktopClipboardImage, DesktopInfo, DesktopUpdateStatus, McpEnvironmentStatus, McpPythonInfo, PythonPackagePlan, StartupStatus } from '../shared/contracts.js'
import type { PythonLayer, PythonLayerCheck, ResourceCheckResult, ResourceJob, ResourceKind, ResourceUpdateStatus } from '../../../plugins/base/src/client/desktop-api.js'
import type { PythonEnvironmentResponse } from '../../../plugins/base/src/client/desktop-api.js'

contextBridge.exposeInMainWorld('zerowallDesktop', {
  windowControl: (action: 'minimize' | 'toggle-maximize' | 'close' | 'state' | 'quit-startup') => ipcRenderer.invoke('desktop:window-control', action),
  openZotero: async (url: string): Promise<boolean> => await ipcRenderer.invoke('desktop:open-zotero', url) as boolean,
  saveTextFile: async (input: { name: string; text: string }): Promise<boolean> => await ipcRenderer.invoke('desktop:save-text-file', input) as boolean,
  deleteSession: async (input: { sessionId: string; title: string; language: string }): Promise<boolean> => await ipcRenderer.invoke('desktop:delete-session', input) as boolean,
  getStartupStatus: async (): Promise<StartupStatus> => await ipcRenderer.invoke('desktop:startup-status') as StartupStatus,
  restart: async (): Promise<boolean> => await ipcRenderer.invoke('desktop:restart') as boolean,
  openLogs: async (): Promise<string> => await ipcRenderer.invoke('desktop:open-logs') as string,
  onStartupStatus: (listener: (status: StartupStatus) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: StartupStatus) => listener(status)
    ipcRenderer.on('desktop:startup-status', handler)
    return () => ipcRenderer.removeListener('desktop:startup-status', handler)
  },
  showNotification: async (input: { title: string; body: string; tag: string; sessionId?: string }): Promise<boolean> =>
    await ipcRenderer.invoke('desktop:show-notification', input) as boolean,
  onNotificationActivated: (listener: (sessionId?: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, sessionId?: string) => listener(sessionId)
    ipcRenderer.on('desktop:notification-activated', handler)
    return () => ipcRenderer.removeListener('desktop:notification-activated', handler)
  },
  onNotificationFailed: (listener: (message: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, message: string) => listener(message)
    ipcRenderer.on('desktop:notification-failed', handler)
    return () => ipcRenderer.removeListener('desktop:notification-failed', handler)
  },
  info: async (): Promise<DesktopInfo> => await ipcRenderer.invoke('desktop:info') as DesktopInfo,
  chooseDirectory: async (): Promise<string | null> => await ipcRenderer.invoke('desktop:choose-directory') as string | null,
  chooseScienceFile: async (extensions?: string[]): Promise<string | null> => await ipcRenderer.invoke('desktop:choose-science-file', extensions) as string | null,
  revealPath: async (path: string): Promise<boolean> => await ipcRenderer.invoke('desktop:reveal-path', path) as boolean,
  openFolder: async (path: string): Promise<boolean> => await ipcRenderer.invoke('desktop:open-folder', path) as boolean,
  openPythonTerminal: async (): Promise<boolean> => await ipcRenderer.invoke('desktop:open-python-terminal') as boolean,
  openPptx: async (path: string): Promise<boolean> => await ipcRenderer.invoke('desktop:open-pptx', path) as boolean,
  copyFile: async (input: DesktopClipboardFile): Promise<boolean> => await ipcRenderer.invoke('desktop:clipboard-copy-file', input) as boolean,
  copyText: async (text: string): Promise<boolean> => await ipcRenderer.invoke('desktop:clipboard-copy-text', text) as boolean,
  copyImage: async (input: DesktopClipboardImage): Promise<boolean> => await ipcRenderer.invoke('desktop:clipboard-copy-image', input) as boolean,
  getUpdateStatus: async (): Promise<DesktopUpdateStatus> => await ipcRenderer.invoke('desktop:get-update-status') as DesktopUpdateStatus,
  checkForUpdates: async (): Promise<DesktopUpdateStatus> => await ipcRenderer.invoke('desktop:check-for-updates') as DesktopUpdateStatus,
  downloadUpdate: async (): Promise<DesktopUpdateStatus> => await ipcRenderer.invoke('desktop:download-update') as DesktopUpdateStatus,
  installUpdate: async (): Promise<boolean> => await ipcRenderer.invoke('desktop:install-update') as boolean,
  getMcpEnvironmentStatus: async (): Promise<McpEnvironmentStatus> => await ipcRenderer.invoke('desktop:mcp-environment:get-status') as McpEnvironmentStatus,
  retryMcpEnvironment: async (): Promise<McpEnvironmentStatus> => await ipcRenderer.invoke('desktop:mcp-environment:retry') as McpEnvironmentStatus,
  selectMcpEnvironment: async (): Promise<McpEnvironmentStatus> => await ipcRenderer.invoke('desktop:mcp-environment:select-path') as McpEnvironmentStatus,
  checkMcpEnvironment: async (): Promise<McpEnvironmentStatus> => await ipcRenderer.invoke('desktop:mcp-environment:check') as McpEnvironmentStatus,
  updateMcpEnvironment: async (): Promise<McpEnvironmentStatus> => await ipcRenderer.invoke('desktop:mcp-environment:update') as McpEnvironmentStatus,
  pauseMcpEnvironment: async (): Promise<McpEnvironmentStatus> => await ipcRenderer.invoke('desktop:mcp-environment:pause') as McpEnvironmentStatus,
  rollbackMcpEnvironment: async (): Promise<{ taskId: string }> => await ipcRenderer.invoke('desktop:mcp-environment:rollback') as { taskId: string },
  previewMcpPythonPackages: async (names: string[]): Promise<PythonPackagePlan> => await ipcRenderer.invoke('desktop:mcp-python:preview', names) as PythonPackagePlan,
  applyMcpPythonPackagePlan: async (planId: string): Promise<{ taskId: string }> => await ipcRenderer.invoke('desktop:mcp-python:apply-plan', planId) as { taskId: string },
  getMcpPythonInfo: async (query?: string): Promise<McpPythonInfo> => await ipcRenderer.invoke('desktop:mcp-python:info', query) as McpPythonInfo,
  installMcpPythonPackage: async (spec: string): Promise<{ taskId: string }> => await ipcRenderer.invoke('desktop:mcp-python:install', spec) as { taskId: string },
  checkMcpPythonPackageUpdates: async (names?: string[]): Promise<McpPythonInfo> => await ipcRenderer.invoke('desktop:mcp-python:check-updates', names) as McpPythonInfo,
  updateMcpPythonPackages: async (names?: string[]): Promise<{ taskId: string }> => await ipcRenderer.invoke('desktop:mcp-python:update', names) as { taskId: string },
  pythonEnvironment: async (request: Record<string, unknown>): Promise<Record<string, unknown>> => await ipcRenderer.invoke('desktop:python-environment', request) as Record<string, unknown>,
  pythonLayers: {
    listLocal: async (layer: PythonLayer): Promise<PythonLayerCheck> => await ipcRenderer.invoke('desktop:python-layer-list', layer) as PythonLayerCheck,
    check: async (layer: PythonLayer): Promise<PythonLayerCheck> => await ipcRenderer.invoke('desktop:python-layer-check', layer) as PythonLayerCheck,
    update: async (layer: PythonLayer, capabilityId?: string): Promise<PythonEnvironmentResponse> => await ipcRenderer.invoke('desktop:python-layer-update', layer, capabilityId) as PythonEnvironmentResponse,
    taskStatus: async (taskId: string): Promise<PythonEnvironmentResponse> => await ipcRenderer.invoke('desktop:python-layer-task-status', taskId) as PythonEnvironmentResponse,
  },
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
  getResourceUpdateStatus: async (): Promise<ResourceUpdateStatus> => await ipcRenderer.invoke('desktop:resource-update-status') as ResourceUpdateStatus,
  checkResourceUpdates: async (): Promise<ResourceUpdateStatus> => await ipcRenderer.invoke('desktop:check-resource-updates') as ResourceUpdateStatus,
  onResourceUpdateStatus: (listener: (status: ResourceUpdateStatus) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: ResourceUpdateStatus) => listener(status)
    ipcRenderer.on('desktop:resource-update-status', handler)
    return () => ipcRenderer.removeListener('desktop:resource-update-status', handler)
  },
  resources: {
    list: async (kind: ResourceKind): Promise<ResourceCheckResult> => await ipcRenderer.invoke('desktop:resource-list', kind) as ResourceCheckResult,
    dependents: async (id: string): Promise<string[]> => await ipcRenderer.invoke('desktop:resource-dependents', id) as string[],
    check: async (kind: ResourceKind, localOnly?: boolean): Promise<ResourceCheckResult> => await ipcRenderer.invoke('desktop:resource-check', kind, localOnly) as ResourceCheckResult,
    status: async (): Promise<{ checkedAt: string; results: ResourceCheckResult[] }> => await ipcRenderer.invoke('desktop:resource-status') as { checkedAt: string; results: ResourceCheckResult[] },
    update: async (kind: ResourceKind, id?: string): Promise<unknown> => await ipcRenderer.invoke('desktop:resource-update', kind, id) as unknown,
    rollback: async (kind: ResourceKind, id: string): Promise<unknown> => await ipcRenderer.invoke('desktop:resource-rollback', kind, id) as unknown,
    startJob: async (kind: ResourceKind, action: string, id?: string, source?: string): Promise<{ taskId: string }> => await ipcRenderer.invoke('desktop:resource-job-start', kind, action, id, source) as { taskId: string },
    getJob: async (taskId: string): Promise<ResourceJob | undefined> => await ipcRenderer.invoke('desktop:resource-job-get', taskId) as ResourceJob | undefined,
    statusJob: async (taskId: string): Promise<ResourceJob | undefined> => await ipcRenderer.invoke('desktop:resource-job-status', taskId) as ResourceJob | undefined,
    listJobs: async (): Promise<ResourceJob[]> => await ipcRenderer.invoke('desktop:resource-job-list') as ResourceJob[],
    retryJob: async (taskId: string): Promise<{ taskId: string }> => await ipcRenderer.invoke('desktop:resource-job-retry', taskId) as { taskId: string },
    cancelJob: async (taskId: string): Promise<ResourceJob | undefined> => await ipcRenderer.invoke('desktop:resource-job-cancel', taskId) as ResourceJob | undefined,
    onJob: (listener: (job: ResourceJob) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, job: ResourceJob) => listener(job)
      ipcRenderer.on('desktop:resource-job', handler)
      return () => ipcRenderer.removeListener('desktop:resource-job', handler)
    },
  },
})

mountWindowChrome()
