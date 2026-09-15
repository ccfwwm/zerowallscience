/** Register file review directly in DSH's native right sidebar. */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client';
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store';
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client';
import type { Config } from '../settings-contract.ts';
import type { UiConversation } from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import { type FileReviewTabRuntime, type ReviewTarget } from './FileReviewTab.tsx';
import { NS } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-sidebar-right/client' {
    interface SidebarRightTabParamsMap {
        'dsh-file-review:review': ReviewTarget;
    }
}
interface NativeSidebarIntegrationOptions {
    readonly sessions: ISessions;
    readonly uiConversation: UiConversation;
    readonly wordWrap: ObservableSnapshot<boolean>;
    readonly settings?: SettingsScope<Config> | undefined;
    readonly t: TranslateNS<typeof NS>;
    readonly runtimeFor: (sessionId: SessionId) => FileReviewTabRuntime;
}
/** Register the native tab and return its session-targeted opener. */
export declare function installNativeSidebarIntegration(ctx: ClientContext, { sessions, uiConversation, wordWrap, settings, t, runtimeFor }: NativeSidebarIntegrationOptions): (sessionId: SessionId, target: ReviewTarget) => void;
export {};
//# sourceMappingURL=native-sidebar-adapter.d.ts.map