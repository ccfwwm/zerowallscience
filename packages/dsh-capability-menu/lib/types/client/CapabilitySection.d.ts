import type { CapabilityPolicyRemote } from './store.ts';
/** Props injected by the settings.section registration (see index.ts). */
export interface CapabilitySectionInjected {
    remote: CapabilityPolicyRemote;
    t(key: CapabilityKey, params?: Record<string, unknown>): string;
    /** Diagnostic: `$mount` failure surfaced instead of crashing the section. */
    mountError?: string;
    /** Diagnostic: namespace methods actually installed on `ctx.remote.capabilityPolicy`. */
    remoteKeys?: string;
    subscribeSession?: (listener: () => void) => () => void;
}
export type CapabilitySectionProps = CapabilitySectionInjected;
export type CapabilityKey = 'nav' | 'title' | 'desc' | 'resident' | 'on-demand' | 'disabled' | 'kind' | 'class' | 'tool' | 'skill' | 'mandatory' | 'rules' | 'toolsGroup' | 'skillsGroup' | 'builtInGroup' | 'globalSkills' | 'projectSkills' | 'emptyTools' | 'emptySkills' | 'emptyGlobalSkills' | 'emptyProjectSkills' | 'toolCount' | 'publicInternalCount' | 'residentShort' | 'onDemandShort' | 'disabledShort' | 'cycleHint' | 'notPreviewable' | 'previewClose' | 'detailNotFound' | 'cycleOverridden' | 'viewCatalog' | 'catalogPolicy' | 'catalogOnDemand' | 'catalogPolicyNote' | 'catalogDisabled' | 'catalogUnreadable' | 'resetDefaults';
export declare function CapabilitySection(props: CapabilitySectionProps): JSX.Element;
//# sourceMappingURL=CapabilitySection.d.ts.map