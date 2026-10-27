export interface ClaudeCodeStatus {
  desktop: boolean
  installed: boolean
  version?: string
  /** Application-managed CLI; never a PATH lookup or the user's Claude install. */
  executablePath?: string
  rollbackAvailable: boolean
  running: boolean
  readiness?: 'installed' | 'unavailable'
  diagnostic?: string
}

export type ClaudePermissionMode = 'default' | 'dontAsk' | 'acceptEdits' | 'auto' | 'plan' | 'bypassPermissions'
export type ClaudePermissionSelector = 'plugin' | 'native'
export type ClaudeRenderer = 'plugin' | 'native'
export type ClaudeProse = 'plain' | 'enhanced'
/** `auto` keeps the provider default; aliases are retained for old settings.
 * Numeric values allow an explicit token budget from the settings UI. */
export type ClaudeContextWindow = 'auto' | '200k' | '1m' | number
export type ClaudeAutoCompactWindow = 'auto' | number
export type ClaudePromptCacheTtl = 'auto' | '5m' | '1h'
export interface ClaudeNativeSettings {
  outputStyle?: string
  permissionSelector?: ClaudePermissionSelector
  permissionMode?: ClaudePermissionMode
  renderer?: ClaudeRenderer
  prose?: ClaudeProse
  maxProcesses?: number
  contextWindow?: ClaudeContextWindow
  autoCompactWindow?: ClaudeAutoCompactWindow
  promptCacheTtl?: ClaudePromptCacheTtl
  subagentPromptCacheTtl?: ClaudePromptCacheTtl
}

export interface ClaudeEffectiveSetting {
  requested: string
  effective: string
  source: 'auto' | 'explicit' | 'external' | 'clamped' | 'unsupported'
  available: boolean
  reason?: string
  effect: ClaudeGlobalSettingEffect
}

export interface ClaudeModelCapabilities {
  model: string
  contextWindow: number
  supports1m: boolean
  supportsAutoCompact: boolean
  source: 'model-id' | 'default'
}

export interface ClaudeApiUsage {
  input_tokens?: number
  output_tokens?: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

export interface ClaudeContextUsage {
  totalTokens: number
  maxTokens: number
  rawMaxTokens?: number
  percentage: number
  autoCompactThreshold?: number
  /** Present only when the managed Claude runtime reports its real state. */
  isAutoCompactEnabled?: boolean
  detail: 'summary' | 'full'
  apiUsage?: ClaudeApiUsage
}

export interface ClaudeCommandDescriptor {
  name: string
  description?: string
  argumentHint?: string
}

export interface ClaudeCliState {
  active: boolean
  queued: boolean
  sessionId?: string
  model?: string
  commands: ClaudeCommandDescriptor[]
  output: string
  contextUsage?: ClaudeContextUsage
  lastCompact?: { trigger: 'manual' | 'auto'; preTokens: number; postTokens?: number; durationMs?: number }
  error?: string
  diagnostics?: {
    model?: string
    routeCredential: 'injected' | 'missing'
    routeBaseUrl: 'injected' | 'missing'
    claudeOAuth: 'not-used' | 'required'
    skills: { synced: number; skipped: number }
    mcp: { synced: number; skipped: number }
    environmentNames: string[]
    skipped: string[]
  }
}

export type ClaudeGlobalSettingEffect = 'immediate' | 'new-session' | 'next-turn' | 'next-worktree' | 'restart'
export interface ClaudeGlobalSettingOption {
  value: string
  label: string
  source: 'built-in' | 'user' | 'configured'
}
export const CLAUDE_CONTEXT_PRESETS = [
  { value: 'auto', label: 'auto' }, { value: '200000', label: '200k' },
  { value: '500000', label: '500k' }, { value: '1000000', label: '1m' },
] as const
export const CLAUDE_COMPACT_PRESETS = [
  { value: 'auto', label: 'auto' }, { value: '100000', label: '100k' },
  { value: '200000', label: '200k' }, { value: '500000', label: '500k' }, { value: '1000000', label: '1m' },
] as const
export type ClaudeGlobalSetting = {
  key: string
  kind: 'select'
  value: string
  options: readonly ClaudeGlobalSettingOption[]
  effect: ClaudeGlobalSettingEffect
  available?: boolean
  unavailableReason?: string
  effective?: ClaudeEffectiveSetting
} | {
  key: string
  kind: 'text'
  value: string
  maxLength: number
  effect: ClaudeGlobalSettingEffect
  available?: boolean
  unavailableReason?: string
  effective?: ClaudeEffectiveSetting
} | {
  key: string
  kind: 'number'
  value: string
  min: number
  max: number
  step: number
  presets?: readonly { value: string; label: string }[]
  effect: ClaudeGlobalSettingEffect
  available?: boolean
  unavailableReason?: string
  effective?: ClaudeEffectiveSetting
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
  contextUsage?: ClaudeContextUsage
  lastCompact?: ClaudeCliState['lastCompact']
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
