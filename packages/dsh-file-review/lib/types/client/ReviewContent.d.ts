/** Native review-tab contents: files, diffs and line comments. */
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store';
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client';
import { type Config } from '../settings-contract.ts';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
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
    readonly syncComments?: (() => void) | undefined;
    readonly wordWrap?: ObservableSnapshot<boolean> | undefined;
    readonly settings?: SettingsScope<Config> | undefined;
    readonly visible?: boolean | undefined;
}
/** Render review header, actions, files, diffs and line comments without owning a shell. */
export declare function ReviewContent({ reviews, projectRoot, sessionId, turn, closingSeq, openFile, syncComments, wordWrap: wordWrapSource, settings, visible, t, }: ReviewContentProps): import("react").JSX.Element;
//# sourceMappingURL=ReviewContent.d.ts.map