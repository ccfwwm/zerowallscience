export type DesktopUpdatePhase = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'upToDate' | 'error' | 'unavailable'
export interface DesktopUpdateStatus { phase: DesktopUpdatePhase; currentVersion: string; version?: string; percent?: number; message?: string; notes?: string[] }
export type McpEnvironmentPhase = 'idle' | 'checking' | 'downloading' | 'verifying' | 'installing' | 'ready' | 'failed' | 'manual' | 'unavailable' | 'paused'
export type McpSkillDependencyStatus = 'ready' | 'managed' | 'missing' | 'external' | 'incompatible'
export interface McpSkillDependency { name: string; import?: string; status: McpSkillDependencyStatus; reason?: string }
export interface McpSkillCapability { name: string; path: string; status: McpSkillDependencyStatus; reason?: string; detectedImports: string[]; requirements: McpSkillDependency[] }
export interface McpSkillAudit { summary: Record<McpSkillDependencyStatus, number>; skills: McpSkillCapability[] }
export interface PythonEnvironmentIdentity { snapshotId: string; environmentVersion: string; contentRevision: number; pythonVersion: string; localRevision?: number }
export interface PythonUpdateJob { packageNames?: string[]; taskId: string; kind: string; stage: string; canPause: boolean; targetVersion?: string; receivedBytes?: number; totalBytes?: number; bytesPerSecond?: number; completedFiles?: number; totalFiles?: number; logLines?: string[] }
export interface PythonDependencyTask { taskId: string; underlyingTaskId?: string; requestId: string; action: 'check_manifest' | 'preview_sync' | 'apply_sync' | 'sync'; layer: 'core' | 'science' | 'capability'; state: 'queued' | 'running' | 'succeeded' | 'failed' | 'interrupted'; stage: string; progress?: number; completedPackages?: number; totalPackages?: number; currentPackage?: string; message?: string; error?: string; logLines: string[]; createdAt: string; updatedAt: string; completedAt?: string; result?: Record<string, any> }
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
  layers?: { bootstrap: 'missing' | 'ready' | 'error'; core: 'missing' | 'ready' | 'error'; science: 'not-installed' | 'checking' | 'available' | 'installed' | 'error'; capabilities?: Record<string, 'not-installed' | 'checking' | 'available' | 'installed' | 'error'> }
  resourceAvailability?: { layer: 'core' | 'science' | 'capability'; available: boolean; source?: string; reason?: string; packageCount?: number }
  lastSyncError?: string
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
  inventoryComplete?: boolean
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
  runtimeRoot?: string
  restartRequired?: boolean
  /** Selectable mirrors; the saved index is appended when it is not a preset. */
  mirrorPresets?: PythonMirrorPresetInfo[]
  /** Default index, so the panel can show which preset is active without guessing. */
  defaultMirrorUrl?: string
  diagnostics?: PythonEnvironmentDiagnostics
  plan?: PythonPackagePlan & { manifestRevision?: string }
  manifest?: { revision: string; packageCount: number }
  taskId?: string
  task?: PythonDependencyTask
  queued?: boolean
  status?: McpEnvironmentStatus
  inventory?: McpPythonInfo
  /** `sync` only: the changes it is applying, and whether it found anything to do. */
  changes?: Array<{ name: string; from?: string; to: string }>
  upToDate?: boolean
  previousRevision?: string
  dependencies?: { revision: string; manifestRevision: string; manifestSha256: string; layer?: 'core' | 'science' | 'capability'; capabilityId?: string; packageCount: number; installedPackageCount?: number; pendingPackageCount?: number; unresolvedPackageCount?: number; partial?: boolean; skippedPackages?: Array<{ name: string; version: string; message: string }>; pythonVersion: string; environmentVersion?: string; checkedAt: string; changes: Array<{ name: string; from?: string; to: string; required: boolean; capabilities: string[] }>; source: 'remote' | 'bundled' | 'cache'; remoteError?: string; lastSyncError?: string; resourceAvailability?: { layer: 'core' | 'science' | 'capability'; available: boolean; source?: string; reason?: string; packageCount?: number }; scienceInstalled?: boolean; available?: boolean }
  events?: Array<{ action: string; requestId: string; createdAt: string; status: 'queued' | 'succeeded' | 'failed' | 'running'; message?: string; logLine?: string; taskId?: string; upToDate?: boolean }>
}

export type ResourceKind = 'plugin' | 'skill' | 'mcp'
export interface ResourceCheckItem {
  id: string
  version: string
  installedVersion?: string
  updateAvailable?: boolean
  signed?: boolean
  restartRequired?: boolean
  rollbackSupported?: boolean
  /** Where the active resource comes from: user profile, app bundle, DSH runtime, or catalog. */
  source?: 'profile' | 'bundled' | 'runtime' | 'catalog' | 'removed' | 'disabled'
  /** Whether the displayed metadata came from the signed remote catalog. */
  catalogSigned?: boolean
}
export interface ResourceCheckResult { kind: ResourceKind; checkedAt: string; resources: ResourceCheckItem[]; catalogStatus?: 'checked' | 'unavailable' | 'local' | 'unpublished'; error?: string }
export interface ResourceJob { taskId: string; kind: ResourceKind; id?: string; action: string; source?: string; status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'; phase?: string; progress?: number; oldVersion?: string; newVersion?: string; retries?: number; retryOf?: string; cancelRequested?: boolean; error?: string; result?: unknown; createdAt: string; updatedAt: string }

export interface ZeroWallDesktopApi {
  restart?(): Promise<boolean>
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
  pythonEnvironment?(request: { action: 'status' | 'task_status' | 'check_manifest' | 'preview_sync' | 'apply_sync' | 'sync' | 'install_package' | 'list_packages' | 'configure' | 'diagnose' | 'rollback'; requestId: string; taskId?: string; layer?: 'core' | 'science' | 'capability'; packageSpec?: string; capabilityId?: string; planId?: string; manifestRevision?: string; mirrorUrl?: string; runtimeRoot?: string; expectedRevision?: number; confirm?: boolean }): Promise<PythonEnvironmentResponse>
  pauseMcpEnvironment?(): Promise<McpEnvironmentStatus>
  rollbackMcpEnvironment?(): Promise<{ taskId: string }>
  previewMcpPythonPackages?(names: string[]): Promise<PythonPackagePlan>
  applyMcpPythonPackagePlan?(planId: string): Promise<{ taskId: string }>
  onMcpEnvironmentStatus?(listener: (status: McpEnvironmentStatus) => void): () => void
  onUpdateStatus(listener: (status: DesktopUpdateStatus) => void): () => void
  resources?: {
    check(kind: ResourceKind, localOnly?: boolean): Promise<ResourceCheckResult>
    status?(): Promise<{ checkedAt: string; results: ResourceCheckResult[] }>
    update(kind: ResourceKind, id?: string): Promise<unknown>
    rollback(kind: ResourceKind, id: string): Promise<unknown>
    startJob(kind: ResourceKind, action: string, id?: string, source?: string): Promise<{ taskId: string }>
    getJob(taskId: string): Promise<ResourceJob | undefined>
    listJobs(): Promise<ResourceJob[]>
    cancelJob(taskId: string): Promise<ResourceJob | undefined>
    onJob(listener: (job: ResourceJob) => void): () => void
  }
}
declare global { interface Window { zerowallDesktop?: ZeroWallDesktopApi } }
