import type { SandboxProvider } from '@deepseek-ai/dsh-sandbox';
import type { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess';
import type { SessionOwner } from './session-resources.ts';
import { SessionResourceRegistry } from './session-resources.ts';
export interface PythonArtifact {
    path: string;
    size: number;
    mime_type: string;
    width?: number;
    height?: number;
}
export interface PythonExecutionInput {
    code: string;
    cwd?: string;
    timeout_ms?: number;
    expected_outputs?: string[];
}
export interface PythonExecutionResult {
    exit_code: number;
    stdout: string;
    stderr: string;
    stdout_truncated: boolean;
    stderr_truncated: boolean;
    duration_ms: number;
    artifacts: PythonArtifact[];
}
export declare class PythonRuntime {
    private readonly subprocess;
    private readonly sandbox;
    private readonly resources;
    private readonly executable;
    constructor(subprocess: SubprocessRuntime | undefined, sandbox: SandboxProvider | undefined, resources: SessionResourceRegistry, executable?: string);
    execute(owner: SessionOwner, workspace: string, input: PythonExecutionInput, signal?: AbortSignal): Promise<PythonExecutionResult>;
}
