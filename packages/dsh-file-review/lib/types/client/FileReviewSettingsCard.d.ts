import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import { type Config, type DiffLayout } from '../settings-contract.ts';
import { NS } from './locales.ts';
export type FileReviewSettingsCardInjected = {
    hooks: {
        fileReviewSettings: SettingsScope<Config>;
    };
    setWordWrap(value: boolean): Promise<void>;
    setDiffLayout(value: DiffLayout): Promise<void>;
};
export type FileReviewSettingsCardProps = PropsRuntime<'settings.plugin.item'> & PropsLocale<typeof NS> & InjectFace<FileReviewSettingsCardInjected>;
/** Minimal settings card owned by the file-review plugin. */
export declare function FileReviewSettingsCard({ setWordWrap, setDiffLayout, t, useFileReviewSettings, }: FileReviewSettingsCardProps): import("react").JSX.Element | null;
//# sourceMappingURL=FileReviewSettingsCard.d.ts.map