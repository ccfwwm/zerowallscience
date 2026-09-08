/** User-message projection that keeps serialized review context out of the visible bubble. */
import type { ChatNodeViewProps } from '@deepseek-ai/dsh-client-ui-chat/client';
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import type { NS } from './locales.ts';
interface ProjectedReviewComment {
    readonly path: string;
    readonly kind: 'context' | 'del' | 'add';
    readonly oldLine: string;
    readonly newLine: string;
    readonly body: string;
}
interface ReviewMessageProjection {
    readonly commentCount: number;
    readonly comments: readonly ProjectedReviewComment[];
    readonly visibleText: string;
}
type UserMessageProps = ChatNodeViewProps<'user' | 'steering'> & {
    readonly reviewT: TranslateNS<typeof NS>;
};
/** Recognize only the leading envelope emitted by this plugin and retain any user text after it. */
export declare function projectReviewMessageText(text: string): ReviewMessageProjection | null;
/** Shadow the host user renderer while preserving its ordinary-message behavior. */
export declare function ReviewUserMessage({ node, sessionId, cwd, renderMessageImages, openAttachment, openParsedAttachment, copyAttachment, t, reviewT, }: UserMessageProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=ReviewUserMessage.d.ts.map