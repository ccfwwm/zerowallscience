export interface ClaudeCodeStatus {
  desktop: boolean
  installed: boolean
  version?: string
  /** Application-managed CLI; never a PATH lookup or the user's Claude install. */
  executablePath?: string
  rollbackAvailable: boolean
  running: boolean
  readiness?: 'installed' | 'unavailable'
}

export type ClaudePermissionMode = 'default' | 'dontAsk' | 'acceptEdits' | 'auto' | 'plan' | 'bypassPermissions'
export type ClaudePermissionSelector = 'plugin' | 'native'
export type ClaudeRenderer = 'plugin' | 'native'
export type ClaudeProse = 'plain' | 'enhanced'
export interface ClaudeNativeSettings {
  outputStyle?: string
  permissionSelector?: ClaudePermissionSelector
  permissionMode?: ClaudePermissionMode
  renderer?: ClaudeRenderer
  prose?: ClaudeProse
  worktreeBranchPrefix?: string
  maxProcesses?: number
  idleTimeoutMinutes?: number
}

export type ClaudeGlobalSettingEffect = 'immediate' | 'new-session' | 'next-turn' | 'next-worktree' | 'restart'
export interface ClaudeGlobalSettingOption {
  value: string
  label: string
  source: 'built-in' | 'user' | 'configured'
}
export type ClaudeGlobalSetting = {
  key: string
  kind: 'select'
  value: string
  options: readonly ClaudeGlobalSettingOption[]
  effect: ClaudeGlobalSettingEffect
  available?: boolean
  unavailableReason?: string
} | {
  key: string
  kind: 'text'
  value: string
  maxLength: number
  effect: ClaudeGlobalSettingEffect
  available?: boolean
  unavailableReason?: string
}
export interface ClaudeGlobalSettingsView {
  settings: readonly ClaudeGlobalSetting[]
}

/** Settings-page operations do not belong to a conversation Agent. */
export interface ClaudeCodeSettingsApi {
  status: () => Promise<ClaudeCodeStatus>
  install: () => Promise<ClaudeCodeStatus>
  rollback: () => Promise<ClaudeCodeStatus>
  uninstall: () => Promise<ClaudeCodeStatus>
  settings?: () => Promise<ClaudeNativeSettings>
  updateSettings?: (settings: Partial<ClaudeNativeSettings>) => Promise<ClaudeNativeSettings>
  globalSettings?: () => Promise<ClaudeGlobalSettingsView>
  updateGlobalSettings?: (changes: Record<string, string>) => Promise<ClaudeGlobalSettingsView>
}
export interface ClaudeCodeTurn {
  id: string
  provider: string
  model: string
  /** Absolute CLI entrypoint captured for this turn, before spawning it. */
  executablePath?: string
  running: boolean
  output: string
  exitCode?: number | null
  message?: string
  skills: number
  mcp: number
  skipped: string[]
  renderer?: ClaudeRenderer
  turn?: number
  step?: number
  activity?: ClaudeActivityBlock[]
  nativeSessionId?: string
  resumed?: boolean
  permission?: ClaudePermissionView
  resources?: ClaudeResourceStatus[]
  diagnostic?: { id: string; category: string }
}

export interface ClaudeResourceStatus {
  kind: 'skill' | 'mcp'
  name: string
  state: 'synced' | 'manual' | 'disabled' | 'unavailable' | 'failed'
  detail?: string
}

export interface ClaudePermissionView {
  active: boolean
  source: ClaudePermissionSelector
  mode: ClaudePermissionMode
  hostPreset: string
  hostSandbox: string
  hostApproval: string
  runningMode?: ClaudePermissionMode
  nativeOptions: Array<{ value: string; name: string; description?: string }>
}

export interface ClaudeActivityBlock {
  index: number
  kind: 'text' | 'reasoning' | 'tool-call'
  text: string
  ended: boolean
  id?: string
  name?: string
  result?: string
  failed?: boolean
  answer?: boolean
}
export interface ClaudeTranscript {
  turn: number
  step: number
  renderer: ClaudeRenderer
  running: boolean
  activity: ClaudeActivityBlock[]
}
declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    'zerowall-claude/turn': { turn: number; step: number }
    'zerowall-claude/transcript': ClaudeTranscript
    'zerowall-claude/permission': { mode: ClaudePermissionMode }
  }
}
