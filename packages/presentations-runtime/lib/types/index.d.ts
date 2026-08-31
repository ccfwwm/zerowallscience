import type { Context } from '@deepseek-ai/cordis';
import z from 'schemastery';
import { PptError, PPT_ERROR_CODES, type PptErrorCode } from './errors.ts';
import { createPptRuntime, type PptRuntime, type PptRuntimeOptions } from './runtime.ts';
import { PPT_MODE_TOOL_NAMES, PPT_TOOL_NAMES, type PptToolName } from './schemas.ts';
declare module '@deepseek-ai/cordis' {
    interface Context {
        pptRuntime: PptRuntime;
    }
}
export { createPptRuntime, PptError, PPT_ERROR_CODES, PPT_MODE_TOOL_NAMES, PPT_TOOL_NAMES };
export type { PptErrorCode, PptRuntime, PptRuntimeOptions, PptToolName };
export declare const name = "dsh-ppt";
export declare const inject: string[];
export interface Config {
    presetId: string;
    installPreset: boolean;
    pythonExecutable: string;
    browserExecutable: string;
    fontDirs: string[];
    outputRoot: string;
}
export declare const Config: z<Schemastery.ObjectS<{
    presetId: z<string, string>;
    installPreset: z<boolean, boolean>;
    pythonExecutable: z<string, string>;
    browserExecutable: z<string, string>;
    fontDirs: z<string[], string[]>;
    outputRoot: z<string, string>;
}>, Schemastery.ObjectT<{
    presetId: z<string, string>;
    installPreset: z<boolean, boolean>;
    pythonExecutable: z<string, string>;
    browserExecutable: z<string, string>;
    fontDirs: z<string[], string[]>;
    outputRoot: z<string, string>;
}>>;
export declare function resolveDshHome(env?: Record<string, string | undefined>): string;
export interface PresetInstallResult {
    status: 'installed' | 'updated' | 'unchanged' | 'conflict';
    targetDir: string;
    conflicts: string[];
}
export interface PresetRemovalResult {
    status: 'removed' | 'absent' | 'conflict';
    targetDir: string;
    conflicts: string[];
}
/** Install or safely update the package-owned PPT preset without overwriting user edits. */
export declare function installPreset(presetId?: string, dshHome?: string): Promise<PresetInstallResult>;
/** Remove only an unchanged package-managed preset directory; user edits are preserved. */
export declare function removeManagedPreset(presetId?: string, dshHome?: string): Promise<PresetRemovalResult>;
export declare function assertSupportedPlatform(platform?: NodeJS.Platform): void;
export declare function apply(ctx: Context, config: Config): Promise<void>;
