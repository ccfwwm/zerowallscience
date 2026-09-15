/** Shared Host/browser contract for file-review display preferences. */
/** Settings namespace owned by this plugin. */
export declare const FILE_REVIEW_SETTINGS_NAMESPACE = "file-review";
/** Preserve the existing horizontally scrollable diff presentation by default. */
export declare const DEFAULT_WORD_WRAP = false;
export type DiffLayout = 'split' | 'unified';
export declare const DEFAULT_DIFF_LAYOUT: DiffLayout;
/** Plugin composition config and durable user-settings section. */
export interface Config {
    /** Visually wrap long diff lines without changing their underlying text. */
    wordWrap?: boolean;
    diffLayout?: DiffLayout;
}
//# sourceMappingURL=settings-contract.d.ts.map