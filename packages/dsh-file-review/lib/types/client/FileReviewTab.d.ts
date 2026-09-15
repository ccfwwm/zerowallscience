/** Review tab that resolves a lightweight target against the live Session timeline. */
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client';
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store';
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client';
import type { Config } from '../settings-contract.ts';
import type { UiConversation } from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { FileReviewRequest, FileReviewResult } from '../change-types.ts';
import type { NS } from './locales.ts';
/** Navigation parameters for one turn's review material. */
export interface ReviewTarget {
    readonly turn: number;
    readonly closingSeq: number;
    readonly focusPaths: readonly string[];
}
export interface FileReviewTabRuntime {
    readonly inspectChanges: (request: FileReviewRequest) => Promise<FileReviewResult>;
    readonly applyChanges: (request: FileReviewRequest) => Promise<FileReviewResult>;
    readonly syncComments?: (() => void) | undefined;
}
export interface FileReviewTabProps extends PropsLocale<typeof NS> {
    readonly sessions: ISessions;
    readonly uiConversation: UiConversation;
    readonly sessionId: SessionId;
    readonly projectRoot?: string | undefined;
    readonly params: unknown;
    readonly visible: boolean;
    readonly syncComments?: (() => void) | undefined;
    readonly wordWrap: ObservableSnapshot<boolean>;
    readonly settings?: SettingsScope<Config> | undefined;
    readonly openFile: (path: string) => void;
}
/** Restore review data after first open, target changes, session switches and page reloads. */
export declare function FileReviewTab({ sessions, uiConversation, sessionId, projectRoot, params, visible, syncComments, wordWrap, settings, openFile, t, }: FileReviewTabProps): import("react").JSX.Element;
//# sourceMappingURL=FileReviewTab.d.ts.map