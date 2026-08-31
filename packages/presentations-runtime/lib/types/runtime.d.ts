import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { type PptDiagnosticReport } from './diagnostics.ts';
import { SessionResourceRegistry } from './session-resources.ts';
import { BrowserRuntime } from './browser.ts';
import { PythonRuntime } from './python.ts';
import { ImageSearchRuntime } from './image-search.ts';
import { QualityRuntime } from './quality.ts';
import { PptImageRuntime } from './ppt-image.ts';
export interface PptRuntimeOptions {
    context?: Context;
    workspaceRoot?: string;
    outputRoot?: string;
    pythonExecutable?: string;
    browserExecutable?: string;
    fontDirs?: readonly string[];
}
export interface ToolSurfaceStatus {
    visible: readonly string[];
    missing: readonly string[];
    unexpected: readonly string[];
}
export interface PptRuntime {
    readonly options: Readonly<PptRuntimeOptions>;
    readonly toolSurface?: ToolSurfaceStatus;
    readonly resources: SessionResourceRegistry;
    readonly browser: BrowserRuntime;
    readonly python: PythonRuntime;
    readonly imageSearch: ImageSearchRuntime;
    readonly pptImage: PptImageRuntime;
    readonly quality: QualityRuntime;
    recordToolSurface(status: ToolSurfaceStatus): void;
    canReviewImages(agent?: Agent): Promise<boolean>;
    diagnose(agent?: Agent): Promise<PptDiagnosticReport>;
    dispose(): Promise<void>;
}
export declare function createPptRuntime(options?: PptRuntimeOptions): PptRuntime;
