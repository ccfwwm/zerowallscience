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

/**
 * The science layer of the managed Python environment.
 *
 * Only the base layer ships inside the release archive; every other locked
 * package is described by a small, separately signed manifest published beside
 * the archive. The client resolves each package from `indexUrl` and must verify
 * `sha256`, because the release lock has no wheel URLs: a wheel filename is not
 * derivable from its hash. Nothing consumes these types yet — wiring the
 * installation path is a separate change.
 */
export interface PythonSciencePackage { name: string; version: string; sha256: string }
export interface PythonScienceManifest {
  schema: 1
  kind: 'zerowall-python-science'
  environmentId: 'zerowall-python'
  environmentVersion: string
  scienceRevision: number
  platform: 'win32'
  architecture: 'x64'
  python: { implementation: 'cpython'; version: string }
  /** pip index and its trusted host; passed through as `MirrorConfig`. */
  index: { indexUrl: string; trustedHost?: string }
  basePackageCount: number
  packageCount: number
  packages: PythonSciencePackage[]
  generatedAt: string
  signature: { algorithm: 'ed25519'; keyId: string; value: string }
}
/** Where the archive manifest points at the science layer it must be paired with. */
export interface PythonScienceReference {
  manifestUrl: string
  manifestSha256: string
  manifestSize: number
  scienceRevision: number
  contentRevision: number
  /** Package count in the science manifest; `corePackages` stays the shipped base layer. */
  packageCount: number
  indexUrl: string
}
export interface PythonUpdateJob { packageNames?: string[]; taskId: string; kind: string; stage: string; canPause: boolean; targetVersion?: string; receivedBytes?: number; totalBytes?: number; bytesPerSecond?: number; completedFiles?: number; totalFiles?: number }
export interface PythonPackagePlan { planId: string; snapshotId: string; requested: string[]; changes: Array<{ name: string; from?: string; to: string }>; error?: string; spaceEstimate?: { snapshotBytes: number; requiredBytes: number; measuredAt: string; estimate: string } }
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
  python?: { ready: boolean; version?: string; executable?: string; sitePackages?: string; overlayPath?: string; packageCount?: number; message?: string; /** Stable public paths; implementation snapshot paths are intentionally omitted from UI. */ runtimeRoot?: string; runtimeExecutable?: string; runtimeSitePackages?: string }
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
  /** Stable, user-facing runtime paths. These never contain slots/bio-tools/overlay. */
  runtimeRoot?: string
  runtimeExecutable?: string
  runtimeSitePackages?: string
  packageCount?: number
  corePackageCount?: number
  overlayPackageCount?: number
  packages: McpPythonPackage[]
  skillAudit?: McpSkillAudit
  verification?: { imports: boolean; pipCheck: boolean; message: string; installed?: number; failedPackages?: string[]; upToDate?: boolean }
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
