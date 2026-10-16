// Remote codecs must own their recursive declarations within this plugin face.
// Keep the full JSON contract rather than reducing connection config to known keys.
export type ExecutionJsonValue = string | number | boolean | null | ExecutionJsonObject | ExecutionJsonValue[]
export interface ExecutionJsonObject { [key: string]: ExecutionJsonValue }
export type ExecutionContextKind = 'local' | 'wsl' | 'ssh'
export interface ExecutionContextRecord {
  id: string
  projectId: string
  name: string
  kind: ExecutionContextKind
  config: ExecutionJsonObject
  version: number
  createdAt: string
  updatedAt: string
}
export interface CreateExecutionContextInput { projectId: string; name: string; kind: ExecutionContextKind; config?: ExecutionJsonObject }
export interface UpdateExecutionContextInput { name?: string; kind?: ExecutionContextKind; config?: ExecutionJsonObject }
export interface ExecutionCapabilities { platform: string; local: true; wsl: boolean; ssh: true }
export interface ExecutionProbe { ok: boolean; contextId?: string; platform: string; message: string; details: Record<string, string> }
export interface ExecutionCommandRequest { projectId: string; contextId?: string; command: string; workingDirectory?: string; timeoutMs?: number }
export interface ExecutionCommandResult { contextId?: string; exitCode: number | null; signal: string | null; stdout: string; stderr: string; durationMs: number; timedOut: boolean }
