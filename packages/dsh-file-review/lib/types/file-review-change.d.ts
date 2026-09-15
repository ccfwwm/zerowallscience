import type { ProducedFileDiff } from './change-types.ts';
/** Whether one diff carries enough information for a strict reverse operation. */
export declare function isReversibleDiff(diff: ProducedFileDiff, path: string): boolean;
/** Shared Host/browser classifier for one complete turn-scoped file change. */
export declare function isReversibleChange(file: {
    readonly path: string;
    readonly diffs: readonly ProducedFileDiff[];
    readonly complete?: false | undefined;
}): boolean;
//# sourceMappingURL=file-review-change.d.ts.map