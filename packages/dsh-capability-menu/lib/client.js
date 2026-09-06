window.__ModuleLoader__.load({ id: "@daweifu/capability-menu", factory: (require) => {
var module = { exports: {} };
var exports = module.exports;

Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
let react = require("react");
let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
let react_jsx_runtime = require("react/jsx-runtime");
//#region src/client/store.ts
/** Unwrap a RemoteResult-like, throwing a readable error on failure. */
function unwrap(result, what) {
	if (!result.ok) throw new Error(`${what} failed: ${result.error.code}: ${result.error.message}`);
	return result.value;
}
/** Load the classification list from the remote. */
async function loadSnapshot(remote) {
	return { rows: unwrap(await remote.classifyAll(), "capabilityPolicy.classifyAll") };
}
//#endregion
//#region src/client/CapabilitySection.tsx
/**
* ⚠️ VERIFIED AGAINST REAL rc.8 CLIENT API.
*
* React section for the 能力管理 settings tab. Follows the real dsh client
* pattern (see `dsh-client-ui-settings-plugins`): two tabs (工具 / Skills)
* under one heading, each listing capabilities with a clickable class chip.
*
* Layout:
*   - summary strip   → per-class counts for the active tab (Skills tab counts
*                       its active 全局/项目 sub-tab)
*   - tabs            → Tools | Skills (plugins-tab chrome)
*   - Tools tab       → grouped by server, collapsible disclosure rows; the
*                       per-class count chip and each tool's class chip are
*                       clickable to cycle Resident → On-demand → Disabled.
*                       Harness-native tools (no real MCP server) share the
*                       reserved `built-in` group, shown as 「系统内置」.
*   - Skills tab      → sub-tabs 全局技能 / 项目技能 (always visible), each
*                       with flat skill rows carrying the same clickable class
*                       chip plus a directory tree / file preview
*/
const CLASS_KEYS = [
	"resident",
	"on-demand",
	"disabled"
];
/** Click-cycle order on machine values (displayed as On-demand → Disabled → Resident). */
const NEXT_CLASS = {
	"on-demand": "disabled",
	disabled: "resident",
	resident: "on-demand"
};
/** i18n keys for the short display labels, keyed by the machine class value. */
const CLASS_SHORT_KEYS = {
	resident: "residentShort",
	"on-demand": "onDemandShort",
	disabled: "disabledShort"
};
/** Scoped stylesheet: injected once at module scope, like every official bundle. */
const CSS_ID = "capability-menu-section-css";
const CSS = `
.mc-section{display:flex;flex-direction:column;gap:12px;color:var(--dsw-alias-label-primary)}
.mc-heading{margin:0;font-size:18px;font-weight:600}
.mc-desc{margin:0;color:var(--dsw-alias-label-tertiary);font-size:13px}
.mc-summary{display:flex;gap:12px;flex-wrap:wrap;justify-content:flex-end;align-items:center;padding-bottom:8px}
.mc-catalog-btn{border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:20px;padding:0 10px;cursor:pointer;white-space:nowrap}
.mc-catalog-btn:hover{border-color:var(--dsw-alias-border-l3);background:var(--dsw-alias-interactive-bg-hover)}
.mc-catalog-tabs{padding:8px 16px 0}
.mc-catalog-path{padding:8px 16px 0;margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);word-break:break-all}
.mc-chip{display:inline-flex;align-items:center;gap:6px;font-size:12px;line-height:20px;white-space:nowrap}
/* 三态圆点：常驻=实心、按需=半实心、禁用=圆环+斜杠（禁行标志）。
   形状区分之外仍保留色盲友好（蓝-黄轴）：冷蓝=常驻、暖琥珀=按需、中性灰=禁用。
   三个状态都用内联 SVG 做 mask 绘制，保证 10px 下也是矢量正圆（避免 CSS
   border-radius 小尺寸的方圆变形）；禁用不用空心圆：在「禁用 · 0」这类计数旁，
   空心圆容易被误读成数字 0。 */
.mc-dot{position:relative;width:13px;height:13px;border-radius:50%;flex:none;box-sizing:border-box}
.mc-dot--resident{--mc-dot:#527a9c;background:var(--mc-dot);-webkit-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Ccircle cx='6' cy='6' r='5.3' fill='%23000'/%3E%3C/svg%3E") center/contain no-repeat;mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Ccircle cx='6' cy='6' r='5.3' fill='%23000'/%3E%3C/svg%3E") center/contain no-repeat}
.mc-dot--on-demand{--mc-dot:#a57c33;background:var(--mc-dot);-webkit-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Ccircle cx='6' cy='6' r='4.6' fill='none' stroke='%23000' stroke-width='1.4'/%3E%3Cpath d='M1.4 6 A4.6 4.6 0 0 1 10.6 6 Z' fill='%23000'/%3E%3C/svg%3E") center/contain no-repeat;mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Ccircle cx='6' cy='6' r='4.6' fill='none' stroke='%23000' stroke-width='1.4'/%3E%3Cpath d='M1.4 6 A4.6 4.6 0 0 1 10.6 6 Z' fill='%23000'/%3E%3C/svg%3E") center/contain no-repeat}
.mc-dot--disabled{--mc-dot:#7e7477;background:var(--mc-dot);-webkit-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Ccircle cx='6' cy='6' r='4.6' fill='none' stroke='%23000' stroke-width='1.4'/%3E%3Cline x1='3' y1='9' x2='9' y2='3' stroke='%23000' stroke-width='1.4' stroke-linecap='round'/%3E%3C/svg%3E") center/contain no-repeat;mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Ccircle cx='6' cy='6' r='4.6' fill='none' stroke='%23000' stroke-width='1.4'/%3E%3Cline x1='3' y1='9' x2='9' y2='3' stroke='%23000' stroke-width='1.4' stroke-linecap='round'/%3E%3C/svg%3E") center/contain no-repeat}
body[data-ds-dark-theme] .mc-dot--resident{--mc-dot:#96b6d1}
body[data-ds-dark-theme] .mc-dot--on-demand{--mc-dot:#d4b26b}
body[data-ds-dark-theme] .mc-dot--disabled{--mc-dot:#b8abad}
/* 同上色系（低饱和灰调）：仅文字着色，不加背景，浅/深主题各一档。 */
.mc-chip--resident{color:#527a9c}
.mc-chip--on-demand{color:#a57c33}
.mc-chip--disabled{color:#7e7477}
body[data-ds-dark-theme] .mc-chip--resident{color:#96b6d1}
body[data-ds-dark-theme] .mc-chip--on-demand{color:#d4b26b}
body[data-ds-dark-theme] .mc-chip--disabled{color:#b8abad}
.mc-tabs{border-bottom:1px solid var(--dsw-alias-border-l2);display:flex;align-items:flex-end;justify-content:space-between;gap:22px}
/* Skills sub-tab bar (全局技能/项目技能): same underline chrome, no right-side summary. */
.mc-subtabs{border-bottom:1px solid var(--dsw-alias-border-l2);display:flex;align-items:flex-end;gap:22px}
.mc-tab-group{display:flex;align-items:flex-end;gap:22px}
.mc-tab{color:var(--dsw-alias-label-tertiary);font:inherit;cursor:pointer;background:0 0;border:0;padding:7px 1px 9px;font-size:13px;line-height:20px;position:relative}
.mc-tab:hover,.mc-tab[data-active=true]{color:var(--dsw-alias-label-primary)}
.mc-tab[data-active=true]:after,.mc-tab:focus-visible:after{background:var(--dsw-alias-label-primary);content:"";border-radius:2px 2px 0 0;height:2px;position:absolute;bottom:-1px;left:0;right:0}
.mc-tab:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px;color:var(--dsw-alias-label-primary);border-radius:2px}
.mc-panel{min-width:0;padding-top:12px}
.mc-panel-inner{display:flex;flex-direction:column;gap:14px}
.mc-group{border:1px solid var(--dsw-alias-border-l2);border-radius:8px;overflow:hidden}
.mc-group-header{box-sizing:border-box;display:flex;align-items:center;gap:10px;width:100%;min-width:0;padding:10px 12px;background:var(--dsw-alias-bg-layer-1);border:0;color:inherit;font:inherit;text-align:left;cursor:pointer}
.mc-group-header:hover{background:var(--dsw-alias-interactive-bg-hover)}
.mc-group-header:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px}
.mc-chevron{color:var(--dsw-alias-label-tertiary);transition:transform .15s ease;flex:none}
.mc-chevron--open{transform:rotate(90deg)}
.mc-server-name{font-weight:600;font-size:14px;line-height:20px;flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mc-server-count{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);flex:none}
.mc-server-meta{margin-left:auto;display:flex;align-items:center;justify-content:flex-end;gap:8px;font-size:12px;color:var(--dsw-alias-label-tertiary);flex:none;min-width:0}
.mc-counts{display:flex;justify-content:flex-end;gap:6px;flex-wrap:wrap}
.mc-count{font-size:11px;line-height:18px;padding:0 8px;border-radius:999px;border:1px solid transparent;font-family:inherit;cursor:pointer;display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
.mc-count:hover{border-color:var(--dsw-alias-border-l3)}
.mc-count:disabled{cursor:default;opacity:.6}
.mc-count--resident{color:#527a9c}
.mc-count--on-demand{color:#a57c33}
.mc-count--disabled{color:#7e7477}
body[data-ds-dark-theme] .mc-count--resident{color:#96b6d1}
body[data-ds-dark-theme] .mc-count--on-demand{color:#d4b26b}
body[data-ds-dark-theme] .mc-count--disabled{color:#b8abad}
.mc-tools{border-top:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base)}
.mc-tool{display:flex;align-items:center;gap:10px;padding:7px 12px 7px 26px;font-size:13px;line-height:20px;cursor:pointer}
.mc-tool:hover{background:var(--dsw-alias-interactive-bg-hover)}
.mc-tool-name{font-family:var(--dsw-font-markdown-code-block-font-family);font-size:12px;color:var(--dsw-alias-label-primary);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mc-tool-meta{margin-left:auto;display:flex;align-items:center;gap:8px;flex:0 1 auto;min-width:0}
.mc-dot-btn{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border:1px solid transparent;border-radius:999px;background:0 0;cursor:pointer}
.mc-dot-btn:hover{border-color:var(--dsw-alias-border-l3);background:var(--dsw-alias-interactive-bg-hover)}
.mc-dot-btn:disabled{cursor:default;opacity:.6;border-color:transparent;background:0 0}
.mc-tag{font-size:11px;line-height:18px;padding:0 8px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-tertiary)}
.mc-empty{padding:16px;text-align:center;font-size:13px;color:var(--dsw-alias-label-tertiary);border:1px dashed var(--dsw-alias-border-l2);border-radius:8px}
.mc-error{padding:12px;border:1px solid var(--dsw-alias-state-error-primary);border-radius:8px;color:var(--dsw-alias-state-error-primary);font-size:13px}
.mc-error pre{margin:8px 0 0;white-space:pre-wrap;word-break:break-all;font-size:11px;color:var(--dsw-alias-label-tertiary)}
.mc-notice{padding:10px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;color:var(--dsw-alias-label-secondary);font-size:13px}
.mc-skill{border:1px solid var(--dsw-alias-border-l2);border-radius:8px;overflow:hidden;background:var(--dsw-alias-bg-layer-1)}
.mc-skill-row{box-sizing:border-box;display:flex;align-items:center;gap:10px;width:100%;min-width:0;padding:10px 12px;background:0 0;border:0;color:inherit;font:inherit;text-align:left;cursor:pointer}
.mc-skill-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.mc-skill-name{font-weight:600;font-size:14px;line-height:20px;flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mc-skill-meta{margin-left:auto;display:flex;align-items:center;gap:8px;flex:0 1 auto;min-width:0}
.mc-skill-body{border-top:1px solid var(--dsw-alias-border-l1);padding:8px 12px 12px}
.mc-tree{display:flex;flex-direction:column;gap:2px;font-size:13px;line-height:20px}
.mc-tree-row{display:flex;align-items:center;gap:8px;padding:3px 4px;border-radius:6px;cursor:pointer;min-width:0}
.mc-tree-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.mc-tree-indent{flex:none;width:16px}
.mc-tree-icon{flex:none;color:var(--dsw-alias-label-tertiary);display:inline-flex}
.mc-tree-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mc-tree-file:hover .mc-tree-name{color:var(--dsw-alias-label-primary)}
.mc-preview-mask{position:fixed;inset:0;background:var(--dsw-alias-bg-mask-2);display:flex;align-items:center;justify-content:center;z-index:1000}
.mc-preview{width:min(720px,calc(100vw - 48px));max-height:min(560px,calc(100vh - 96px));display:flex;flex-direction:column;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:10px;box-shadow:var(--dsw-alias-bg-mask-drop)}
.mc-preview-head{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.mc-preview-title{font-size:13px;line-height:20px;font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}
.mc-preview-close{flex:none;padding:2px 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer}
.mc-preview-close:hover{background:var(--dsw-alias-interactive-bg-hover)}
.mc-preview-body{overflow:auto;flex:1 1 auto;min-height:0;padding:14px 16px;font-family:var(--dsw-font-markdown-code-block-font-family);font-size:12px;line-height:20px;white-space:pre-wrap;word-break:break-all;color:var(--dsw-alias-label-primary)}
.mc-preview-hint{padding:16px;text-align:center;font-size:13px;color:var(--dsw-alias-label-tertiary)}
`;
if (typeof document !== "undefined" && document.querySelector(`style[data-css-id="${CSS_ID}"]`) === null) {
	const tag = document.createElement("style");
	tag.dataset.cssId = CSS_ID;
	tag.textContent = CSS;
	document.head.appendChild(tag);
}
/** The reserved server key grouping harness-native (non-MCP) tools. */
const BUILT_IN_SERVER = "built-in";
/** Skills whose source root lives inside the current project. */
const PROJECT_SOURCES = /* @__PURE__ */ new Set(["project-dsh", "project-agents"]);
function groupRows(rows) {
	const byServer = /* @__PURE__ */ new Map();
	const skills = [];
	for (const row of rows) {
		if (row.kind === "skill") {
			skills.push(row);
			continue;
		}
		const server = row.server ?? BUILT_IN_SERVER;
		const list = byServer.get(server);
		if (list === void 0) byServer.set(server, [row]);
		else list.push(row);
	}
	return {
		servers: [...byServer.entries()].map(([server, tools]) => ({
			server,
			tools: [...tools].sort((a, b) => a.name.localeCompare(b.name))
		})).sort((a, b) => a.server.localeCompare(b.server)),
		skills: [...skills].sort((a, b) => a.name.localeCompare(b.name))
	};
}
function countByClass(rows, cls) {
	return rows.reduce((n, row) => row.class === cls ? n + 1 : n, 0);
}
function CapabilitySection(props) {
	const { remote, t, mountError, remoteKeys } = props;
	const [state, setState] = (0, react.useState)({ status: "loading" });
	const [busy, setBusy] = (0, react.useState)(false);
	const [notice, setNotice] = (0, react.useState)(null);
	const [openServers, setOpenServers] = (0, react.useState)(/* @__PURE__ */ new Set());
	const [activeTab, setActiveTab] = (0, react.useState)("tools");
	const generation = (0, react.useRef)(0);
	const reload = (0, react.useCallback)(async () => {
		const request = ++generation.current;
		if (remote === void 0) {
			setState({
				status: "error",
				message: mountError ?? "capabilityPolicy remote 未挂载"
			});
			return;
		}
		try {
			const snapshot = await loadSnapshot(remote);
			if (request === generation.current) setState({
				status: "ready",
				snapshot
			});
		} catch (e) {
			if (request === generation.current) setState({
				status: "error",
				message: String(e)
			});
		}
	}, [remote, mountError]);
	(0, react.useEffect)(() => {
		reload();
		const unsubscribe = props.subscribeSession?.(() => {
			reload();
		});
		return () => {
			generation.current++;
			unsubscribe?.();
		};
	}, [reload, props.subscribeSession]);
	const toggleServer = (0, react.useCallback)((server) => {
		setOpenServers((prev) => {
			const next = new Set(prev);
			if (next.has(server)) next.delete(server);
			else next.add(server);
			return next;
		});
	}, []);
	/** Move one or more capability ids to the next class in the click cycle. */
	const cycleClass = (0, react.useCallback)(async (ids, kind) => {
		if (ids.length === 0 || busy) return;
		const request = generation.current;
		setBusy(true);
		try {
			const config = unwrap(await remote.getConfig(), "capabilityPolicy.getConfig");
			if (request !== generation.current) return;
			const key = kind === "skill" ? "skills" : "tools";
			const set = config[key];
			const lists = {
				resident: [],
				"on-demand": [],
				disabled: []
			};
			for (const cls of CLASS_KEYS) {
				const raw = set && typeof set === "object" && !Array.isArray(set) ? set[cls] : void 0;
				lists[cls] = Array.isArray(raw) ? raw.filter((x) => typeof x === "string") : [];
			}
			const from = ids.map((id) => state.status === "ready" ? state.snapshot.rows.find((r) => r.id === id)?.class : void 0).find((c) => c !== void 0) ?? "on-demand";
			const to = NEXT_CLASS[from];
			for (const cls of CLASS_KEYS) lists[cls] = lists[cls].filter((id) => !ids.includes(id));
			lists[to] = [...lists[to], ...ids];
			const nextLists = {};
			for (const cls of CLASS_KEYS) nextLists[cls] = lists[cls];
			await remote.updateConfig({ [key]: nextLists });
			if (request !== generation.current) return;
			const next = await loadSnapshot(remote);
			if (request !== generation.current) return;
			setState({
				status: "ready",
				snapshot: next
			});
			const overridden = ids.filter((id) => next.rows.find((r) => r.id === id)?.class !== to);
			setNotice(overridden.length > 0 ? t("cycleOverridden", { count: overridden.length }) : null);
		} catch (e) {
			setState({
				status: "error",
				message: String(e)
			});
		} finally {
			setBusy(false);
		}
	}, [
		remote,
		busy,
		state,
		t
	]);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
		className: "mc-section",
		children: [
			state.status === "loading" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
				className: "mc-empty",
				children: [t("desc"), "…"]
			}),
			state.status === "error" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "mc-error",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: state.message }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", { children: `mountError=${String(mountError)}\nremoteKeys=${String(remoteKeys)}` })]
			}),
			notice !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "mc-notice",
				children: notice
			}),
			state.status === "ready" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ReadyBody, {
				remote,
				snapshot: state.snapshot,
				openServers,
				busy,
				activeTab,
				t,
				onTabChange: setActiveTab,
				onToggleServer: toggleServer,
				onCycle: cycleClass
			})
		]
	});
}
function ReadyBody(props) {
	const { remote, snapshot, openServers, busy, activeTab, t, onTabChange, onToggleServer, onCycle } = props;
	const { servers, skills } = groupRows(snapshot.rows);
	const projectSkills = skills.filter((skill) => PROJECT_SOURCES.has(skill.source ?? ""));
	const globalSkills = skills.filter((skill) => !PROJECT_SOURCES.has(skill.source ?? ""));
	const [skillTab, setSkillTab] = (0, react.useState)("global");
	const statRows = activeTab === "tools" ? snapshot.rows.filter((r) => r.kind === "tool") : skillTab === "project" ? projectSkills : globalSkills;
	const summary = CLASS_KEYS.map((cls) => ({
		cls,
		count: countByClass(statRows, cls)
	}));
	/** Tool-detail modal: one schema popup at a time. */
	const [toolDetail, setToolDetail] = (0, react.useState)(null);
	/** Fetch and show the model-facing tool definition (name/description/parameters). */
	const openToolDetail = (0, react.useCallback)(async (id) => {
		setToolDetail({
			id,
			status: "loading"
		});
		try {
			const detail = unwrap(await remote.getDetail(id), "capabilityPolicy.getDetail");
			setToolDetail(detail === void 0 ? {
				id,
				status: "error",
				message: t("detailNotFound")
			} : {
				id,
				status: "ready",
				detail
			});
		} catch (error) {
			setToolDetail({
				id,
				status: "error",
				message: String(error)
			});
		}
	}, [remote, t]);
	/** 能力目录弹层状态：查看三档策略配置 + 按需能力目录文件。 */
	const [catalogDocs, setCatalogDocs] = (0, react.useState)(null);
	const [catalogTab, setCatalogTab] = (0, react.useState)("policy");
	/** Fetch and show the two read-only catalog documents. */
	const openCatalogDocs = (0, react.useCallback)(async () => {
		setCatalogDocs({ status: "loading" });
		try {
			const docs = unwrap(await remote.getCatalogDocs(), "capabilityPolicy.getCatalogDocs");
			setCatalogDocs({
				status: "ready",
				docs
			});
		} catch (error) {
			setCatalogDocs({
				status: "error",
				message: String(error)
			});
		}
	}, [remote]);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
		/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
			className: "mc-heading",
			children: t("title")
		}),
		/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
			className: "mc-desc",
			children: t("desc")
		}),
		/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: "mc-tabs",
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "mc-tab-group",
				role: "tablist",
				"aria-label": t("title"),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					role: "tab",
					className: "mc-tab",
					"aria-selected": activeTab === "tools",
					"data-active": activeTab === "tools" ? "true" : void 0,
					onClick: () => onTabChange("tools"),
					children: t("toolsGroup")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					role: "tab",
					className: "mc-tab",
					"aria-selected": activeTab === "skills",
					"data-active": activeTab === "skills" ? "true" : void 0,
					onClick: () => onTabChange("skills"),
					children: t("skillsGroup")
				})]
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "mc-summary",
				children: [summary.map(({ cls, count }) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: `mc-chip mc-chip--${cls}`,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: `mc-dot mc-dot--${cls}`,
							"aria-hidden": "true"
						}),
						t(CLASS_SHORT_KEYS[cls]),
						" · ",
						count
					]
				}, cls)), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: "mc-catalog-btn",
					onClick: () => void openCatalogDocs(),
					children: t("viewCatalog")
				})]
			})]
		}),
		/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
			role: "tabpanel",
			hidden: activeTab !== "tools",
			className: "mc-panel",
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "mc-panel-inner",
				children: servers.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "mc-empty",
					children: t("emptyTools")
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: servers.map(({ server, tools }) => {
					const open = openServers.has(server);
					const counts = CLASS_KEYS.map((cls) => ({
						cls,
						count: countByClass(tools, cls)
					}));
					return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "mc-group",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "mc-group-header",
							role: "button",
							tabIndex: 0,
							"aria-expanded": open,
							onClick: () => onToggleServer(server),
							onKeyDown: (e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									onToggleServer(server);
								}
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconTriangleRightFill14, {
									size: 12,
									className: `mc-chevron${open ? " mc-chevron--open" : ""}`
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "mc-server-name",
									children: server === BUILT_IN_SERVER ? t("builtInGroup") : server
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "mc-server-count",
									children: t("toolCount", { count: tools.length })
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "mc-server-meta",
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "mc-counts",
										children: counts.filter(({ count }) => count > 0).map(({ cls, count }) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
											type: "button",
											className: `mc-count mc-count--${cls}`,
											disabled: busy,
											title: t("cycleHint"),
											onClick: (e) => {
												e.stopPropagation();
												onCycle(tools.filter((t) => t.class === cls).map((t) => t.id), "tool");
											},
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: `mc-dot mc-dot--${cls}`,
													"aria-hidden": "true"
												}),
												t(CLASS_SHORT_KEYS[cls]),
												" ",
												count
											]
										}, cls))
									})
								})
							]
						}), open && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "mc-tools",
							children: tools.map((tool) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "mc-tool",
								title: tool.classLabel,
								role: "button",
								tabIndex: 0,
								"aria-label": tool.name,
								onClick: () => void openToolDetail(tool.id),
								onKeyDown: (e) => {
									if (e.key === "Enter" || e.key === " ") {
										e.preventDefault();
										openToolDetail(tool.id);
									}
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "mc-tool-name",
									children: tool.name
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: "mc-tool-meta",
									children: [tool.mandatory && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "mc-tag",
										children: t("mandatory")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: `mc-dot-btn mc-count--${tool.class}`,
										disabled: busy || tool.mandatory,
										title: tool.classLabel,
										"aria-label": tool.classLabel,
										onClick: (e) => {
											e.stopPropagation();
											onCycle([tool.id], "tool");
										},
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: `mc-dot mc-dot--${tool.class}`,
											"aria-hidden": "true"
										})
									})]
								})]
							}, tool.id))
						})]
					}, server);
				}) })
			})
		}),
		/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
			role: "tabpanel",
			hidden: activeTab !== "skills",
			className: "mc-panel",
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "mc-panel-inner",
				children: skills.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "mc-empty",
					children: t("emptySkills")
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "mc-subtabs",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "mc-tab-group",
						role: "tablist",
						"aria-label": t("skillsGroup"),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							role: "tab",
							className: "mc-tab",
							"aria-selected": skillTab === "global",
							"data-active": skillTab === "global" ? "true" : void 0,
							onClick: () => setSkillTab("global"),
							children: t("globalSkills")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							role: "tab",
							className: "mc-tab",
							"aria-selected": skillTab === "project",
							"data-active": skillTab === "project" ? "true" : void 0,
							onClick: () => setSkillTab("project"),
							children: t("projectSkills")
						})]
					})
				}), skillTab === "global" ? globalSkills.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SkillList, {
					skills: globalSkills,
					remote,
					busy,
					t,
					onCycle
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "mc-empty",
					children: t("emptyGlobalSkills")
				}) : projectSkills.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SkillList, {
					skills: projectSkills,
					remote,
					busy,
					t,
					onCycle
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "mc-empty",
					children: t("emptyProjectSkills")
				})] })
			})
		}),
		toolDetail !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
			className: "mc-preview-mask",
			onClick: () => setToolDetail(null),
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "mc-preview",
				onClick: (e) => e.stopPropagation(),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "mc-preview-head",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "mc-preview-title",
							children: toolDetail.detail?.name ?? toolDetail.id
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "mc-preview-close",
							onClick: () => setToolDetail(null),
							children: t("previewClose")
						})]
					}),
					toolDetail.status === "loading" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "mc-preview-hint",
						children: "…"
					}),
					toolDetail.status === "error" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "mc-preview-hint",
						children: toolDetail.message
					}),
					toolDetail.status === "ready" && toolDetail.detail !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
						className: "mc-preview-body",
						children: JSON.stringify({
							type: "function",
							function: {
								name: toolDetail.detail.name,
								description: toolDetail.detail.description,
								parameters: toolDetail.detail.parameters
							}
						}, null, 2)
					})
				]
			})
		}),
		catalogDocs !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
			className: "mc-preview-mask",
			onClick: () => setCatalogDocs(null),
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "mc-preview",
				onClick: (e) => e.stopPropagation(),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "mc-preview-head",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "mc-preview-title",
							children: t("viewCatalog")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "mc-preview-close",
							onClick: () => setCatalogDocs(null),
							children: t("previewClose")
						})]
					}),
					catalogDocs.status === "loading" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "mc-preview-hint",
						children: "…"
					}),
					catalogDocs.status === "error" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "mc-preview-hint",
						children: catalogDocs.message
					}),
					catalogDocs.status === "ready" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "mc-subtabs mc-catalog-tabs",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "mc-tab-group",
							role: "tablist",
							"aria-label": t("viewCatalog"),
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								role: "tab",
								className: "mc-tab",
								"aria-selected": catalogTab === "policy",
								"data-active": catalogTab === "policy" ? "true" : void 0,
								onClick: () => setCatalogTab("policy"),
								children: t("catalogPolicy")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								role: "tab",
								className: "mc-tab",
								"aria-selected": catalogTab === "catalog",
								"data-active": catalogTab === "catalog" ? "true" : void 0,
								onClick: () => setCatalogTab("catalog"),
								children: t("catalogOnDemand")
							})]
						})
					}), catalogTab === "policy" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "mc-catalog-path",
						children: t("catalogPolicyNote")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
						className: "mc-preview-body",
						children: catalogDocs.docs.policyYaml
					})] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [catalogDocs.docs.catalog !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "mc-catalog-path",
						children: catalogDocs.docs.catalog.path
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "mc-catalog-path",
						children: t("catalogOnDemand")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
						className: "mc-preview-body",
						children: catalogDocs.docs.catalog?.content ?? (catalogDocs.docs.catalogMissing === "disabled" ? t("catalogDisabled") : t("catalogUnreadable"))
					})] })] })
				]
			})
		})
	] });
}
function SkillList(props) {
	const { skills, remote, busy, t, onCycle } = props;
	const [openSkill, setOpenSkill] = (0, react.useState)(null);
	const [tree, setTree] = (0, react.useState)({
		open: {},
		dirs: {}
	});
	const [preview, setPreview] = (0, react.useState)(null);
	const toggleSkill = (0, react.useCallback)(async (id) => {
		if (openSkill === id) {
			setOpenSkill(null);
			return;
		}
		setOpenSkill(id);
		const key = `${id}:`;
		if (tree.dirs[key] === void 0) try {
			const entries = unwrap(await remote.listSkillDir(id, ""), "capabilityPolicy.listSkillDir") ?? [];
			setTree((prev) => ({
				...prev,
				dirs: {
					...prev.dirs,
					[key]: entries
				}
			}));
		} catch (error) {
			console.error("[capability-menu] listSkillDir failed:", error);
			setTree((prev) => ({
				...prev,
				dirs: {
					...prev.dirs,
					[key]: []
				}
			}));
		}
	}, [
		openSkill,
		remote,
		tree.dirs
	]);
	const toggleDir = (0, react.useCallback)(async (id, relPath) => {
		const openKey = `${id}:${relPath}`;
		const nextOpen = !tree.open[openKey];
		setTree((prev) => ({
			...prev,
			open: {
				...prev.open,
				[openKey]: nextOpen
			}
		}));
		if (nextOpen) {
			const key = `${id}:${relPath}`;
			if (tree.dirs[key] === void 0) try {
				const entries = unwrap(await remote.listSkillDir(id, relPath), "capabilityPolicy.listSkillDir") ?? [];
				setTree((prev) => ({
					...prev,
					dirs: {
						...prev.dirs,
						[key]: entries
					}
				}));
			} catch (error) {
				console.error(`[capability-menu] listSkillDir ${key} failed:`, error);
				setTree((prev) => ({
					...prev,
					dirs: {
						...prev.dirs,
						[key]: []
					}
				}));
			}
		}
	}, [
		remote,
		tree.dirs,
		tree.open
	]);
	const openPreview = (0, react.useCallback)(async (id, relPath) => {
		setPreview({
			id,
			relPath
		});
		try {
			const content = unwrap(await remote.readSkillFile(id, relPath), "capabilityPolicy.readSkillFile");
			if (content === void 0) setPreview({
				id,
				relPath,
				error: t("notPreviewable")
			});
			else setPreview({
				id,
				relPath,
				content
			});
		} catch (error) {
			setPreview({
				id,
				relPath,
				error: String(error)
			});
		}
	}, [remote, t]);
	const renderEntries = (entries, id, base) => {
		if (entries === void 0) return void 0;
		const indent = base.length === 0 ? 0 : base.split("/").length;
		return entries.map((entry) => {
			const relPath = base.length === 0 ? entry.name : `${base}/${entry.name}`;
			if (entry.type === "directory") {
				const openKey = `${id}:${relPath}`;
				const open = tree.open[openKey] ?? false;
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "mc-tree-row",
					role: "button",
					tabIndex: 0,
					onClick: () => void toggleDir(id, relPath),
					onKeyDown: (e) => {
						if (e.key === "Enter" || e.key === " ") {
							e.preventDefault();
							toggleDir(id, relPath);
						}
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "mc-tree-indent",
							style: { width: 8 + indent * 16 }
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "mc-tree-icon",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconTriangleRightFill14, {
								size: 10,
								className: `mc-chevron${open ? " mc-chevron--open" : ""}`
							})
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "mc-tree-name",
							children: [entry.name, "/"]
						})
					]
				}), open && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: { marginTop: 2 },
					children: renderEntries(tree.dirs[`${id}:${relPath}`], id, relPath) ?? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "mc-tree-row",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "mc-tree-indent",
							style: { width: 20 + indent * 16 }
						}), "…"]
					})
				})] }, relPath);
			}
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "mc-tree-row mc-tree-file",
				role: "button",
				tabIndex: 0,
				title: relPath,
				onClick: () => void openPreview(id, relPath),
				onKeyDown: (e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						openPreview(id, relPath);
					}
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "mc-tree-indent",
					style: { width: 8 + indent * 16 }
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "mc-tree-name",
					children: entry.name
				})]
			}, relPath);
		});
	};
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [skills.map((skill) => {
		const open = openSkill === skill.id;
		return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: "mc-skill",
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "mc-skill-row",
				role: "button",
				tabIndex: 0,
				"aria-expanded": open,
				onClick: () => void toggleSkill(skill.id),
				onKeyDown: (e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						toggleSkill(skill.id);
					}
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconTriangleRightFill14, {
						size: 12,
						className: `mc-chevron${open ? " mc-chevron--open" : ""}`
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "mc-skill-name",
						children: skill.name
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: "mc-skill-meta",
						children: [skill.mandatory && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "mc-tag",
							children: t("mandatory")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							className: `mc-count mc-count--${skill.class}`,
							disabled: busy || skill.mandatory,
							title: skill.classLabel,
							onClick: (e) => {
								e.stopPropagation();
								onCycle([skill.id], "skill");
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: `mc-dot mc-dot--${skill.class}`,
								"aria-hidden": "true"
							}), t(CLASS_SHORT_KEYS[skill.class])]
						})]
					})
				]
			}), open && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "mc-skill-body",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "mc-tree",
					children: renderEntries(tree.dirs[`${skill.id}:`], skill.id, "") ?? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "mc-tree-row",
						children: "…"
					})
				})
			})]
		}, skill.id);
	}), preview !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
		className: "mc-preview-mask",
		onClick: () => setPreview(null),
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: "mc-preview",
			onClick: (e) => e.stopPropagation(),
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "mc-preview-head",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "mc-preview-title",
					children: preview.relPath
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: "mc-preview-close",
					onClick: () => setPreview(null),
					children: t("previewClose")
				})]
			}), preview.content !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
				className: "mc-preview-body",
				children: preview.content
			}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "mc-preview-hint",
				children: preview.error ?? "…"
			})]
		})
	})] });
}
//#endregion
//#region src/client/index.ts
/** Dictionary namespace owned by this plugin. */
const NS = "settings.capability";
/** Required services (cordis fiber inject). The shared ZeroWall base client
* mounts the Typert remote contribution exactly once; this package only reads
* the resulting namespace and must not mount it a second time. */
const inject = [
	"slots",
	"locale",
	"remote"
];
/** Register the 能力管理 section once `settings.section` is on the ledger. */
async function apply(ctx) {
	const zh = {
		nav: "能力管理",
		title: "能力管理",
		desc: "管理工具与技能的 常驻 / 按需 / 禁用 三档分类。",
		resident: "Resident（常驻上下文）",
		"on-demand": "On-demand（按需发现）",
		disabled: "Disabled（禁用）",
		kind: "类型",
		class: "分类",
		tool: "tool",
		skill: "skill",
		mandatory: "meta",
		rules: "规则",
		toolsGroup: "Tools",
		skillsGroup: "Skills",
		builtInGroup: "系统内置",
		globalSkills: "全局技能",
		projectSkills: "项目技能",
		emptyGlobalSkills: "暂无全局技能",
		emptyProjectSkills: "暂无项目技能",
		emptyTools: "暂无工具",
		emptySkills: "暂无 Skill",
		toolCount: "{count} 个工具",
		residentShort: "常驻",
		onDemandShort: "按需",
		disabledShort: "禁用",
		cycleHint: "点击标签切换分类（按需 → 禁用 → 常驻）",
		notPreviewable: "该文件不是可预览的文本文件",
		previewClose: "关闭",
		detailNotFound: "未找到该工具的详情",
		cycleOverridden: "分类未生效：{count} 个能力被更高优先级规则覆盖（如通配规则），可移除对应通配规则后重试",
		viewCatalog: "查看能力目录",
		catalogPolicy: "三档策略配置",
		catalogOnDemand: "按需能力目录",
		catalogPolicyNote: "当前会话的有效策略；选择随会话保存。",
		catalogDisabled: "按需能力目录未启用（catalogFile 为空）",
		catalogUnreadable: "按需能力目录文件读取失败"
	};
	const en = {
		nav: "Capability Management",
		title: "Capability Management",
		desc: "Manage the Resident / On-demand / Disabled classification of tools and skills.",
		resident: "Resident",
		"on-demand": "On-demand",
		disabled: "Disabled",
		kind: "kind",
		class: "class",
		tool: "tool",
		skill: "skill",
		mandatory: "meta",
		rules: "rules",
		toolsGroup: "Tools",
		skillsGroup: "Skills",
		builtInGroup: "System built-in",
		globalSkills: "Global skills",
		projectSkills: "Project skills",
		emptyGlobalSkills: "No global skills",
		emptyProjectSkills: "No project skills",
		emptyTools: "No tools",
		emptySkills: "No skills",
		toolCount: "{count} tools",
		residentShort: "Resident",
		onDemandShort: "On-demand",
		disabledShort: "Disabled",
		cycleHint: "Click a tag to cycle its classification (On-demand → Disabled → Resident)",
		notPreviewable: "This file is not a previewable text file",
		previewClose: "Close",
		detailNotFound: "Tool detail not found",
		cycleOverridden: "Classification not applied: {count} capability(ies) overridden by a higher-priority rule (e.g. a wildcard). Remove the matching wildcard rule and retry.",
		viewCatalog: "View capability catalog",
		catalogPolicy: "Policy (effective)",
		catalogOnDemand: "On-demand catalog",
		catalogPolicyNote: "Effective policy for the current session. Selections are saved with the session.",
		catalogDisabled: "On-demand catalog emission is disabled (catalogFile is empty).",
		catalogUnreadable: "Failed to read the on-demand catalog file."
	};
	ctx.effect(() => ctx.locale.register(NS, {
		zh,
		en
	}), "capability-menu: dictionaries");
	const t = ctx.locale.bind(NS);
	const remote = () => {
		try {
			return ctx.get("remote.capabilityPolicy");
		} catch (error) {
			console.error("[capability-menu] ctx.get(\"remote.capabilityPolicy\") failed:", error);
			return;
		}
	};
	const injected = () => {
		const raw = remote();
		const currentSession = () => {
			return ctx.get("sessions")?.list.getSnapshot().current;
		};
		const namespace = raw == null ? raw : new Proxy(raw, { get(target, key) {
			if (key === "getConfig" || key === "classifyAll" || key === "getCatalogDocs") return () => Reflect.apply(target[key], target, [currentSession()]);
			if (key === "updateConfig") return (partial) => Reflect.apply(target.updateConfig, target, [partial, currentSession()]);
			const value = Reflect.get(target, key);
			return typeof value === "function" ? value.bind(target) : value;
		} });
		const remoteKeys = namespace == null ? void 0 : Object.keys(namespace).filter((k) => [
			"getConfig",
			"updateConfig",
			"classifyAll"
		].includes(k)).join(",");
		return {
			remote: namespace,
			subscribeSession: (listener) => {
				return ctx.get("sessions")?.list.subscribe(listener) ?? (() => {});
			},
			t,
			...remoteKeys !== void 0 ? { remoteKeys } : {}
		};
	};
	ctx.slots.inject("settings.section", () => ctx.slots.register({
		name: "settings.section",
		id: "capability",
		order: 12,
		label: () => t("nav"),
		locale: NS,
		inject: injected
	}, CapabilitySection));
	return () => {};
}
//#endregion
exports.apply = apply;
exports.inject = inject;


return module.exports;
}});