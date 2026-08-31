import { type ArtDirection, type DesignFinding } from './art-direction.ts';
import type { BrowserRuntime } from './browser.ts';
import type { SessionOwner } from './session-resources.ts';
export interface HtmlCreateResult {
    html_path: string;
    page_count: number;
    preview_paths: string[];
    fonts: string[];
    external_resources: 'none';
    warnings: string[];
    unsupported_css: string[];
    design_status: 'directed' | 'legacy';
    design_findings: DesignFinding[];
    design_validation_path: string;
}
export declare function validateDeckHtmlSource(workspace: string, artifactRoot: string, html: string, outlineLength: number, designPlan?: ArtDirection, strictDesign?: boolean): Promise<{
    fonts: string[];
    primaryFonts: string[];
    unsupported: string[];
    designFindings: DesignFinding[];
}>;
export declare function createHtmlDeck(browser: BrowserRuntime, owner: SessionOwner, workspace: string, outlinePathInput: string, html: string, signal?: AbortSignal, designPlanPathInput?: string, strictDesign?: boolean, fontDirs?: readonly string[]): Promise<HtmlCreateResult>;
