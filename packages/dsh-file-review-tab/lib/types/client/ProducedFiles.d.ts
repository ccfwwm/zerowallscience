import type { ObservableSnapshot } from './runtime-compat.ts';
import type { TurnTailOwnerProps } from '@deepseek-ai/dsh-client-ui-chat/client';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type { FileReviewRequest, FileReviewResult } from '../change-types.ts';
import type { NS } from './locales.ts';
import { type ProducedFileReview } from './turn-deliverables.ts';
/** Matched file reviews plus the opener and locale supplied by the turn-tail slot. */
export type ProducedFilesProps = Pick<TurnTailOwnerProps, 'openFile'> & {
    matched: readonly ProducedFileReview[];
    /** Session workspace root, used only to shorten paths shown in the review UI. */
    projectRoot?: string | undefined;
    inspectChanges?: (request: FileReviewRequest) => Promise<FileReviewResult>;
    applyChanges?: (request: FileReviewRequest) => Promise<FileReviewResult>;
    /** Runtime-injected session identity; absent only in isolated render tests. */
    sessionId?: string | undefined;
    /** Turn-tail identity used to keep repeated file/line coordinates distinct. */
    turn?: TurnTailOwnerProps['turn'] | undefined;
    seq?: number | undefined;
    /** Reconcile the aggregate review-comment reference in the session composer. */
    syncComments?: (() => void) | undefined;
    /** Live display-only preference for visually wrapping logical diff lines. */
    wordWrap?: ObservableSnapshot<boolean> | undefined;
} & PropsLocale<typeof NS>;
/** Render one turn's produced files and delegate review opening through ReviewHost. */
export declare function ProducedFiles({ matched: reviews, openFile, projectRoot, inspectChanges, applyChanges, sessionId, turn, seq, syncComments, wordWrap, t, }: ProducedFilesProps): import("react").JSX.Element;
//# sourceMappingURL=ProducedFiles.d.ts.map