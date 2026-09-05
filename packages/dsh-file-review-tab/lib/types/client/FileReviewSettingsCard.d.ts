import type { SettingsScope } from './runtime-compat.ts';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import { type Config } from '../settings-contract.ts';
import { NS } from './locales.ts';
export type FileReviewSettingsCardInjected = {
    hooks: {
        fileReviewSettings: SettingsScope<Config>;
    };
    setWordWrap(value: boolean): Promise<void>;
};
export type FileReviewSettingsCardProps = PropsRuntime<'settings.plugin.item'> & PropsLocale<typeof NS> & InjectFace<FileReviewSettingsCardInjected>;
/** Minimal settings card owned by the file-review plugin. */
export declare function FileReviewSettingsCard({ setWordWrap, t, useFileReviewSettings, }: FileReviewSettingsCardProps): import("react").JSX.Element | null;
//# sourceMappingURL=FileReviewSettingsCard.d.ts.map