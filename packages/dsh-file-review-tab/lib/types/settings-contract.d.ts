/** Shared Host/browser contract for file-review display preferences. */
/** Settings namespace owned by this plugin. */
export declare const FILE_REVIEW_SETTINGS_NAMESPACE = "file-review";
/** Preserve the existing horizontally scrollable diff presentation by default. */
export declare const DEFAULT_WORD_WRAP = false;
/** Plugin composition config and durable user-settings section. */
export interface Config {
    /** Visually wrap long diff lines without changing their underlying text. */
    wordWrap?: boolean;
}
//# sourceMappingURL=settings-contract.d.ts.map