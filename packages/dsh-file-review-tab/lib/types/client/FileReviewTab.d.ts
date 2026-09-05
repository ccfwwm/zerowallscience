/** better-sidebar tab that resolves a lightweight target against the live Session timeline. */
import type { ISessions, ObservableSnapshot } from './runtime-compat.ts';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type { FileReviewRequest, FileReviewResult } from '../change-types.ts';
import type { NS } from './locales.ts';
interface SidebarTabLike {
    readonly meta?: unknown;
}
interface SidebarScopeLike {
    readonly sessionId: string;
    readonly cwd?: string | undefined;
}
export interface FileReviewTabRuntime {
    readonly inspectChanges: (request: FileReviewRequest) => Promise<FileReviewResult>;
    readonly applyChanges: (request: FileReviewRequest) => Promise<FileReviewResult>;
    readonly syncComments?: (() => void) | undefined;
}
export interface FileReviewTabProps extends PropsLocale<typeof NS> {
    readonly sessions: ISessions;
    readonly scope: SidebarScopeLike;
    readonly tab: SidebarTabLike;
    readonly visible: boolean;
    readonly runtime: FileReviewTabRuntime;
    readonly wordWrap: ObservableSnapshot<boolean>;
    readonly openFile: (path: string) => void;
}
/** Restore review data after first open, target changes, session switches and page reloads. */
export declare function FileReviewTab({ sessions, scope, tab, visible, runtime, wordWrap, openFile, t, }: FileReviewTabProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=FileReviewTab.d.ts.map