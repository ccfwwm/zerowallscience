/**
 * ⚠️ VERIFIED AGAINST REAL rc.8 CLIENT API.
 *
 * Client (browser) registration of the 能力管理 settings tab. Follows the real
 * dsh client pattern (`dsh-client-ui-settings-plugin-inventory`): inject the
 * remote face, mount the generated `capabilityPolicy` Typert contribution, and
 * register a `settings.section` (order 12, between `models`=10 and `plugins`=15)
 * whose card renders the classification lists.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import type { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client';
import { type CapabilityKey } from './CapabilitySection.tsx';
export type { CapabilitySectionInjected, CapabilitySectionProps } from './CapabilitySection.tsx';
export type { CapabilityKey } from './CapabilitySection.tsx';
export type { CapabilityRow, CapabilitySnapshot, CapabilityPolicyRemote } from './store.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** 能力管理 tab copy. */
        'settings.capability': Record<CapabilityKey, string>;
    }
}
/** Required services (cordis fiber inject). The shared ZeroWall base client
 * mounts the Typert remote contribution exactly once; this package only reads
 * the resulting namespace and must not mount it a second time. */
export declare const inject: string[];
/** Register the 能力管理 section once `settings.section` is on the ledger. */
export declare function apply(ctx: ClientContext & {
    slots: SlotRegistry;
}): Promise<() => void>;
//# sourceMappingURL=index.d.ts.map