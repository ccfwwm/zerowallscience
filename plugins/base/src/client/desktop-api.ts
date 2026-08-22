export type DesktopUpdatePhase = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'upToDate' | 'error' | 'unavailable'
export interface DesktopUpdateStatus { phase: DesktopUpdatePhase; currentVersion: string; version?: string; percent?: number; message?: string; notes?: string[] }
export type McpEnvironmentPhase = 'idle' | 'downloading' | 'verifying' | 'installing' | 'ready' | 'failed' | 'manual' | 'unavailable'
export interface McpEnvironmentStatus { phase: McpEnvironmentPhase; version?: string; progress?: number; message?: string }
export interface ZeroWallDesktopApi {
  info(): Promise<{ version: string; platform: string; architecture: string }>
  chooseDirectory(): Promise<string | null>
  getUpdateStatus(): Promise<DesktopUpdateStatus>
  checkForUpdates(): Promise<DesktopUpdateStatus>
  downloadUpdate(): Promise<DesktopUpdateStatus>
  installUpdate(): Promise<boolean>
  getMcpEnvironmentStatus?(): Promise<McpEnvironmentStatus>
  retryMcpEnvironment?(): Promise<McpEnvironmentStatus>
  selectMcpEnvironment?(): Promise<McpEnvironmentStatus>
  onMcpEnvironmentStatus?(listener: (status: McpEnvironmentStatus) => void): () => void
  onUpdateStatus(listener: (status: DesktopUpdateStatus) => void): () => void
}
declare global { interface Window { zerowallDesktop?: ZeroWallDesktopApi } }
