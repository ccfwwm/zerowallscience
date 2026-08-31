export declare const PPT_ERROR_CODES: readonly ["PPT_ABORTED", "PPT_PLATFORM_UNSUPPORTED", "PPT_RESOURCE_LIMIT", "PPT_PATH_OUTSIDE_WORKSPACE", "PPT_PATH_INVALID", "PPT_OUTPUT_EXISTS", "PPT_DEPENDENCY_MISSING", "PPT_CAPABILITY_UNAVAILABLE", "BROWSER_URL_BLOCKED", "BROWSER_REF_STALE", "BROWSER_NOT_READY", "BROWSER_LIMIT_EXCEEDED", "PYTHON_DEPENDENCY_MISSING", "PYTHON_EXECUTION_FAILED", "IMAGE_SEARCH_FAILED", "IMAGE_ASSET_INVALID", "PPT_OUTLINE_INVALID", "PPT_ART_DIRECTION_INVALID", "HTML_CREATE_INPUT_INVALID", "HTML_CREATE_UNSUPPORTED_CSS", "HTML_CREATE_VALIDATION_FAILED", "PPT_CREATE_INPUT_INVALID", "PPT_CREATE_UNSUPPORTED_ELEMENT", "PPT_CREATE_ASSET_MISSING", "PPT_CREATE_WRITE_FAILED", "PPT_CREATE_INVALID_PACKAGE", "PPT_CREATE_ABORTED", "PPT_RENDER_NOT_AVAILABLE", "PPT_RENDER_FAILED", "PPT_QUALITY_FAILED"];
export type PptErrorCode = typeof PPT_ERROR_CODES[number];
export interface PptErrorOptions {
    cause?: unknown;
    details?: Readonly<Record<string, unknown>>;
}
export declare class PptError extends Error {
    readonly code: PptErrorCode;
    readonly details?: Readonly<Record<string, unknown>>;
    constructor(code: PptErrorCode, message: string, options?: PptErrorOptions);
    toJSON(): Record<string, unknown>;
}
export declare function asPptError(error: unknown, code: PptErrorCode, prefix?: string): PptError;
export declare function throwIfAborted(signal?: AbortSignal, code?: PptErrorCode): void;
