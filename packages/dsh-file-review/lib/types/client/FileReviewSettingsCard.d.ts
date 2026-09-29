import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import { type Config, type DiffLayout } from '../settings-contract.ts';
import { NS } from './locales.ts';
export type FileReviewSettingsCardInjected = {
    hooks: {
        fileReviewSettings: ConfigForm<Config>;
    };
    setWordWrap(value: boolean): Promise<void>;
    setDiffLayout(value: DiffLayout): Promise<void>;
};
export type FileReviewSettingsCardProps = PropsRuntime<'settings.plugins.tab'> & PropsLocale<typeof NS> & InjectFace<FileReviewSettingsCardInjected>;
export interface FileReviewSettingsTabProps extends PropsRuntime<'settings.plugins.tab'>, PropsLocale<typeof NS> {
    readonly settings: ConfigForm<Config>;
}
/** Adapter for the rc.2 Plugins tab, whose owner intentionally supplies no business face. */
export declare function FileReviewSettingsTab({ settings, t }: FileReviewSettingsTabProps): import("react").JSX.Element;
/** Minimal settings card owned by the file-review plugin. */
export declare function FileReviewSettingsCard({ setWordWrap, setDiffLayout, t, useFileReviewSettings, }: FileReviewSettingsCardProps): import("react").JSX.Element;
//# sourceMappingURL=FileReviewSettingsCard.d.ts.map