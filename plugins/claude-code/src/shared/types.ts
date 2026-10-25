export interface ClaudeCodeStatus {
  desktop: boolean
  installed: boolean
  version?: string
  /** Application-managed CLI; never a PATH lookup or the user's Claude install. */
  executablePath?: string
  rollbackAvailable: boolean
  running: boolean
}

/** Settings-page operations do not belong to a conversation Agent. */
export interface ClaudeCodeSettingsApi {
  status: () => Promise<ClaudeCodeStatus>
  install: () => Promise<ClaudeCodeStatus>
  rollback: () => Promise<ClaudeCodeStatus>
  uninstall: () => Promise<ClaudeCodeStatus>
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
}
