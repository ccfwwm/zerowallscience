import type { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess';
export interface CollectedProcessResult {
    exitCode: number | null;
    signal: NodeJS.Signals | null;
    stdout: string;
    stderr: string;
    stdoutTruncated: boolean;
    stderrTruncated: boolean;
}
export interface RunCollectedOptions {
    cwd: string;
    env?: NodeJS.ProcessEnv;
    signal?: AbortSignal;
    timeoutMs: number;
    maxOutputBytes: number;
    stdin?: string;
    graceMs?: number;
}
export declare function runCollected(subprocess: SubprocessRuntime, argv: readonly string[], options: RunCollectedOptions): Promise<CollectedProcessResult>;
