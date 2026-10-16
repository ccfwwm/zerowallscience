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
  finishedAt?: number
  segment?: string
  durationMs?: number
  diagnostics?: { code?: string; applicationVersion?: string; buildId?: string; contentDigest?: string; extraFiles?: number; missingFiles?: number; sizeMismatches?: number; hashMismatches?: number; logicalArchiveMismatch?: { extraFiles?: number; missingFiles?: number; sizeMismatches?: number; hashMismatches?: number } }
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
export type PythonDependencyLayer = 'core' | 'science' | 'capability'
export type McpSkillDependencyStatus = 'ready' | 'managed' | 'missing' | 'external' | 'incompatible'
export interface McpSkillDependency { name: string; import?: (string) | undefined; status: McpSkillDependencyStatus; reason?: (string) | undefined }
export interface McpSkillCapability { name: string; path: string; status: McpSkillDependencyStatus; reason?: (string) | undefined; detectedImports: string[]; requirements: McpSkillDependency[] }
export interface McpSkillAudit { summary: Record<McpSkillDependencyStatus, number>; skills: McpSkillCapability[] }
export interface PythonEnvironmentIdentity { snapshotId: string; environmentVersion: string; contentRevision: number; pythonVersion: string; localRevision?: (number) | undefined }

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
  index: { indexUrl: string; trustedHost?: (string) | undefined }
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
export interface PythonUpdateJob { packageNames?: (string[]) | undefined; taskId: string; kind: string; stage: string; canPause: boolean; targetVersion?: (string) | undefined; receivedBytes?: (number) | undefined; totalBytes?: (number) | undefined; bytesPerSecond?: (number) | undefined; completedFiles?: (number) | undefined; totalFiles?: (number) | undefined; logLines?: (string[]) | undefined }
export type PythonTaskState = 'queued' | 'running' | 'succeeded' | 'partial' | 'failed' | 'interrupted' | 'cancelled'
export interface PythonDependencyTask {
  taskId: string
  ownerPid?: number | undefined
  underlyingTaskId?: (string) | undefined
  requestId: string
  /** True when the desktop startup reconciler owns this task and may resume it. */
  automatic?: boolean | undefined
  action: 'check_manifest' | 'preview_sync' | 'apply_sync' | 'sync' | 'install_package' | 'install_runtime'
  layer: PythonDependencyLayer
  packageSpec?: (string) | undefined
  state: PythonTaskState
  stage: string
  progress?: (number) | undefined
  completedPackages?: (number) | undefined
  totalPackages?: (number) | undefined
  currentPackage?: (string) | undefined
  message?: (string) | undefined
  error?: (string) | undefined
  logLines: string[]
  createdAt: string
  updatedAt: string
  completedAt?: (string) | undefined
  result?: (Record<string, unknown>) | undefined
}
export interface PythonPackagePlan { planId: string; snapshotId: string; requested: string[]; changes: Array<{ name: string; from?: (string) | undefined; to: string }>; error?: (string) | undefined; spaceEstimate?: ({ snapshotBytes: number; requiredBytes: number; measuredAt: string; estimate: string }) | undefined }
export interface McpEnvironmentStatus {
  activeEnvironment?: (PythonEnvironmentIdentity) | undefined
  updateJob?: (PythonUpdateJob) | undefined
  packageInventory?: (McpPythonInfo) | undefined
  phase: McpEnvironmentPhase
  environmentVersion?: (string) | undefined
  contentRevision?: (number) | undefined
  currentSlot?: ('a' | 'b' | 'manual') | undefined
  updated?: (boolean) | undefined
  rollbackAvailable?: (boolean) | undefined
  /** @deprecated kept for older renderer consumers. */
  version?: (string) | undefined
  progress?: (number) | undefined
  message?: (string) | undefined
  onlineEnvironmentVersion?: (string) | undefined
  onlineContentRevision?: (number) | undefined
  updateAvailable?: (boolean) | undefined
  updateRequired?: (boolean) | undefined
  lastCheckedAt?: (string) | undefined
  lastUpdateError?: (string) | undefined
  /** Stable layer state; a ready interpreter does not imply the science layer is installed. */
  layers?: ({
    bootstrap: 'missing' | 'ready' | 'error'
    core: 'missing' | 'ready' | 'error'
    science: 'not-installed' | 'checking' | 'available' | 'installed' | 'error'
    capabilities?: (Record<string, 'not-installed' | 'checking' | 'available' | 'installed' | 'error'>) | undefined
  }) | undefined
  resourceAvailability?: ({ layer: PythonDependencyLayer; available: boolean; source?: (string) | undefined; reason?: (string) | undefined; packageCount?: (number) | undefined }) | undefined
  lastSyncError?: (string) | undefined
  skillAudit?: (McpSkillAudit) | undefined
  python?: ({ ready: boolean; version?: (string) | undefined; executable?: (string) | undefined; sitePackages?: (string) | undefined; packageCount?: (number) | undefined; message?: (string) | undefined; /** Stable public paths; implementation snapshot paths are intentionally omitted from UI. */ runtimeRoot?: (string) | undefined; runtimeExecutable?: (string) | undefined; runtimeSitePackages?: (string) | undefined }) | undefined
}

export interface McpPythonPackage { dependencies?: (string[]) | undefined; upgradeHistory?: (Array<{ from?: (string) | undefined; to: string; verifiedAt: string }>) | undefined; verificationMessage?: (string) | undefined; previousVersion?: (string) | undefined; customized?: (boolean) | undefined; shadowedVersion?: (string) | undefined; latestError?: (string) | undefined; compatibleVersion?: (string) | undefined;  name: string; version: string; location?: (string) | undefined; source: 'core' | 'custom'; requiredVersion?: (string) | undefined; latestVersion?: (string) | undefined; updateAvailable?: (boolean) | undefined; health: 'healthy' | 'update-available' | 'locked' }
export interface McpPythonInfo {
  pipReady?: (boolean) | undefined
  snapshotId?: (string) | undefined
  environmentVersion?: (string) | undefined
  contentRevision?: (number) | undefined
  localRevision?: (number) | undefined
  scannedAt?: (string) | undefined
  /** True only when packages contains the complete site-packages inventory. */
  inventoryComplete?: (boolean) | undefined
  officialPackageCount?: (number) | undefined
  ready: boolean
  version?: (string) | undefined
  executable?: (string) | undefined
  sitePackages?: (string) | undefined
  /** Stable, user-facing paths into the application's single shared Python runtime. */
  runtimeRoot?: (string) | undefined
  runtimeExecutable?: (string) | undefined
  runtimeSitePackages?: (string) | undefined
  packageCount?: (number) | undefined
  corePackageCount?: (number) | undefined
  sciencePackageCount?: (number) | undefined
  scienceInstalledPackageCount?: (number) | undefined
  /** The interpreter can exist while the signed MCP runtime closure is absent. */
  coreReady?: (boolean) | undefined
  missingCorePackages?: (string[]) | undefined
  packages: McpPythonPackage[]
  skillAudit?: (McpSkillAudit) | undefined
  verification?: ({ imports: boolean; pipCheck: boolean; message: string; installed?: (number) | undefined; failedPackages?: (string[]) | undefined; upToDate?: (boolean) | undefined }) | undefined
  message?: (string) | undefined
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
