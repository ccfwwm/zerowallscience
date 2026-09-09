export type RuntimePhase = 'idle' | 'starting' | 'ready' | 'stopping' | 'failed'

export interface RuntimeSnapshot {
  phase: RuntimePhase
  message: string
  launchDirectory?: string
  url?: string
  logs: string[]
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

export type McpEnvironmentPhase = 'idle' | 'checking' | 'downloading' | 'verifying' | 'installing' | 'ready' | 'failed' | 'manual' | 'unavailable'
export type McpSkillDependencyStatus = 'ready' | 'managed' | 'optional' | 'external' | 'incompatible'
export interface McpSkillDependency { name: string; import?: string; status: McpSkillDependencyStatus; reason?: string }
export interface McpSkillCapability { name: string; path: string; status: McpSkillDependencyStatus; reason?: string; detectedImports: string[]; requirements: McpSkillDependency[] }
export interface McpSkillAudit { summary: Record<McpSkillDependencyStatus, number>; skills: McpSkillCapability[] }
export interface McpEnvironmentStatus {
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

export interface McpPythonPackage { name: string; version: string; location?: string; source: 'core' | 'overlay'; requiredVersion?: string; latestVersion?: string; updateAvailable?: boolean; health: 'healthy' | 'update-available' | 'locked' }
export interface McpPythonInfo {
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
