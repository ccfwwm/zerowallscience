import type { SandboxProvider } from '@deepseek-ai/dsh-sandbox';
import type { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess';
import { type DesignFinding } from './art-direction.ts';
import { PptImageRuntime } from './ppt-image.ts';
import type { SessionOwner } from './session-resources.ts';
import { SessionResourceRegistry } from './session-resources.ts';
export { fontconfigDocument } from './ppt-image.ts';
export type QualityLayerStatus = 'passed' | 'failed' | 'not_available' | 'not_performed';
export type OverallQualityStatus = 'verified' | 'failed' | 'unverified';
export interface QualityFinding {
    code: string;
    severity: 'warning' | 'error';
    message: string;
    page?: number;
}
export interface PptQualityReport {
    version: 1;
    machine_owned: true;
    generated_at: string;
    pptx_path: string;
    structural_status: QualityLayerStatus;
    render_status: QualityLayerStatus;
    automatic_visual_status: QualityLayerStatus;
    model_visual_status: QualityLayerStatus;
    overall_status: OverallQualityStatus;
    layers: {
        structural: {
            status: QualityLayerStatus;
            findings: QualityFinding[];
        };
        render: {
            status: QualityLayerStatus;
            name?: string;
            version?: string;
            findings: QualityFinding[];
        };
        automatic_visual: {
            status: QualityLayerStatus;
            findings: QualityFinding[];
            pages: Array<Record<string, unknown>>;
            html_comparison_pages: Array<Record<string, unknown>>;
            design_fidelity: {
                mode: 'directed' | 'legacy';
                checks: string[];
                pages: Array<Record<string, unknown>>;
                findings: DesignFinding[];
            };
        };
        model_visual: {
            status: QualityLayerStatus;
            findings: QualityFinding[];
        };
    };
    artifacts: {
        html_previews: string[];
        pptx_previews: string[];
        contact_sheets: string[];
        high_risk_previews: string[];
        visual_review: string;
    };
    conversion?: Record<string, unknown>;
}
export interface VisualReviewDocument {
    version: 1;
    status: 'not_performed' | 'passed' | 'failed' | 'not_available';
    checklist: string[];
    reviewed_assets: string[];
    findings: Array<{
        page?: number;
        severity: 'warning' | 'error';
        message: string;
    }>;
    completed_at?: string;
}
export declare function computeOverallStatus(report: Pick<PptQualityReport, 'structural_status' | 'render_status' | 'automatic_visual_status' | 'model_visual_status'>): OverallQualityStatus;
export declare class QualityRuntime {
    private readonly pptImage;
    constructor(subprocess: SubprocessRuntime | undefined, sandbox: SandboxProvider | undefined, resources: SessionResourceRegistry, executables?: {
        soffice?: readonly string[];
        pdftoppm?: readonly string[];
    }, fontDirs?: readonly string[], pptImage?: PptImageRuntime);
    refresh(owner: SessionOwner, workspace: string, pptxPathInput: string, modelReviewAvailable: boolean, signal?: AbortSignal, nativeAutomationApproved?: boolean): Promise<PptQualityReport | undefined>;
    evaluate(owner: SessionOwner, workspace: string, pptxPathInput: string, htmlPreviewInputs: string[], reportPathInput: string, visualReviewPathInput: string, expectedPages: number, modelReviewAvailable: boolean, conversion?: Record<string, unknown>, signal?: AbortSignal, nativeAutomationApproved?: boolean): Promise<PptQualityReport>;
}
export declare function applyVisualReview(workspace: string, reportPathInput: string, reviewPathInput: string): Promise<PptQualityReport>;
