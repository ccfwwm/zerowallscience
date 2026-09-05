/** Container-neutral review presentation shared by the standalone drawer and sidebar tab. */
import type { Ref } from 'react';
import type { ObservableSnapshot } from './runtime-compat.ts';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type { FileReviewRequest, FileReviewResult } from '../change-types.ts';
import type { NS } from './locales.ts';
import { type UnifiedDiffStats } from './UnifiedDiff.tsx';
import type { ProducedFileReview } from './turn-deliverables.ts';
export declare const DEFAULT_WORD_WRAP_SOURCE: ObservableSnapshot<boolean>;
export declare function ReviewStats({ stats, label, }: {
    readonly stats: UnifiedDiffStats;
    readonly label: string;
}): import("react").JSX.Element;
export interface ReviewContentProps extends PropsLocale<typeof NS> {
    readonly reviews: readonly ProducedFileReview[];
    readonly projectRoot?: string | undefined;
    readonly sessionId?: string | undefined;
    readonly turn: number;
    readonly closingSeq: number;
    readonly openFile: (path: string) => void;
    readonly inspectChanges: (request: FileReviewRequest) => Promise<FileReviewResult>;
    readonly applyChanges: (request: FileReviewRequest) => Promise<FileReviewResult>;
    readonly syncComments?: (() => void) | undefined;
    readonly wordWrap?: ObservableSnapshot<boolean> | undefined;
    readonly visible?: boolean | undefined;
    readonly titleId?: string | undefined;
    readonly onClose?: (() => void) | undefined;
    readonly closeButtonRef?: Ref<HTMLButtonElement> | undefined;
}
/** Render review header, actions, files, diffs and line comments without owning a shell. */
export declare function ReviewContent({ reviews, projectRoot, sessionId, turn, closingSeq, openFile, syncComments, wordWrap: wordWrapSource, visible, titleId, onClose, closeButtonRef, t, }: ReviewContentProps): import("react").JSX.Element;
//# sourceMappingURL=ReviewContent.d.ts.map