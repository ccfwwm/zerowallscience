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

export type McpEnvironmentPhase = 'idle' | 'downloading' | 'verifying' | 'installing' | 'ready' | 'failed' | 'manual' | 'unavailable'
export interface McpEnvironmentStatus {
  phase: McpEnvironmentPhase
  version?: string
  progress?: number
  message?: string
  python?: { ready: boolean; version?: string; executable?: string; sitePackages?: string; message?: string }
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
