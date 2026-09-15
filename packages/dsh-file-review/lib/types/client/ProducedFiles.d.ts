import type { TurnTailOwnerProps } from '@deepseek-ai/dsh-client-ui-chat/client';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type { FileReviewRequest, FileReviewResult } from '../change-types.ts';
import type { NS } from './locales.ts';
import type { ReviewTarget } from './FileReviewTab.tsx';
import { type ProducedFileReview } from './turn-deliverables.ts';
/** Matched file reviews plus the opener and locale supplied by the turn-tail slot. */
export type ProducedFilesProps = Pick<TurnTailOwnerProps, 'openFile'> & {
    matched: readonly ProducedFileReview[];
    openReview: (target: ReviewTarget) => void;
    inspectChanges?: (request: FileReviewRequest) => Promise<FileReviewResult>;
    applyChanges?: (request: FileReviewRequest) => Promise<FileReviewResult>;
    /** Turn-tail identity used to keep repeated file/line coordinates distinct. */
    turn?: TurnTailOwnerProps['turn'] | undefined;
    seq?: number | undefined;
} & PropsLocale<typeof NS>;
/** Render one turn's produced files and open their native review tab. */
export declare function ProducedFiles({ matched: reviews, openFile, openReview, inspectChanges, applyChanges, turn, seq, t, }: ProducedFilesProps): import("react").JSX.Element;
//# sourceMappingURL=ProducedFiles.d.ts.map