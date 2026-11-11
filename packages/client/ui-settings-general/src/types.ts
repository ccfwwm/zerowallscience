/** Type-only Electron update declarations shared by the settings UI and Desktop compatibility checks. */

/** Classified failure copy selected by the Web locale without exposing raw updater diagnostics. */
export type DesktopUpdateFailureKind =
  | 'check'
  | 'check-network'
  | 'download'
  | 'download-network'
  | 'install'
  | 'install-network'
  | 'stop-failed'
  | 'tasks-changed'
  | 'tasks-unavailable'
  | 'fullscreen-timeout'

/** Public semantic preload fields consumed by the settings row. */
export interface DesktopUpdatePresentation {
  /** Whether the installed application supplies an update source. */
  readonly configured?: boolean
  /** Time of the last successful metadata check. */
  readonly checkedAt?: string
  readonly phase: 'idle' | 'checking' | 'available' | 'downloading' | 'verifying' | 'installing' | 'ready' | 'error'
  readonly version?: string
  readonly releaseDate?: string
  readonly releaseNotes?: string
  readonly percent?: number
  readonly failure?: DesktopUpdateFailureKind
  readonly hostRuntime?: HostRuntimeUpdateState
}

/** Independent Host Runtime update state shown beside the Desktop release state. */
export interface HostRuntimeUpdateState {
  readonly phase: 'idle' | 'checking' | 'available' | 'downloading' | 'staged' | 'error'
  readonly activeVersion?: string
  readonly candidateVersion?: string
  readonly message?: string
}

/** Optional carrier API; it cannot select artifacts or authorize installation. */
export interface DesktopUpdateBridge {
  status(): Promise<DesktopUpdatePresentation>
  open(): Promise<void>
  hostRuntimeCheck(): Promise<void>
  hostRuntimeStage(): Promise<void>
  hostRuntimeRestart(): Promise<void>
  subscribe(listener: (state: DesktopUpdatePresentation) => void): () => void
}

/** Shared carrier status for the account row and collapsed sidebar badge. */
export interface DesktopUpdateView {
  readonly presentation?: DesktopUpdatePresentation
  readonly failed: boolean
  readonly opening: boolean
}
