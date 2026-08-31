//#region src/errors.ts
const PPT_ERROR_CODES = [
	"PPT_ABORTED",
	"PPT_PLATFORM_UNSUPPORTED",
	"PPT_RESOURCE_LIMIT",
	"PPT_PATH_OUTSIDE_WORKSPACE",
	"PPT_PATH_INVALID",
	"PPT_OUTPUT_EXISTS",
	"PPT_DEPENDENCY_MISSING",
	"PPT_CAPABILITY_UNAVAILABLE",
	"BROWSER_URL_BLOCKED",
	"BROWSER_REF_STALE",
	"BROWSER_NOT_READY",
	"BROWSER_LIMIT_EXCEEDED",
	"PYTHON_DEPENDENCY_MISSING",
	"PYTHON_EXECUTION_FAILED",
	"IMAGE_SEARCH_FAILED",
	"IMAGE_ASSET_INVALID",
	"PPT_OUTLINE_INVALID",
	"PPT_ART_DIRECTION_INVALID",
	"HTML_CREATE_INPUT_INVALID",
	"HTML_CREATE_UNSUPPORTED_CSS",
	"HTML_CREATE_VALIDATION_FAILED",
	"PPT_CREATE_INPUT_INVALID",
	"PPT_CREATE_UNSUPPORTED_ELEMENT",
	"PPT_CREATE_ASSET_MISSING",
	"PPT_CREATE_WRITE_FAILED",
	"PPT_CREATE_INVALID_PACKAGE",
	"PPT_CREATE_ABORTED",
	"PPT_RENDER_NOT_AVAILABLE",
	"PPT_RENDER_FAILED",
	"PPT_QUALITY_FAILED"
];
var PptError = class extends Error {
	code;
	details;
	constructor(code, message, options = {}) {
		super(message, { cause: options.cause });
		this.name = "PptError";
		this.code = code;
		this.details = options.details;
	}
	toJSON() {
		return {
			name: this.name,
			code: this.code,
			message: this.message,
			...this.details === void 0 ? {} : { details: this.details }
		};
	}
};
function asPptError(error, code, prefix) {
	if (error instanceof PptError) return error;
	const message = error instanceof Error ? error.message : String(error);
	return new PptError(code, prefix === void 0 ? message : `${prefix}: ${message}`, { cause: error });
}
function throwIfAborted(signal, code = "PPT_ABORTED") {
	if (!signal?.aborted) return;
	throw new PptError(code, `operation aborted: ${signal.reason instanceof Error ? signal.reason.message : String(signal.reason ?? "aborted")}`);
}
//#endregion
export { throwIfAborted as i, PptError as n, asPptError as r, PPT_ERROR_CODES as t };

//# sourceMappingURL=errors-B2SDbEye.mjs.map