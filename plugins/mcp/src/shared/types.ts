import type { McpReconnectPolicy, McpServerRecord, McpTransport } from '@zerowallscience/research-store/types'

export type McpRuntimeState = 'disabled' | 'idle' | 'starting' | 'waiting-for-credentials' | 'discovering-tools' | 'blocked' | 'active' | 'active-with-zero-tools' | 'error'

export interface McpServerDto extends McpServerRecord {
  runtimeState: McpRuntimeState
  runtimeError: string
  missingEnvironmentVariables: string[]
  tools: string[]
  toolDiscoveryState: 'unknown' | 'pending' | 'complete' | 'failed'
  toolDiscoveryStartedAt?: string
  toolDiscoveryCompletedAt?: string
  lastSuccessfulToolCount?: number
  lastDiscoveryError?: string
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
