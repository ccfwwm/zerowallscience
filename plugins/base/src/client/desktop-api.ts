export type DesktopUpdatePhase = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'upToDate' | 'error' | 'unavailable'
export interface DesktopUpdateStatus { phase: DesktopUpdatePhase; currentVersion: string; version?: string; percent?: number; message?: string; notes?: string[] }
export type McpEnvironmentPhase = 'idle' | 'checking' | 'downloading' | 'verifying' | 'installing' | 'ready' | 'failed' | 'manual' | 'unavailable'
export type McpSkillDependencyStatus = 'ready' | 'managed' | 'optional' | 'external' | 'incompatible'
export interface McpSkillCapability { name: string; path: string; status: McpSkillDependencyStatus; reason?: string; detectedImports: string[]; requirements: Array<{ name: string; import?: string; status: McpSkillDependencyStatus; reason?: string }> }
export interface McpSkillAudit { summary: Record<McpSkillDependencyStatus, number>; skills: McpSkillCapability[] }
export interface McpEnvironmentStatus { phase: McpEnvironmentPhase; environmentVersion?: string; contentRevision?: number; currentSlot?: 'a' | 'b' | 'manual'; updated?: boolean; rollbackAvailable?: boolean; /** @deprecated */ version?: string; progress?: number; message?: string; onlineEnvironmentVersion?: string; onlineContentRevision?: number; updateAvailable?: boolean; updateRequired?: boolean; lastCheckedAt?: string; lastUpdateError?: string; skillAudit?: McpSkillAudit; python?: { ready: boolean; version?: string; executable?: string; sitePackages?: string; overlayPath?: string; packageCount?: number; message?: string } }
export interface McpPythonPackage { name: string; version: string; location?: string; source: 'core' | 'overlay'; requiredVersion?: string; latestVersion?: string; updateAvailable?: boolean; health: 'healthy' | 'update-available' | 'locked' }
export interface McpPythonInfo { ready: boolean; version?: string; executable?: string; sitePackages?: string; overlayPath?: string; packageCount?: number; corePackageCount?: number; overlayPackageCount?: number; packages: McpPythonPackage[]; skillAudit?: McpSkillAudit; verification?: { imports: boolean; pipCheck: boolean; message: string }; message?: string }
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
  checkMcpEnvironment?(): Promise<McpEnvironmentStatus>
  updateMcpEnvironment?(): Promise<McpEnvironmentStatus>
  getMcpPythonInfo?(query?: string): Promise<McpPythonInfo>
  installMcpPythonPackage?(spec: string): Promise<McpPythonInfo>
  checkMcpPythonPackageUpdates?(): Promise<McpPythonInfo>
  updateMcpPythonPackages?(names?: string[]): Promise<McpPythonInfo>
  onMcpEnvironmentStatus?(listener: (status: McpEnvironmentStatus) => void): () => void
  onUpdateStatus(listener: (status: DesktopUpdateStatus) => void): () => void
}
declare global { interface Window { zerowallDesktop?: ZeroWallDesktopApi } }
