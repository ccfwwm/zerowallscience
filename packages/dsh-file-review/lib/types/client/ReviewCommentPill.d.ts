/** Shared aggregate review-comment pill with hover and keyboard preview. */
import type { ReactNode } from 'react';
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import type { NS } from './locales.ts';
export interface PreviewReviewComment {
    readonly key: string | number;
    readonly path: string;
    readonly kind: 'context' | 'del' | 'add';
    readonly oldLine: string | number | null;
    readonly newLine: string | number | null;
    readonly body: string;
}
interface ReviewCommentPillProps {
    readonly comments: readonly PreviewReviewComment[];
    readonly projectRoot?: string | undefined;
    readonly t: TranslateNS<typeof NS>;
    readonly placement: 'above-left' | 'below-right';
    readonly variant: 'dock' | 'message';
    readonly buttonLabel?: string | undefined;
    readonly trailingAction?: ReactNode;
}
/** One interaction contract for draft and historical review-comment references. */
export declare function ReviewCommentPill({ comments, projectRoot, t, placement, variant, buttonLabel, trailingAction, }: ReviewCommentPillProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=ReviewCommentPill.d.ts.map