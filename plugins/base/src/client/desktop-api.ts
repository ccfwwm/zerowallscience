export type DesktopUpdatePhase = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'upToDate' | 'error' | 'unavailable'
export interface DesktopUpdateStatus { phase: DesktopUpdatePhase; currentVersion: string; version?: string; percent?: number; message?: string; notes?: string[] }
export type McpEnvironmentPhase = 'idle' | 'downloading' | 'verifying' | 'installing' | 'ready' | 'failed' | 'manual' | 'unavailable'
export interface McpEnvironmentStatus { phase: McpEnvironmentPhase; environmentVersion?: string; contentRevision?: number; currentSlot?: 'a' | 'b' | 'manual'; updated?: boolean; rollbackAvailable?: boolean; /** @deprecated */ version?: string; progress?: number; message?: string; python?: { ready: boolean; version?: string; sitePackages?: string; message?: string } }
export interface ZeroWallDesktopApi {
  info(): Promise<{ version: string; platform: string; architecture: string }>
  chooseDirectory(): Promise<string | null>
  revealPath?(path: string): Promise<boolean>
  openFolder?(path: string): Promise<boolean>
  openPptx?(path: string): Promise<boolean>
  copyFile?(input: { name: string; mediaType: string; data: string }): Promise<boolean>
  copyText?(text: string): Promise<boolean>
  copyImage?(input: { data: string }): Promise<boolean>
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
