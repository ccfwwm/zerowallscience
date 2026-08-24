export interface ExecutionCapabilities { platform: string; local: true; wsl: boolean; ssh: true }
export interface ExecutionProbe { ok: boolean; contextId?: string; platform: string; message: string; details: Record<string, string> }
export interface ExecutionCommandRequest { projectId: string; contextId?: string; command: string; workingDirectory?: string; timeoutMs?: number }
export interface ExecutionCommandResult { contextId?: string; exitCode: number | null; signal: string | null; stdout: string; stderr: string; durationMs: number; timedOut: boolean }
