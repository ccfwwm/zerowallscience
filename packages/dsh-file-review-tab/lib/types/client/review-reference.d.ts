/** Composer reference bridge for aggregate session review comments. */
import type { ClientContext } from './runtime-compat.ts';
import type { InputTriggerSource } from '@deepseek-ai/dsh-client-ui-input-trigger/client';
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import type { NS } from './locales.ts';
export declare const REVIEW_COMMENT_SOURCE = "file-review-comments";
export declare const REVIEW_COMMENT_HIDDEN_LABEL = "\u200B";
interface ReviewOccurrence {
    readonly source: string;
    readonly ref: string;
    readonly label: string;
    readonly offset: number;
}
interface ReviewInputState {
    readonly draft: string;
    readonly draftRev: number;
    readonly phase: 'plain' | 'adjudicating' | 'claimed' | 'submitting';
    readonly occurrences: readonly ReviewOccurrence[];
}
export interface ReviewInput {
    readonly state: {
        getSnapshot(): ReviewInputState;
        subscribe(listener: () => void): () => void;
    };
    setDraft(text: string): void;
}
/** Register the reference codec used by the programmatically inserted aggregate chip. */
export declare function reviewCommentSource(): InputTriggerSource;
/**
 * Keep exactly one aggregate comment occurrence at the beginning of the draft.
 * The returned disposer owns only its input subscription; comments remain in
 * the session repository until a confirmed send or plugin disposal.
 */
export declare function bindReviewReference(scope: Pick<ClientContext, 'effect' | 'bail'>, sessionId: string, input: ReviewInput, _t: TranslateNS<typeof NS>): {
    readonly sync: () => void;
    readonly dispose: () => void;
};
export {};
//# sourceMappingURL=review-reference.d.ts.map