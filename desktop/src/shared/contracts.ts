export type RuntimePhase = 'idle' | 'starting' | 'ready' | 'stopping' | 'failed'

export interface RuntimeSnapshot {
  phase: RuntimePhase
  message: string
  launchDirectory?: string
  url?: string
  logs: string[]
}

export interface StartupStatus {
  phase: 'starting' | 'failed' | 'ready'
  progress: number
  message: string
  startedAt: number
}

export interface DesktopInfo {
  version: string
  platform: NodeJS.Platform
  architecture: string
}

export interface DesktopClipboardFile {
  name: string
  mediaType: string
  data: string
}

export interface DesktopClipboardImage {
  data: string
}

export type McpEnvironmentPhase = 'idle' | 'checking' | 'downloading' | 'verifying' | 'installing' | 'ready' | 'failed' | 'manual' | 'unavailable' | 'paused'
export type McpSkillDependencyStatus = 'ready' | 'managed' | 'optional' | 'external' | 'incompatible'
export interface McpSkillDependency { name: string; import?: string; status: McpSkillDependencyStatus; reason?: string }
export interface McpSkillCapability { name: string; path: string; status: McpSkillDependencyStatus; reason?: string; detectedImports: string[]; requirements: McpSkillDependency[] }
export interface McpSkillAudit { summary: Record<McpSkillDependencyStatus, number>; skills: McpSkillCapability[] }
export interface PythonEnvironmentIdentity { snapshotId: string; environmentVersion: string; contentRevision: number; pythonVersion: string; localRevision?: number }
export interface PythonUpdateJob { packageNames?: string[]; taskId: string; kind: string; stage: string; canPause: boolean; targetVersion?: string; receivedBytes?: number; totalBytes?: number; bytesPerSecond?: number; completedFiles?: number; totalFiles?: number }
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
  python?: { ready: boolean; version?: string; executable?: string; sitePackages?: string; overlayPath?: string; packageCount?: number; message?: string }
}

export interface McpPythonPackage { dependencies?: string[]; upgradeHistory?: Array<{ from?: string; to: string; verifiedAt: string }>; verificationMessage?: string; previousVersion?: string; customized?: boolean; shadowedVersion?: string; latestError?: string; compatibleVersion?: string;  name: string; version: string; location?: string; source: 'core' | 'overlay'; requiredVersion?: string; latestVersion?: string; updateAvailable?: boolean; health: 'healthy' | 'update-available' | 'locked' }
export interface McpPythonInfo {
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
  overlayPath?: string
  packageCount?: number
  corePackageCount?: number
  overlayPackageCount?: number
  packages: McpPythonPackage[]
  skillAudit?: McpSkillAudit
  verification?: { imports: boolean; pipCheck: boolean; message: string }
  message?: string
}

export type DesktopUpdatePhase = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'upToDate' | 'error' | 'unavailable'

export interface DesktopUpdateStatus {
  phase: DesktopUpdatePhase
  currentVersion: string
  version?: string
  percent?: number
  message?: string
  /** Sanitized release notes supplied by the Stable update feed. */
  notes?: string[]
}
