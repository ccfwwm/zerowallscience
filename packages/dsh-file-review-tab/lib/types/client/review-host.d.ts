/** Optional review-container seam used by turn-tail cards. */
/** A lightweight, JSON-serializable pointer to one turn's review material. */
export interface ReviewTarget {
    readonly turn: number;
    readonly closingSeq: number;
    readonly focusPaths: readonly string[];
}
/** Everything an external review container needs to open the target. */
export interface ReviewOpenRequest {
    readonly sessionId: string;
    readonly cwd?: string | undefined;
    readonly target: ReviewTarget;
}
/** One optional container implementation. `false` asks the caller to fall back. */
export interface ReviewHostAdapter {
    open(request: ReviewOpenRequest): boolean;
}
/** Stable interface consumed by React components regardless of installed plugins. */
export declare const reviewHost: ReviewHostAdapter;
/** Attach one dynamically-scoped adapter and return an identity-safe disposer. */
export declare function attachReviewHost(adapter: ReviewHostAdapter): () => void;
//# sourceMappingURL=review-host.d.ts.map