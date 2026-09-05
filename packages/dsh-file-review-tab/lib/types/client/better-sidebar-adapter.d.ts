/** Dynamically-scoped optional adapter for dsh-better-sidebar. */
import type { ClientContext, ISessions, ObservableSnapshot } from './runtime-compat.ts';
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import { type FileReviewTabRuntime } from './FileReviewTab.tsx';
import type { NS } from './locales.ts';
export interface BetterSidebarIntegrationOptions {
    readonly sessions: ISessions;
    readonly wordWrap: ObservableSnapshot<boolean>;
    readonly locale: {
        readonly subscribe: (listener: () => void) => () => void;
    };
    readonly t: TranslateNS<typeof NS>;
    readonly runtimeFor: (sessionId: string) => FileReviewTabRuntime;
}
/** Install a child fiber that appears and disappears with the optional service. */
export declare function installBetterSidebarIntegration(ctx: ClientContext, { sessions, wordWrap, locale, t, runtimeFor }: BetterSidebarIntegrationOptions): void;
//# sourceMappingURL=better-sidebar-adapter.d.ts.map