import type { SandboxProvider } from '@deepseek-ai/dsh-sandbox';
import type { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess';
import { type PptImageBackend } from './platform.ts';
import type { SessionOwner } from './session-resources.ts';
import { SessionResourceRegistry } from './session-resources.ts';
export type PptImageStatus = 'passed' | 'failed' | 'not_available';
export type PptImageCaptureMethod = 'native-export' | 'pdf-raster' | 'screen-capture';
export interface PptImageAttempt {
    backend: PptImageBackend;
    capture_method?: PptImageCaptureMethod;
    status: PptImageStatus;
    message: string;
}
export interface PptImageResult {
    status: PptImageStatus;
    backend?: PptImageBackend;
    backend_version?: string;
    capture_method?: PptImageCaptureMethod;
    page_count: number;
    image_paths: string[];
    contact_sheet_paths: string[];
    manifest_path?: string;
    cached: boolean;
    attempts: PptImageAttempt[];
    warnings: string[];
}
export interface PptImageRenderOptions {
    backend?: 'auto' | PptImageBackend;
    force?: boolean;
    outputDirectory?: string;
    /** Host tool policy approved one unconfined native-app automation call. */
    nativeAutomationApproved?: boolean;
    /** One-based macOS display selected by the PowerPoint screen-capture fallback. */
    screenIndex?: number;
}
export declare function fontconfigDocument(fontDirs: readonly string[], cacheDir: string): string;
export declare function pptxPageCount(data: Uint8Array): number;
export declare class PptImageRuntime {
    private readonly subprocess;
    private readonly sandbox;
    private readonly resources;
    private readonly executables;
    private readonly fontDirs;
    private readonly platform;
    constructor(subprocess: SubprocessRuntime | undefined, sandbox: SandboxProvider | undefined, resources: SessionResourceRegistry, executables?: {
        soffice?: readonly string[];
        pdftoppm?: readonly string[];
        osascript?: readonly string[];
        powershell?: readonly string[];
        keynote?: readonly string[];
        powerpoint?: readonly string[];
        screencapture?: readonly string[];
    }, fontDirs?: readonly string[], platform?: NodeJS.Platform);
    render(owner: SessionOwner, workspace: string, pptxPathInput: string, options?: PptImageRenderOptions, signal?: AbortSignal): Promise<PptImageResult>;
    private discover;
    private cachedResult;
    private renderBackend;
}
