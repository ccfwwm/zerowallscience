/** Shared, JSON-only bridge between Host PTC logging and Turn deliverables. */
import type { ProducedFileDiff } from './change-types.ts';
export declare const PTC_FILE_REVIEW_SCHEMA = 2;
export declare const PTC_FILE_REVIEW_MAX_BYTES: number;
export type PtcFileReviewSource = 'result' | 'intent';
/** One normalized mutation reported by a tool's presentation contract. */
export interface PresentedFileChange {
    readonly path: string;
    readonly diffs: readonly ProducedFileDiff[];
    readonly source: PtcFileReviewSource;
}
/** Versioned payload persisted on an invisible PTC result content block. */
export interface PtcFileReviewMarker {
    readonly schema: 1 | typeof PTC_FILE_REVIEW_SCHEMA;
    readonly turn: number;
    readonly step: number;
    readonly rootCallId: string;
    readonly subCallId: string;
    readonly files: readonly PresentedFileChange[];
    readonly truncated: boolean;
}
interface MarkerBlock {
    readonly type: 'text';
    readonly text: '';
    readonly dshFileReview: PtcFileReviewMarker;
}
/** Strictly validate diff hunks crossing either presentation or log boundaries. */
export declare function presentationDiffs(value: unknown): readonly ProducedFileDiff[];
/**
 * Normalize tool presentation without knowing the tool name. Applied result
 * hunks win; call-time intent is the accepted fallback when they are absent.
 */
export declare function normalizeMutationPresentation(callView: unknown, resultView: unknown): readonly PresentedFileChange[];
/** Parse and detach one marker, optionally requiring its event correlations. */
export declare function parsePtcFileReviewMarker(value: unknown, expected?: {
    readonly rootCallId: string;
    readonly subCallId: string;
}): PtcFileReviewMarker | null;
/** Read the last valid invisible marker from one PTC settlement content array. */
export declare function markerFromContent(content: readonly unknown[], expected: {
    readonly rootCallId: string;
    readonly subCallId: string;
}): PtcFileReviewMarker | null;
/** Bound one marker before it is duplicated into the durable PTC log. */
export declare function boundedPtcFileReviewMarker(marker: Omit<PtcFileReviewMarker, 'schema' | 'truncated'>, maxBytes?: number): PtcFileReviewMarker | null;
/** Build the invisible standard text block used as the durable carrier. */
export declare function markerBlock(marker: PtcFileReviewMarker): MarkerBlock;
export {};
//# sourceMappingURL=ptc-marker.d.ts.map