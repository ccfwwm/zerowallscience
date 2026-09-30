import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import { type Config, type DiffLayout } from '../settings-contract.ts';
import { NS } from './locales.ts';
export type FileReviewSettingsCardInjected = {
    hooks: {
        fileReviewSettings: ConfigForm<Config>;
    };
    setWordWrap(value: boolean): Promise<boolean>;
    setDiffLayout(value: DiffLayout): Promise<boolean>;
};
export type FileReviewSettingsCardProps = PropsRuntime<'plugins.row.config'> & PropsLocale<typeof NS> & InjectFace<FileReviewSettingsCardInjected>;
/** Minimal settings card owned by the file-review plugin. */
export declare function FileReviewSettingsCard({ view, setWordWrap, setDiffLayout, t, useFileReviewSettings, }: FileReviewSettingsCardProps): string | import("react").JSX.Element;
//# sourceMappingURL=FileReviewSettingsCard.d.ts.map