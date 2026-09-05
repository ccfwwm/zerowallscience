/** Session-local review comments and their model serialization. */
/** Stable identity and quoted context for one rendered diff line. */
export interface DiffLineAnchor {
    readonly path: string;
    readonly hunkIndex: number;
    readonly rowIndex: number;
    readonly kind: 'context' | 'del' | 'add';
    readonly oldLine: number | null;
    readonly newLine: number | null;
    readonly text: string;
    /** Small unified-diff excerpt around the target; source text, never instructions. */
    readonly excerpt: string;
}
/** One non-empty user-authored comment attached to a turn-scoped line. */
export interface ReviewComment {
    readonly sessionId: string;
    readonly turn: number;
    readonly closingSeq: number;
    readonly anchor: DiffLineAnchor;
    readonly body: string;
}
/** Stable key independent of the line's text, which may itself contain separators. */
export declare function reviewCommentKey(turn: number, closingSeq: number, anchor: Pick<DiffLineAnchor, 'path' | 'hunkIndex' | 'rowIndex'>): string;
/** Store one trimmed comment, or delete the line's comment when empty. */
export declare function setReviewComment(comment: ReviewComment): void;
/** Remove one comment by its complete line identity. */
export declare function deleteReviewComment(sessionId: string, turn: number, closingSeq: number, anchor: Pick<DiffLineAnchor, 'path' | 'hunkIndex' | 'rowIndex'>): void;
/** Read all comments for a session in insertion order. */
export declare function reviewComments(sessionId: string): readonly ReviewComment[];
/** Read one turn-tail card's comments as a stable key/value map. */
export declare function reviewCommentsForTurn(sessionId: string, turn: number, closingSeq: number): ReadonlyMap<string, ReviewComment>;
/** Subscribe to one session's in-memory comment collection. */
export declare function subscribeReviewComments(sessionId: string, listener: () => void): () => void;
/** Clear comments after a confirmed successful submission. */
export declare function clearReviewComments(sessionId: string): void;
/** Serialize the current comments as explicitly quoted review context for the Agent. */
export declare function serializeReviewComments(sessionId: string): string;
/** Test/plugin-disposal helper; this state is intentionally not durable. */
export declare function clearAllReviewComments(): void;
//# sourceMappingURL=review-comments.d.ts.map