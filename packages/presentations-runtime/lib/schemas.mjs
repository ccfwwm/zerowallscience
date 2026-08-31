//#region src/schemas.ts
const PPT_NATIVE_TOOL_NAMES = [
	"ask_user_question",
	"bash",
	"edit",
	"read",
	"read_image",
	"todo_write",
	"web_search",
	"write"
];
const PPT_TOOL_NAMES = [
	"browser_click",
	"browser_find",
	"browser_scroll_down",
	"browser_scroll_up",
	"browser_visit",
	"html_create",
	"image_search",
	"ppt_create",
	"ppt_fonts",
	"ppt_image",
	"ppt_outline",
	"python"
];
const PPT_MODE_TOOL_NAMES = [...PPT_NATIVE_TOOL_NAMES, ...PPT_TOOL_NAMES].sort();
//#endregion
export { PPT_MODE_TOOL_NAMES, PPT_NATIVE_TOOL_NAMES, PPT_TOOL_NAMES };

//# sourceMappingURL=schemas.mjs.map