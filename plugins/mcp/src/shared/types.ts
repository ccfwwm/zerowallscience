import type { McpReconnectPolicy, McpServerRecord, McpTransport } from '@zerowallscience/research-store/types'

export type McpRuntimeState = 'disabled' | 'starting' | 'blocked' | 'active' | 'error'

export interface McpServerDto extends McpServerRecord {
  runtimeState: McpRuntimeState
  runtimeError: string
  missingEnvironmentVariables: string[]
  tools: string[]
}

export interface CreateMcpServerRequest {
  name: string
  serverName: string
  transport: McpTransport
  enabled?: boolean
  command?: string
  args?: string[]
  cwd?: string
  envRefs?: Record<string, string>
  url?: string
  headerRefs?: Record<string, string>
  toolCallTimeoutMs?: number
  failOnStartupError?: boolean
  reconnect?: Partial<McpReconnectPolicy>
}

export interface UpdateMcpServerChanges extends Partial<CreateMcpServerRequest> {}

export interface UpdateMcpServerRequest {
  id: string
  changes: UpdateMcpServerChanges
}
