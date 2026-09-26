export type DesktopUpdatePhase = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'upToDate' | 'error' | 'unavailable'
export interface DesktopUpdateStatus { phase: DesktopUpdatePhase; currentVersion: string; version?: string; percent?: number; message?: string; notes?: string[] }
export type McpEnvironmentPhase = 'idle' | 'checking' | 'downloading' | 'verifying' | 'installing' | 'ready' | 'failed' | 'manual' | 'unavailable' | 'paused'
export type McpSkillDependencyStatus = 'ready' | 'managed' | 'missing' | 'external' | 'incompatible'
export interface McpSkillDependency { name: string; import?: string; status: McpSkillDependencyStatus; reason?: string }
export interface McpSkillCapability { name: string; path: string; status: McpSkillDependencyStatus; reason?: string; detectedImports: string[]; requirements: McpSkillDependency[] }
export interface McpSkillAudit { summary: Record<McpSkillDependencyStatus, number>; skills: McpSkillCapability[] }
export interface PythonEnvironmentIdentity { snapshotId: string; environmentVersion: string; contentRevision: number; pythonVersion: string; localRevision?: number }
export interface PythonUpdateJob { packageNames?: string[]; taskId: string; kind: string; stage: string; canPause: boolean; targetVersion?: string; receivedBytes?: number; totalBytes?: number; bytesPerSecond?: number; completedFiles?: number; totalFiles?: number; logLines?: string[] }
export interface PythonPackagePlan { planId: string; snapshotId: string; requested: string[]; changes: Array<{ name: string; from?: string; to: string }>; error?: string }
export interface McpEnvironmentStatus {
  activeEnvironment?: PythonEnvironmentIdentity
  updateJob?: PythonUpdateJob
  packageInventory?: McpPythonInfo
  phase: McpEnvironmentPhase
  environmentVersion?: string
  contentRevision?: number
  currentSlot?: 'a' | 'b' | 'manual'
  updated?: boolean
  rollbackAvailable?: boolean
  /** @deprecated kept for older renderer consumers. */
  version?: string
  progress?: number
  message?: string
  onlineEnvironmentVersion?: string
  onlineContentRevision?: number
  updateAvailable?: boolean
  updateRequired?: boolean
  lastCheckedAt?: string
  lastUpdateError?: string
  skillAudit?: McpSkillAudit
  python?: { ready: boolean; version?: string; executable?: string; sitePackages?: string; packageCount?: number; message?: string }
}

export interface McpPythonPackage { capabilities?: string[]; sha256?: string; dependencies?: string[]; upgradeHistory?: Array<{ from?: string; to: string; verifiedAt: string }>; verificationMessage?: string; previousVersion?: string; customized?: boolean; shadowedVersion?: string; latestError?: string; compatibleVersion?: string;  name: string; version: string; location?: string; source: 'core' | 'custom'; requiredVersion?: string; latestVersion?: string; updateAvailable?: boolean; health: 'healthy' | 'update-available' | 'locked' }
export interface McpPythonInfo {
  runtimeRoot?: string
  profiles?: Array<{ name: string; status: 'ready' | 'stale'; sitePackages: string; packages: Array<{ name: string; version: string }> }>
  snapshotId?: string
  environmentVersion?: string
  contentRevision?: number
  localRevision?: number
  scannedAt?: string
  officialPackageCount?: number
  ready: boolean
  version?: string
  executable?: string
  sitePackages?: string
  packageCount?: number
  corePackageCount?: number
  overlayPackageCount?: number
  packages: McpPythonPackage[]
  skillAudit?: McpSkillAudit
  verification?: { imports: boolean; pipCheck: boolean; message: string; installed?: number; failedPackages?: string[]; upToDate?: boolean }
  message?: string
}

export interface PythonEnvironmentDiagnostics {
  checkedAt: string
  python: { status: string; message?: string }
  pip: { status: string; message?: string }
  tls: { status: string; message?: string; caPath?: string }
  mirror: { status: string; message?: string }
}
export interface PythonMirrorPresetInfo {
  id: string
  label: string
  indexUrl: string
  custom: boolean
}
export interface PythonEnvironmentResponse {
  requestId: string
  revision?: number
  mirrorUrl?: string
  /** Selectable mirrors; the saved index is appended when it is not a preset. */
  mirrorPresets?: PythonMirrorPresetInfo[]
  /** Default index, so the panel can show which preset is active without guessing. */
  defaultMirrorUrl?: string
  diagnostics?: PythonEnvironmentDiagnostics
  plan?: PythonPackagePlan & { manifestRevision?: string }
  manifest?: { revision: string; packageCount: number }
  taskId?: string
  status?: McpEnvironmentStatus
  inventory?: McpPythonInfo
  /** `sync` only: the changes it is applying, and whether it found anything to do. */
  changes?: Array<{ name: string; from?: string; to: string }>
  upToDate?: boolean
  previousRevision?: string
  dependencies?: { revision: number; manifestRevision: string; manifestSha256: string; packageCount: number; pythonVersion: string; checkedAt: string; changes: Array<{ name: string; from?: string; to: string; required: boolean; capabilities: string[] }>; source: 'remote' | 'bundled' | 'cache' }
  events?: Array<{ action: string; requestId: string; createdAt: string; status: 'succeeded' | 'failed' | 'running'; message?: string; logLine?: string; taskId?: string }>
}

export interface ZeroWallDesktopApi {
  info(): Promise<{ version: string; platform: string; architecture: string }>
  chooseDirectory(): Promise<string | null>
  chooseScienceFile?(extensions?: string[]): Promise<string | null>
  revealPath?(path: string): Promise<boolean>
  openFolder?(path: string): Promise<boolean>
  openPythonTerminal?(): Promise<boolean>
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
  installMcpPythonPackage?(spec: string): Promise<{ taskId: string }>
  checkMcpPythonPackageUpdates?(names?: string[]): Promise<McpPythonInfo>
  updateMcpPythonPackages?(names?: string[]): Promise<{ taskId: string }>
  pythonEnvironment?(request: { action: 'status' | 'check_manifest' | 'preview_sync' | 'apply_sync' | 'sync' | 'list_packages' | 'configure' | 'diagnose' | 'rollback'; requestId: string; planId?: string; manifestRevision?: string; mirrorUrl?: string; expectedRevision?: number; confirm?: boolean }): Promise<PythonEnvironmentResponse>
  pauseMcpEnvironment?(): Promise<McpEnvironmentStatus>
  rollbackMcpEnvironment?(): Promise<{ taskId: string }>
  previewMcpPythonPackages?(names: string[]): Promise<PythonPackagePlan>
  applyMcpPythonPackagePlan?(planId: string): Promise<{ taskId: string }>
  onMcpEnvironmentStatus?(listener: (status: McpEnvironmentStatus) => void): () => void
  onUpdateStatus(listener: (status: DesktopUpdateStatus) => void): () => void
}
declare global { interface Window { zerowallDesktop?: ZeroWallDesktopApi } }
