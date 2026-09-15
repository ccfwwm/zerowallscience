/** Shared status/apply state machine and result presentation for every review container. */
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import type { FileReviewAction, FileReviewRequest, FileReviewResult } from '../change-types.ts';
import { type ProducedFileReview } from './turn-deliverables.ts';
import type { NS } from './locales.ts';
interface NoticeFile {
    readonly path: string;
}
export interface ToggleNotice {
    readonly seq: number;
    readonly tone: 'success' | 'error';
    readonly title: string;
    readonly description?: string | undefined;
    readonly files: readonly NoticeFile[];
}
export declare const unavailableChanges: (request: FileReviewRequest) => Promise<FileReviewResult>;
interface ReviewActionsOptions {
    readonly reviews: readonly ProducedFileReview[];
    readonly inspectChanges: (request: FileReviewRequest) => Promise<FileReviewResult>;
    readonly applyChanges: (request: FileReviewRequest) => Promise<FileReviewResult>;
    readonly enabled?: boolean | undefined;
    readonly t: TranslateNS<typeof NS>;
}
export interface ReviewActions {
    readonly action: FileReviewAction;
    readonly statusPending: boolean;
    readonly togglePending: boolean;
    readonly hasReversibleFiles: boolean;
    readonly notice: ToggleNotice | null;
    run(): void;
    dismissNotice(): void;
}
/** Keep Undo/Reapply phase and async stale-write protection identical in every surface. */
export declare function useReviewActions({ reviews, inspectChanges, applyChanges, enabled, t, }: ReviewActionsOptions): ReviewActions;
export declare function ReviewResultToast({ notice, t, openFile, onDone, }: {
    readonly notice: ToggleNotice;
    readonly t: TranslateNS<typeof NS>;
    readonly openFile: (path: string) => void;
    readonly onDone: () => void;
}): import("react").JSX.Element;
export {};
//# sourceMappingURL=review-actions.d.ts.map