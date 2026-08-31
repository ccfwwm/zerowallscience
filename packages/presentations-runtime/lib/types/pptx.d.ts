import type { BrowserRuntime } from './browser.ts';
import type { SessionOwner } from './session-resources.ts';
export type PptFallbackMode = 'reject' | 'rasterize-element';
export interface RasterizedElementRecord {
    page: number;
    element_id: string;
    reason: string;
    image_path: string;
}
export interface PptCreateResult {
    pptx_path: string;
    page_count: number;
    native_element_count: number;
    rasterized_elements: RasterizedElementRecord[];
    structural_status: 'passed';
}
export interface PptxPackageInspection {
    pageCount: number;
    widthEmu: number;
    heightEmu: number;
    entries: string[];
}
export declare function inspectPptxPackage(data: Uint8Array, expectedPages: number): PptxPackageInspection;
export declare function createPptx(browser: BrowserRuntime, owner: SessionOwner, workspace: string, htmlPathInput: string, outlinePathInput: string, outputPathInput: string, fallbackMode?: PptFallbackMode, signal?: AbortSignal): Promise<PptCreateResult>;
