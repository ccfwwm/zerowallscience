import type { McpReconnectPolicy, McpServerRecord, McpTransport } from '@zerowallscience/research-store/types'

export type McpRuntimeState = 'disabled' | 'idle' | 'starting' | 'waiting-for-credentials' | 'discovering-tools' | 'blocked' | 'active' | 'active-with-zero-tools' | 'error'

/** The Remote boundary accepts JSON values, never unconstrained tool objects. */
export type McpSchemaValue = null | boolean | number | string | McpSchemaValue[] | McpSchemaObject
export interface McpSchemaObject { [key: string]: McpSchemaValue }

/** Bounded, renderer-safe projection of a discovered MCP tool definition. */
export interface McpToolDetail {
  name: string
  description: string
  inputSchema?: McpSchemaObject
  schemaTruncated?: boolean
}

export interface McpServerDto extends McpServerRecord {
  runtimeState: McpRuntimeState
  runtimeError: string
  missingEnvironmentVariables: string[]
  /** Retained for older consumers; names correspond to toolDetails[].name. */
  tools: string[]
  /** Optional for wire compatibility with older Hosts. */
  toolDetails?: McpToolDetail[]
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
