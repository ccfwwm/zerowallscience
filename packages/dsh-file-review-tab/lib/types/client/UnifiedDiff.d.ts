import type { ProducedFileDiff as DiffHunk } from './turn-deliverables.ts';
import type { DiffLineAnchor } from './review-comments.ts';
export type { DiffLineAnchor } from './review-comments.ts';
/** Locale labels required by the review diff. */
export interface UnifiedDiffLabels {
    readonly copy: string;
    readonly copied: string;
    readonly showUnchanged: (count: number) => string;
    readonly hideUnchanged: (count: number) => string;
    readonly addComment?: (line: number) => string;
    readonly editComment?: (line: number) => string;
    readonly commentPlaceholder?: string;
    readonly commentNewlineHint?: string;
    readonly cancelComment?: string;
    readonly saveComment?: string;
    readonly deleteComment?: string;
}
/** Added and removed line totals derived from the same hunks the viewer renders. */
export interface UnifiedDiffStats {
    readonly added: number;
    readonly removed: number;
}
export interface UnifiedDiffProps {
    readonly diffs: readonly DiffHunk[];
    readonly contextLines: number;
    readonly labels: UnifiedDiffLabels;
    readonly className?: string | undefined;
    readonly showCopyButton?: boolean | undefined;
    readonly showFileHeaders?: boolean | undefined;
    /** Visually wrap long logical lines without mutating their text. */
    readonly wordWrap?: boolean | undefined;
    readonly commentFor?: ((anchor: DiffLineAnchor) => string | undefined) | undefined;
    readonly onCommentChange?: ((anchor: DiffLineAnchor, body: string) => void) | undefined;
    readonly onCommentDelete?: ((anchor: DiffLineAnchor) => void) | undefined;
}
/** Serialize recorded hunks as plain text, preserving unknown coordinates as question marks. */
export declare function unifiedDiffText(diffs: readonly DiffHunk[]): string;
/** Count added and removed lines using the viewer's exact line-diff algorithm. */
export declare function summarizeDiffs(diffs: readonly DiffHunk[]): UnifiedDiffStats;
/**
 * Render line-aligned hunks with a single gutter and expandable context gaps.
 * @param props - Unified diff data, locale labels, and presentation options.
 * @returns The line-numbered unified diff surface.
 */
export declare function UnifiedDiff({ diffs, contextLines, labels, className, showCopyButton, showFileHeaders, wordWrap, commentFor, onCommentChange, onCommentDelete, }: UnifiedDiffProps): import("react").JSX.Element | null;
//# sourceMappingURL=UnifiedDiff.d.ts.map