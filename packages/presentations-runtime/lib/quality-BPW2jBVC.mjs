import { i as throwIfAborted, n as PptError } from "./errors-B2SDbEye.mjs";
import { createHash, randomUUID } from "node:crypto";
import { access, copyFile, link, lstat, mkdir, open, opendir, readFile, readdir, realpath, rename, rm, stat, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, delimiter, dirname, extname, isAbsolute, join, posix, relative, resolve, sep, win32 } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { constants } from "node:fs";
import * as fontkit from "fontkit";
import sharp from "sharp";
import { strFromU8, unzipSync } from "fflate";
import { z } from "zod";
import PptxGenJS from "pptxgenjs";
import { JSDOM } from "jsdom";
//#region src/atomic.ts
async function atomicWriteFile(target, data, options = {}) {
	throwIfAborted(options.signal);
	const directory = dirname(target);
	await mkdir(directory, { recursive: true });
	const temporary = join(directory, `.${basename(target)}.${process.pid}.${randomUUID()}.tmp`);
	let committed = false;
	try {
		const handle = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, options.mode ?? 384);
		try {
			await handle.writeFile(data);
			await handle.sync();
		} finally {
			await handle.close();
		}
		throwIfAborted(options.signal);
		if (options.overwrite) await rename(temporary, target);
		else {
			try {
				await link(temporary, target);
			} catch (error) {
				if (error.code === "EEXIST") throw new PptError("PPT_OUTPUT_EXISTS", `output already exists: ${target}`);
				throw error;
			}
			await unlink(temporary);
		}
		committed = true;
	} finally {
		if (!committed) await unlink(temporary).catch(() => void 0);
	}
}
function atomicWriteText(target, text, options) {
	return atomicWriteFile(target, text, options);
}
function atomicWriteJson(target, value, options) {
	return atomicWriteText(target, `${JSON.stringify(value, null, 2)}\n`, options);
}
//#endregion
//#region src/platform.ts
function isSupportedPlatform(platform = process.platform) {
	return platform === "darwin" || platform === "linux" || platform === "win32";
}
function systemFontDirectories(platform = process.platform, home = homedir(), env = process.env) {
	if (platform === "darwin") return [
		"/System/Library/Fonts",
		"/System/Library/Fonts/Supplemental",
		"/System/Library/AssetsV2/com_apple_MobileAsset_Font7",
		"/System/Library/AssetsV2/com_apple_MobileAsset_Font8",
		"/Library/Fonts",
		join(home, "Library/Fonts")
	];
	if (platform === "win32") {
		const windows = env.SystemRoot ?? env.WINDIR ?? "C:\\Windows";
		const local = env.LOCALAPPDATA;
		return [win32.join(windows, "Fonts"), ...local === void 0 ? [] : [win32.join(local, "Microsoft", "Windows", "Fonts")]];
	}
	return [
		"/usr/share/fonts",
		"/usr/local/share/fonts",
		join(home, ".local/share/fonts"),
		join(home, ".fonts")
	];
}
function libreOfficeCandidates(platform = process.platform, env = process.env) {
	if (platform === "darwin") return [
		"soffice",
		"/Applications/LibreOffice.app/Contents/MacOS/soffice",
		"/Applications/LibreOfficeDev.app/Contents/MacOS/soffice"
	];
	if (platform === "win32") return [
		"soffice.exe",
		"soffice",
		...[
			env.ProgramFiles,
			env["ProgramFiles(x86)"],
			env.LOCALAPPDATA
		].filter((value) => typeof value === "string" && value.length > 0).map((root) => win32.join(root, "LibreOffice", "program", "soffice.exe"))
	];
	return [
		"soffice",
		"libreoffice",
		"/usr/bin/soffice",
		"/usr/bin/libreoffice"
	];
}
function pdfToPpmCandidates(platform = process.platform) {
	return platform === "win32" ? ["pdftoppm.exe", "pdftoppm"] : ["pdftoppm"];
}
function appleScriptCandidates(platform = process.platform) {
	return platform === "darwin" ? ["/usr/bin/osascript", "osascript"] : [];
}
function screenCaptureCandidates(platform = process.platform) {
	return platform === "darwin" ? ["/usr/sbin/screencapture", "screencapture"] : [];
}
function keynoteCandidates(platform = process.platform, home = homedir()) {
	return platform === "darwin" ? ["/Applications/Keynote.app", join(home, "Applications/Keynote.app")] : [];
}
function powerShellCandidates(platform = process.platform) {
	return platform === "win32" ? [
		"powershell.exe",
		"powershell",
		"pwsh.exe",
		"pwsh"
	] : [];
}
function powerPointCandidates(platform = process.platform, env = process.env, home = homedir()) {
	if (platform === "darwin") return ["/Applications/Microsoft PowerPoint.app", join(home, "Applications/Microsoft PowerPoint.app")];
	if (platform !== "win32") return [];
	return [
		env.ProgramFiles,
		env["ProgramFiles(x86)"],
		env.LOCALAPPDATA
	].filter((value) => typeof value === "string" && value.length > 0).flatMap((root) => [win32.join(root, "Microsoft Office", "root", "Office16", "POWERPNT.EXE"), win32.join(root, "Microsoft Office", "Office16", "POWERPNT.EXE")]);
}
function pptImageBackendOrder(platform = process.platform, requested = "auto") {
	if (requested !== "auto") return [requested];
	if (platform === "darwin") return [
		"keynote",
		"libreoffice",
		"powerpoint"
	];
	if (platform === "win32") return ["powerpoint", "libreoffice"];
	return platform === "linux" ? ["libreoffice"] : [];
}
function browserSystemCandidates(platform = process.platform, home = homedir(), env = process.env) {
	if (platform === "darwin") return [
		"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
		"/Applications/Chromium.app/Contents/MacOS/Chromium",
		join(home, "Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
	];
	if (platform === "win32") return [
		env.ProgramFiles,
		env["ProgramFiles(x86)"],
		env.LOCALAPPDATA
	].filter((value) => typeof value === "string" && value.length > 0).flatMap((root) => [
		win32.join(root, "Google", "Chrome", "Application", "chrome.exe"),
		win32.join(root, "Chromium", "Application", "chrome.exe"),
		win32.join(root, "Microsoft", "Edge", "Application", "msedge.exe")
	]);
	return [
		"/usr/bin/google-chrome",
		"/usr/bin/google-chrome-stable",
		"/usr/bin/chromium",
		"/usr/bin/chromium-browser",
		"/snap/bin/chromium"
	];
}
//#endregion
//#region src/fonts.ts
const FONT_LAYERS = [
	"portable",
	"system",
	"custom"
];
const FONT_ROLES = [
	"latin-sans",
	"latin-serif",
	"cjk-sans",
	"cjk-serif",
	"display",
	"code"
];
const ALL_PLATFORMS = [
	"darwin",
	"win32",
	"linux"
];
const FONT_REGISTRY = Object.freeze([
	{
		name: "Arial",
		aliases: ["ArialMT"],
		language: "Multi-language",
		style: "Sans-serif",
		characteristics: "Portable Office-safe sans-serif",
		layer: "portable",
		platforms: ALL_PLATFORMS,
		roles: ["latin-sans"]
	},
	{
		name: "Times New Roman",
		aliases: ["TimesNewRomanPSMT"],
		language: "Multi-language",
		style: "Serif",
		characteristics: "Portable Office-safe serif",
		layer: "portable",
		platforms: ALL_PLATFORMS,
		roles: ["latin-serif"]
	},
	{
		name: "Segoe UI",
		aliases: ["SegoeUI"],
		language: "Western",
		style: "Sans-serif",
		characteristics: "Windows interface sans-serif",
		layer: "system",
		platforms: ["win32"],
		roles: ["latin-sans"]
	},
	{
		name: "Microsoft YaHei",
		aliases: [
			"Microsoft YaHei UI",
			"MicrosoftYaHei",
			"MicrosoftYaHeiUI"
		],
		language: "Chinese + Western",
		style: "Sans-serif",
		characteristics: "Windows ClearType Chinese sans-serif",
		layer: "system",
		platforms: ["win32"],
		roles: ["cjk-sans", "latin-sans"]
	},
	{
		name: "DengXian",
		aliases: ["Deng"],
		language: "Chinese + Western",
		style: "Sans-serif",
		characteristics: "Windows modern Chinese sans-serif",
		layer: "system",
		platforms: ["win32"],
		roles: ["cjk-sans", "latin-sans"]
	},
	{
		name: "SimSun",
		aliases: ["NSimSun"],
		language: "Chinese + Western",
		style: "Serif",
		characteristics: "Windows Song-style Chinese serif",
		layer: "system",
		platforms: ["win32"],
		roles: ["cjk-serif", "latin-serif"]
	},
	{
		name: "Helvetica Neue",
		aliases: ["HelveticaNeue"],
		language: "Western",
		style: "Sans-serif",
		characteristics: "macOS system sans-serif",
		layer: "system",
		platforms: ["darwin"],
		roles: ["latin-sans"]
	},
	{
		name: "PingFang SC",
		aliases: ["PingFangSC"],
		language: "Chinese + Western",
		style: "Sans-serif",
		characteristics: "macOS Simplified Chinese system sans-serif",
		layer: "system",
		platforms: ["darwin"],
		roles: ["cjk-sans", "latin-sans"]
	},
	{
		name: "Hiragino Sans GB",
		aliases: ["HiraginoSansGB"],
		language: "Chinese + Western",
		style: "Sans-serif",
		characteristics: "macOS Simplified Chinese humanist sans-serif",
		layer: "system",
		platforms: ["darwin"],
		roles: ["cjk-sans", "latin-sans"]
	},
	{
		name: "Songti SC",
		aliases: ["SongtiSC"],
		language: "Chinese + Western",
		style: "Serif",
		characteristics: "macOS Simplified Chinese Song serif",
		layer: "system",
		platforms: ["darwin"],
		roles: ["cjk-serif", "latin-serif"]
	},
	{
		name: "Liberation Sans",
		aliases: ["LiberationSans"],
		language: "Western",
		style: "Sans-serif",
		characteristics: "Linux metric-compatible Arial alternative",
		layer: "system",
		platforms: ["linux"],
		roles: ["latin-sans"]
	},
	{
		name: "Liberation Serif",
		aliases: ["LiberationSerif"],
		language: "Western",
		style: "Serif",
		characteristics: "Linux metric-compatible Times alternative",
		layer: "system",
		platforms: ["linux"],
		roles: ["latin-serif"]
	},
	{
		name: "DejaVu Sans",
		aliases: ["DejaVuSans"],
		language: "Multi-language",
		style: "Sans-serif",
		characteristics: "Widely available Linux sans-serif with broad glyph coverage",
		layer: "system",
		platforms: ["linux"],
		roles: ["latin-sans", "code"]
	},
	{
		name: "DejaVu Serif",
		aliases: ["DejaVuSerif"],
		language: "Multi-language",
		style: "Serif",
		characteristics: "Widely available Linux serif",
		layer: "system",
		platforms: ["linux"],
		roles: ["latin-serif"]
	},
	{
		name: "Noto Sans CJK SC",
		aliases: ["NotoSansCJKsc"],
		language: "Chinese + Multi-language",
		style: "Sans-serif",
		characteristics: "Linux-oriented open CJK sans-serif",
		layer: "system",
		platforms: ["linux"],
		roles: ["cjk-sans", "latin-sans"]
	},
	{
		name: "Noto Serif CJK SC",
		aliases: ["NotoSerifCJKsc"],
		language: "Chinese + Multi-language",
		style: "Serif",
		characteristics: "Linux-oriented open CJK serif",
		layer: "system",
		platforms: ["linux"],
		roles: ["cjk-serif", "latin-serif"]
	},
	{
		name: "Liter",
		language: "English",
		style: "Sans-serif",
		characteristics: "Modern geometric, low contrast, balanced and rational",
		layer: "custom",
		platforms: ALL_PLATFORMS,
		roles: ["latin-sans", "display"]
	},
	{
		name: "HedvigLettersSans",
		aliases: ["Hedvig Letters Sans"],
		language: "English",
		style: "Sans-serif",
		characteristics: "Slightly irregular with a distinctive brand character",
		layer: "custom",
		platforms: ALL_PLATFORMS,
		roles: ["latin-sans", "display"]
	},
	{
		name: "Oranienbaum",
		language: "English",
		style: "High-contrast serif",
		characteristics: "Geometric, elegant and classical",
		layer: "custom",
		platforms: ALL_PLATFORMS,
		roles: ["latin-serif", "display"]
	},
	{
		name: "QuattrocentoSans",
		aliases: ["Quattrocento Sans"],
		language: "English",
		style: "Classical sans-serif",
		characteristics: "Gentle, readable and sharp at small sizes",
		layer: "custom",
		platforms: ALL_PLATFORMS,
		roles: ["latin-sans"]
	},
	{
		name: "SortsMillGoudy",
		aliases: ["Sorts Mill Goudy"],
		language: "English",
		style: "Serif",
		characteristics: "Goudy Old Style revival with soft, legible serifs",
		layer: "custom",
		platforms: ALL_PLATFORMS,
		roles: ["latin-serif"]
	},
	{
		name: "Unna",
		language: "English",
		style: "Neoclassical serif",
		characteristics: "Pronounced vertical rhythm and elegant power",
		layer: "custom",
		platforms: ALL_PLATFORMS,
		roles: ["latin-serif", "display"]
	},
	{
		name: "Coda",
		language: "English",
		style: "Sans-serif",
		characteristics: "Round, friendly and open",
		layer: "custom",
		platforms: ALL_PLATFORMS,
		roles: ["latin-sans", "display"]
	},
	{
		name: "Jersey15",
		aliases: ["Jersey 15"],
		language: "English + Numbers",
		style: "Pixel",
		characteristics: "Sports jersey geometry with a strong grid",
		layer: "custom",
		platforms: ALL_PLATFORMS,
		roles: ["display"]
	},
	{
		name: "Jersey20Charted",
		aliases: ["Jersey 20 Charted"],
		language: "English + Numbers",
		style: "Pixel",
		characteristics: "Grid-textured sports number style",
		layer: "custom",
		platforms: ALL_PLATFORMS,
		roles: ["display"]
	},
	{
		name: "MiSans",
		aliases: ["Mi Sans"],
		language: "Chinese + Multi-language",
		style: "Sans-serif",
		characteristics: "Clean modern variable system font",
		layer: "custom",
		platforms: ALL_PLATFORMS,
		roles: [
			"cjk-sans",
			"latin-sans",
			"display"
		]
	},
	{
		name: "Noto Sans SC",
		aliases: ["NotoSansSC"],
		language: "Chinese + Multi-language",
		style: "Sans-serif",
		characteristics: "Neutral standardized Source Han Sans structure",
		layer: "custom",
		platforms: ALL_PLATFORMS,
		roles: ["cjk-sans", "latin-sans"]
	},
	{
		name: "siyuanSongti",
		aliases: ["Source Han Serif SC", "Source Han Serif CN"],
		language: "Chinese + Multi-language",
		style: "Serif",
		characteristics: "Refined Song structure with contrasting strokes",
		layer: "custom",
		platforms: ALL_PLATFORMS,
		roles: ["cjk-serif", "latin-serif"]
	},
	{
		name: "alimamadaoliti",
		language: "Chinese",
		style: "Clerical",
		characteristics: "Knife-edge strokes with power and antiquity",
		layer: "custom",
		platforms: ALL_PLATFORMS,
		roles: ["cjk-serif", "display"]
	},
	{
		name: "alimamashuheiti",
		language: "Chinese",
		style: "Geometric sans-serif",
		characteristics: "Orderly commercial geometry",
		layer: "custom",
		platforms: ALL_PLATFORMS,
		roles: ["cjk-sans", "display"]
	},
	{
		name: "zhankuwenyiti",
		language: "Chinese",
		style: "Handwritten",
		characteristics: "Simple, fresh and lightly artistic",
		layer: "custom",
		platforms: ALL_PLATFORMS,
		roles: ["cjk-sans", "display"]
	},
	{
		name: "feibozhengdianti",
		language: "Chinese",
		style: "Brush",
		characteristics: "Thick and powerful brush strokes",
		layer: "custom",
		platforms: ALL_PLATFORMS,
		roles: ["cjk-serif", "display"]
	},
	{
		name: "deyihei",
		language: "Chinese",
		style: "Sans-serif",
		characteristics: "Thin slanted humanist geometry",
		layer: "custom",
		platforms: ALL_PLATFORMS,
		roles: ["cjk-sans", "display"]
	},
	{
		name: "jingpindianzhenTi",
		language: "Chinese + Western",
		style: "Pixel",
		characteristics: "9x9 retro-electronic bitmap style",
		layer: "custom",
		platforms: ALL_PLATFORMS,
		roles: ["display", "code"]
	},
	{
		name: "LXGW Bright",
		language: "Chinese + Western",
		style: "Song/Kai",
		characteristics: "Gentle, clear and legible",
		layer: "custom",
		platforms: ALL_PLATFORMS,
		roles: [
			"cjk-serif",
			"latin-serif",
			"display"
		]
	},
	{
		name: "ZCOOL KuaiLe",
		language: "Chinese + Western",
		style: "Display",
		characteristics: "Lively, playful and youthful",
		layer: "custom",
		platforms: ALL_PLATFORMS,
		roles: ["display"]
	},
	{
		name: "xiawuxinzhisong",
		language: "Chinese",
		style: "Serif",
		characteristics: "Bright and elegant Mincho-derived structure",
		layer: "custom",
		platforms: ALL_PLATFORMS,
		roles: ["cjk-serif", "display"]
	}
]);
const REGISTERED_BY_KEY = /* @__PURE__ */ new Map();
for (const font of FONT_REGISTRY) for (const name of [font.name, ...font.aliases ?? []]) REGISTERED_BY_KEY.set(fontKey(name), font);
const REGISTERED_ALIASES = [...REGISTERED_BY_KEY.entries()].sort((a, b) => b[0].length - a[0].length);
function fontKey(value) {
	return value.toLocaleLowerCase().replace(/[\s_-]+/g, "");
}
function registeredFace(value) {
	const key = fontKey(value);
	const exact = REGISTERED_BY_KEY.get(key);
	if (exact !== void 0) return exact;
	for (const [alias, font] of REGISTERED_ALIASES) {
		if (!key.startsWith(alias)) continue;
		const suffix = key.slice(alias.length);
		if (/^(?:(?:extra|ultra|semi|demi)?(?:light|bold)|thin|regular|book|medium|heavy|black|italic|oblique|w\d+)+$/u.test(suffix)) return font;
	}
}
async function fontFiles(roots, maxFiles = 1e4) {
	const files = [];
	const queue = [...new Set(roots)];
	while (queue.length > 0 && files.length < maxFiles) {
		const directory = queue.shift();
		let handle;
		try {
			handle = await opendir(directory);
		} catch {
			continue;
		}
		for await (const entry of handle) {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) queue.push(path);
			else if (entry.isFile() && /^\.(?:ttf|otf|ttc)$/i.test(extname(entry.name))) files.push(path);
			if (files.length >= maxFiles) break;
		}
	}
	return files.sort();
}
function faces(value) {
	return Array.isArray(value.fonts) ? value.fonts : [value];
}
async function discoverRegisteredFonts(extraDirs = [], platform = process.platform) {
	const discovered = [];
	for (const file of await fontFiles([...systemFontDirectories(platform), ...extraDirs])) {
		let opened;
		try {
			opened = await fontkit.open(file);
		} catch {
			continue;
		}
		let hash;
		for (const face of faces(opened)) {
			const familyName = typeof face.familyName === "string" ? face.familyName : "";
			const postscriptName = typeof face.postscriptName === "string" ? face.postscriptName : null;
			const registered = registeredFace(familyName) ?? (postscriptName === null ? void 0 : registeredFace(postscriptName));
			if (registered === void 0) continue;
			hash ??= createHash("sha256").update(await readFile(file)).digest("hex");
			const points = new Set(Array.isArray(face.characterSet) ? face.characterSet.filter((value) => Number.isInteger(value)) : []);
			discovered.push({
				name: registered.name,
				file,
				sha256: hash,
				familyName,
				postscriptName,
				weight: typeof face.subfamilyName === "string" ? face.subfamilyName : "Regular",
				glyphCount: points.size,
				supportsLatin: [..."AaZz09"].every((character) => points.has(character.codePointAt(0))),
				supportsCjk: points.has("中".codePointAt(0)) && points.has("文".codePointAt(0)),
				codePoints: points
			});
		}
	}
	return discovered.sort((a, b) => a.name.localeCompare(b.name) || a.weight.localeCompare(b.weight) || a.file.localeCompare(b.file));
}
const FONT_FALLBACKS = Object.freeze({
	Liter: [
		"HedvigLettersSans",
		"QuattrocentoSans",
		"Arial"
	],
	HedvigLettersSans: [
		"Liter",
		"QuattrocentoSans",
		"Arial"
	],
	MiSans: ["alimamashuheiti", "Noto Sans SC"],
	"Noto Sans SC": ["MiSans", "alimamashuheiti"],
	siyuanSongti: ["xiawuxinzhisong", "LXGW Bright"],
	xiawuxinzhisong: ["siyuanSongti", "LXGW Bright"]
});
const PLATFORM_ROLE_FALLBACKS = Object.freeze({
	darwin: Object.freeze({
		"latin-sans": [
			"Arial",
			"Helvetica Neue",
			"PingFang SC",
			"Liter",
			"Noto Sans SC"
		],
		"latin-serif": [
			"Times New Roman",
			"Songti SC",
			"siyuanSongti"
		],
		"cjk-sans": [
			"PingFang SC",
			"Hiragino Sans GB",
			"Noto Sans SC",
			"MiSans"
		],
		"cjk-serif": [
			"Songti SC",
			"siyuanSongti",
			"LXGW Bright"
		],
		display: [
			"Liter",
			"PingFang SC",
			"Arial",
			"Noto Sans SC"
		],
		code: [
			"Arial",
			"Helvetica Neue",
			"PingFang SC",
			"Noto Sans SC"
		]
	}),
	win32: Object.freeze({
		"latin-sans": [
			"Arial",
			"Segoe UI",
			"Microsoft YaHei",
			"Liter",
			"Noto Sans SC"
		],
		"latin-serif": [
			"Times New Roman",
			"SimSun",
			"siyuanSongti"
		],
		"cjk-sans": [
			"Microsoft YaHei",
			"DengXian",
			"Noto Sans SC",
			"MiSans"
		],
		"cjk-serif": [
			"SimSun",
			"siyuanSongti",
			"LXGW Bright"
		],
		display: [
			"Liter",
			"Microsoft YaHei",
			"Arial",
			"Noto Sans SC"
		],
		code: [
			"Arial",
			"Segoe UI",
			"Microsoft YaHei",
			"Noto Sans SC"
		]
	}),
	linux: Object.freeze({
		"latin-sans": [
			"Liberation Sans",
			"DejaVu Sans",
			"Arial",
			"Liter",
			"Noto Sans SC"
		],
		"latin-serif": [
			"Liberation Serif",
			"DejaVu Serif",
			"Times New Roman",
			"Noto Serif CJK SC"
		],
		"cjk-sans": [
			"Noto Sans CJK SC",
			"Noto Sans SC",
			"MiSans"
		],
		"cjk-serif": [
			"Noto Serif CJK SC",
			"siyuanSongti",
			"LXGW Bright"
		],
		display: [
			"Liberation Sans",
			"DejaVu Sans",
			"Noto Sans CJK SC",
			"Noto Sans SC"
		],
		code: [
			"DejaVu Sans",
			"Liberation Sans",
			"Noto Sans CJK SC"
		]
	})
});
function supportedPlatform(platform) {
	return platform === "win32" || platform === "linux" ? platform : "darwin";
}
function containsCjk(text) {
	return /[\u3400-\u9FFF\uF900-\uFAFF]/u.test(text);
}
function semanticRole(font, text) {
	const serif = font.roles.includes("latin-serif") || font.roles.includes("cjk-serif");
	if (containsCjk(text)) return serif ? "cjk-serif" : "cjk-sans";
	if (font.roles.includes("code")) return "code";
	if (font.roles.includes("display") && !font.roles.includes("latin-sans") && !font.roles.includes("latin-serif")) return "display";
	return serif ? "latin-serif" : "latin-sans";
}
function registeredFont(name) {
	return REGISTERED_BY_KEY.get(fontKey(name));
}
function fontFallbackCandidates(name, text, platform = process.platform) {
	const requested = registeredFont(name);
	if (requested === void 0) throw new PptError("PPT_OUTLINE_INVALID", `font is not registered: ${name}`);
	const role = semanticRole(requested, text);
	return [.../* @__PURE__ */ new Set([
		requested.name,
		...FONT_FALLBACKS[requested.name] ?? [],
		...PLATFORM_ROLE_FALLBACKS[supportedPlatform(platform)][role]
	])];
}
function supportsText(font, text) {
	for (const character of text) {
		const point = character.codePointAt(0);
		if (!/\s/u.test(character) && !font.codePoints.has(point)) return false;
	}
	return true;
}
function resolveRegisteredFont(name, text, discovered, platform = process.platform) {
	const requested = registeredFont(name);
	if (requested === void 0) throw new PptError("PPT_OUTLINE_INVALID", `font is not registered: ${name}`);
	const candidates = fontFallbackCandidates(requested.name, text, platform);
	for (const candidate of candidates) {
		const font = discovered.find((item) => item.name === candidate && supportsText(item, text));
		if (font !== void 0) return {
			requested: name,
			resolved: font,
			fallback: candidate !== requested.name,
			...candidate === requested.name ? {} : { warning: `font ${requested.name} was replaced with installed ${supportedPlatform(platform)} fallback ${candidate}` }
		};
	}
	throw new PptError("PPT_DEPENDENCY_MISSING", `no installed approved font covers the requested text for ${requested.name}`, { details: {
		requested: requested.name,
		platform: supportedPlatform(platform),
		candidates
	} });
}
function summarizeFontAvailability(discovered, platform = process.platform) {
	const currentPlatform = supportedPlatform(platform);
	const availableNames = new Set(discovered.map((font) => font.name));
	const layers = Object.fromEntries(FONT_LAYERS.map((layer) => {
		const registered = FONT_REGISTRY.filter((font) => font.layer === layer);
		const families = registered.filter((font) => availableNames.has(font.name)).map((font) => font.name).sort();
		return [layer, {
			registered: registered.length,
			available: families.length,
			families
		}];
	}));
	const roles = Object.fromEntries(FONT_ROLES.map((role) => {
		const families = [.../* @__PURE__ */ new Set([...PLATFORM_ROLE_FALLBACKS[currentPlatform][role], ...FONT_REGISTRY.filter((font) => font.roles.includes(role)).map((font) => font.name)])].filter((name) => availableNames.has(name)).sort();
		return [role, {
			available: families.length > 0,
			families
		}];
	}));
	return {
		scope: "approved_registry",
		platform: currentPlatform,
		registryFamilies: FONT_REGISTRY.length,
		availableFamilies: availableNames.size,
		availableFaces: discovered.length,
		layers,
		roles
	};
}
function fontRecommendations(discovered, platform = process.platform, text) {
	const currentPlatform = supportedPlatform(platform);
	const available = new Set(discovered.map((font) => font.name));
	return Object.fromEntries(FONT_ROLES.map((role) => {
		return [role, [.../* @__PURE__ */ new Set([...PLATFORM_ROLE_FALLBACKS[currentPlatform][role], ...FONT_REGISTRY.filter((font) => font.roles.includes(role)).map((font) => font.name)])].filter((name) => available.has(name) && (text === void 0 || discovered.some((font) => font.name === name && supportsText(font, text))))];
	}));
}
function buildFontCatalog(discovered, options = {}) {
	const platform = supportedPlatform(options.platform ?? process.platform);
	const role = options.role ?? "all";
	const layer = options.layer ?? "all";
	const includeUnavailable = options.includeUnavailable ?? false;
	const text = options.text;
	const availability = summarizeFontAvailability(discovered, platform);
	const recommendations = fontRecommendations(discovered, platform, text);
	const entries = FONT_REGISTRY.map((descriptor) => {
		const faces = discovered.filter((font) => font.name === descriptor.name);
		const installed = faces.length > 0;
		const coversText = text === void 0 ? void 0 : faces.some((font) => supportsText(font, text));
		const recommendedFor = FONT_ROLES.filter((candidate) => recommendations[candidate].includes(descriptor.name));
		return {
			name: descriptor.name,
			layer: descriptor.layer,
			platforms: [...descriptor.platforms],
			roles: [...descriptor.roles],
			recommended_for: recommendedFor,
			language: descriptor.language,
			style: descriptor.style,
			characteristics: descriptor.characteristics,
			installed,
			weights: [...new Set(faces.map((font) => font.weight))].sort(),
			supports_latin: faces.some((font) => font.supportsLatin),
			supports_cjk: faces.some((font) => font.supportsCjk),
			...coversText === void 0 ? {} : { covers_text: coversText }
		};
	}).filter((font) => {
		if (!includeUnavailable && !font.installed) return false;
		if (!includeUnavailable && text !== void 0 && font.covers_text !== true) return false;
		if (layer !== "all" && font.layer !== layer) return false;
		if (role !== "all" && !font.roles.includes(role) && !font.recommended_for.includes(role)) return false;
		return true;
	});
	const warnings = [];
	if (entries.length === 0) warnings.push("No approved font matches the requested filters on this host.");
	if (role !== "all" && recommendations[role].length === 0) warnings.push(`No installed approved ${role} font covers the requested text.`);
	return {
		scope: "approved_registry",
		scope_note: "This is the installed subset of the plugin approved registry, not the host-wide font inventory.",
		platform,
		registry_families: availability.registryFamilies,
		available_families: availability.availableFamilies,
		available_faces: availability.availableFaces,
		returned_families: entries.length,
		filters: {
			role,
			layer,
			include_unavailable: includeUnavailable,
			...text === void 0 ? {} : { text }
		},
		recommendations,
		fonts: entries,
		warnings
	};
}
//#endregion
//#region src/security.ts
const BEARER = /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi;
const QUERY_SECRET = /([?&](?:api[_-]?key|access[_-]?token|token|key|secret|password)=)[^&#\s]+/gi;
function redactText(value) {
	return value.replace(BEARER, "Bearer [REDACTED]").replace(QUERY_SECRET, "$1[REDACTED]");
}
function safeErrorMessage(error, maxChars = 2e3) {
	const redacted = redactText(error instanceof Error ? error.message : String(error));
	return redacted.length <= maxChars ? redacted : `${redacted.slice(0, maxChars)}…`;
}
//#endregion
//#region src/subprocess.ts
async function runCollected(subprocess, argv, options) {
	throwIfAborted(options.signal);
	const timeout = new AbortController();
	const timer = setTimeout(() => timeout.abort(new PptError("PPT_RESOURCE_LIMIT", `process timed out after ${options.timeoutMs}ms`)), options.timeoutMs);
	const combined = options.signal === void 0 ? timeout.signal : AbortSignal.any([options.signal, timeout.signal]);
	try {
		const handle = subprocess.spawn({
			argv,
			cwd: options.cwd,
			stdio: {
				stdin: options.stdin === void 0 ? "ignore" : { data: options.stdin },
				stdout: { maxBytes: options.maxOutputBytes },
				stderr: { maxBytes: options.maxOutputBytes }
			},
			graceMs: options.graceMs ?? 2e3,
			signal: combined,
			...options.env === void 0 ? {} : { env: options.env }
		});
		let outcome;
		try {
			outcome = await handle.done;
		} catch (error) {
			if (timeout.signal.aborted) throw timeout.signal.reason;
			if (options.signal?.aborted) throwIfAborted(options.signal);
			throw error;
		}
		if (timeout.signal.aborted) throw timeout.signal.reason;
		if (options.signal?.aborted) throwIfAborted(options.signal);
		const stdout = handle.collected.stdout?.readFrom(0);
		const stderr = handle.collected.stderr?.readFrom(0);
		return {
			exitCode: outcome.exitCode,
			signal: outcome.signal,
			stdout: stdout?.text ?? "",
			stderr: stderr?.text ?? "",
			stdoutTruncated: stdout?.lossy ?? false,
			stderrTruncated: stderr?.lossy ?? false
		};
	} finally {
		clearTimeout(timer);
	}
}
//#endregion
//#region src/limits.ts
const DEFAULT_LIMITS = Object.freeze({
	maxSlides: 60,
	maxElementsPerSlide: 200,
	maxRedirects: 5,
	maxResponseBytes: 16777216,
	maxImageBytes: 20971520,
	maxImagePixels: 4e7,
	maxPythonMs: 12e4,
	maxPythonOutputChars: 2e4,
	maxBrowserTextChars: 2e4,
	maxGeneratedFiles: 100,
	maxGeneratedFileBytes: 52428800,
	maxToolResultChars: 3e4,
	maxImageSearchResults: 20
});
function boundedInteger(value, name, min, max) {
	if (!Number.isInteger(value) || value < min || value > max) throw new PptError("PPT_RESOURCE_LIMIT", `${name} must be an integer between ${min} and ${max}`);
	return value;
}
//#endregion
//#region src/paths.ts
function isPathInside(root, target) {
	const rel = relative(resolve(root), resolve(target));
	return rel === "" || !rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel);
}
function workspaceRelative(root, target) {
	if (!isPathInside(root, target)) throw new PptError("PPT_PATH_OUTSIDE_WORKSPACE", `path is outside workspace: ${target}`);
	return relative(resolve(root), resolve(target)).split(sep).join("/") || ".";
}
async function nearestExistingParent(path) {
	let cursor = resolve(path);
	for (;;) try {
		return await realpath(cursor);
	} catch {
		const parent = dirname(cursor);
		if (parent === cursor) throw new PptError("PPT_PATH_INVALID", `cannot resolve path parent: ${path}`);
		cursor = parent;
	}
}
async function resolveWorkspacePath(workspaceRoot, input, options = {}) {
	if (typeof input !== "string" || input.trim().length === 0 || input.includes("\0")) throw new PptError("PPT_PATH_INVALID", "path must be a non-empty string without NUL bytes");
	const root = await realpath(resolve(workspaceRoot));
	const candidate = resolve(root, input);
	if (!isPathInside(root, candidate)) throw new PptError("PPT_PATH_OUTSIDE_WORKSPACE", `path is outside workspace: ${input}`);
	if (!isPathInside(root, await nearestExistingParent(candidate))) throw new PptError("PPT_PATH_OUTSIDE_WORKSPACE", `path resolves outside workspace through a symlink: ${input}`);
	if (options.createParent) await mkdir(dirname(candidate), { recursive: true });
	if (options.mustExist) {
		let stat;
		try {
			stat = await lstat(candidate);
		} catch (error) {
			throw new PptError("PPT_PATH_INVALID", `path does not exist: ${input}`, { cause: error });
		}
		const kind = options.kind ?? "either";
		if (kind === "file" && !stat.isFile()) throw new PptError("PPT_PATH_INVALID", `path is not a regular file: ${input}`);
		if (kind === "directory" && !stat.isDirectory()) throw new PptError("PPT_PATH_INVALID", `path is not a directory: ${input}`);
		const resolvedExisting = await realpath(candidate);
		if (!isPathInside(root, resolvedExisting)) throw new PptError("PPT_PATH_OUTSIDE_WORKSPACE", `path resolves outside workspace: ${input}`);
		return resolvedExisting;
	}
	return candidate;
}
//#endregion
//#region src/artifacts.ts
function slugify(value) {
	return value.normalize("NFKC").toLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "presentation";
}
async function allocateArtifactDirectory(workspace, title, outputRoot = "ppt-output") {
	const resolvedOutputRoot = await resolveWorkspacePath(workspace, outputRoot, { createParent: true });
	await mkdir(resolvedOutputRoot, { recursive: true });
	const base = slugify(title);
	let root;
	for (let suffix = 1; suffix <= 1e4; suffix += 1) {
		const candidate = join(resolvedOutputRoot, suffix === 1 ? base : `${base}-${suffix}`);
		try {
			await mkdir(candidate, { recursive: false });
			root = candidate;
			break;
		} catch (error) {
			if (error.code !== "EEXIST") throw error;
		}
	}
	if (root === void 0) throw new PptError("PPT_OUTPUT_EXISTS", `could not allocate artifact directory for ${base}`);
	const assets = join(root, "assets");
	const images = join(assets, "images");
	const preview = join(root, "preview");
	await Promise.all([mkdir(images, { recursive: true }), mkdir(preview, { recursive: true })]);
	const paths = {
		root,
		outline: join(root, "outline.json"),
		designPlan: join(root, "design-plan.json"),
		html: join(root, "deck.html"),
		pptx: join(root, "deck.pptx"),
		assets,
		images,
		sourceManifest: join(assets, "source-manifest.json"),
		preview,
		report: join(root, "report.json"),
		visualReview: join(root, "visual-review.json")
	};
	await atomicWriteJson(paths.sourceManifest, {
		version: 1,
		assets: []
	});
	return paths;
}
//#endregion
//#region src/art-direction.ts
const ART_COMPOSITIONS = [
	"hero",
	"editorial-split",
	"asymmetric-split",
	"process",
	"layered",
	"data-focus",
	"quote",
	"full-bleed",
	"closing"
];
const ART_DENSITIES = [
	"low",
	"medium",
	"high"
];
const ART_BACKGROUNDS = [
	"base",
	"inverse",
	"accent",
	"image"
];
const ART_TITLE_TREATMENTS = [
	"statement",
	"question",
	"label",
	"number-led"
];
const ART_ANCHOR_KINDS = [
	"none",
	"typography",
	"image",
	"data",
	"code",
	"diagram"
];
const ART_FRAME_POLICIES = [
	"none",
	"single",
	"grouped"
];
const ART_ROLES = [
	"title",
	"subtitle",
	"body",
	"metric",
	"code",
	"diagram",
	"visual-anchor",
	"supporting",
	"frame"
];
const FONT_NAMES$1 = FONT_REGISTRY.map((item) => item.name);
const text = (max) => z.string().transform((value) => value.normalize("NFC").trim()).pipe(z.string().refine((value) => [...value].length >= 1 && [...value].length <= max, `must contain 1..${max} Unicode code points`).refine((value) => !/[\r\n]/u.test(value) && !/<\/?[a-z][^>]*>/iu.test(value), "must not contain newlines or HTML"));
const color$1 = z.string().regex(/^#[0-9A-Fa-f]{6}$/u).transform((value) => value.toUpperCase());
const fontRole = z.strictObject({
	family: z.enum(FONT_NAMES$1),
	weight: z.number().int().min(100).max(900)
});
const visualAnchor = z.strictObject({
	kind: z.enum(ART_ANCHOR_KINDS),
	role: text(80),
	min_area_ratio: z.number().finite().min(.05).max(.9).optional()
}).superRefine((value, context) => {
	if (value.kind === "none" && value.min_area_ratio !== void 0) context.addIssue({
		code: "custom",
		path: ["min_area_ratio"],
		message: "none anchor cannot define min_area_ratio"
	});
	if (value.kind !== "none" && value.min_area_ratio === void 0) context.addIssue({
		code: "custom",
		path: ["min_area_ratio"],
		message: "visual anchor requires min_area_ratio"
	});
});
const artSlide = z.strictObject({
	page: z.number().int().min(1).max(60),
	job: text(160),
	takeaway: text(180),
	composition: z.enum(ART_COMPOSITIONS),
	density: z.enum(ART_DENSITIES),
	background_role: z.enum(ART_BACKGROUNDS),
	title_treatment: z.enum(ART_TITLE_TREATMENTS),
	visual_anchor: visualAnchor,
	frame_policy: z.enum(ART_FRAME_POLICIES),
	allow_intentional_repeat: z.boolean().default(false)
});
const ArtDirectionSchema = z.strictObject({
	version: z.literal(1).default(1),
	concept: text(100),
	audience_effect: text(180),
	palette: z.strictObject({
		background: z.array(color$1).min(1).max(4),
		surface: z.array(color$1).min(1).max(4),
		accent: color$1,
		text: z.array(color$1).min(1).max(4)
	}),
	typography: z.strictObject({
		display: fontRole,
		body: fontRole,
		latin: fontRole,
		code: fontRole
	}),
	rhythm: z.strictObject({
		background_sequence: z.array(z.enum(ART_BACKGROUNDS)).min(1).max(60),
		max_grouped_frame_slides: z.number().int().min(0).max(60).default(2),
		max_same_composition_run: z.number().int().min(1).max(6).default(1)
	}),
	slides: z.array(artSlide).min(1).max(60)
}).superRefine((plan, context) => {
	if (plan.rhythm.background_sequence.length !== plan.slides.length) context.addIssue({
		code: "custom",
		path: ["rhythm", "background_sequence"],
		message: "background_sequence must contain one entry per slide"
	});
	plan.slides.forEach((slide, index) => {
		if (slide.page !== index + 1) context.addIssue({
			code: "custom",
			path: [
				"slides",
				index,
				"page"
			],
			message: `page must be ${index + 1}`
		});
		if (plan.rhythm.background_sequence[index] !== slide.background_role) context.addIssue({
			code: "custom",
			path: [
				"slides",
				index,
				"background_role"
			],
			message: "background_role must match rhythm.background_sequence"
		});
	});
});
function validateArtDirection(value, expectedPages) {
	const result = ArtDirectionSchema.safeParse(value);
	if (!result.success) throw new PptError("PPT_ART_DIRECTION_INVALID", "PPT art direction validation failed", { details: { issues: result.error.issues.map((issue) => ({
		path: issue.path.join("."),
		message: issue.message
	})) } });
	if (expectedPages !== void 0 && result.data.slides.length !== expectedPages) throw new PptError("PPT_ART_DIRECTION_INVALID", "PPT art direction page count does not match outline", { details: { issues: [{
		path: "slides",
		message: `expected ${expectedPages} pages, received ${result.data.slides.length}`
	}] } });
	return result.data;
}
function artDirectionFindings(plan) {
	const findings = [];
	const grouped = plan.slides.filter((slide) => slide.frame_policy === "grouped");
	if (grouped.length > plan.rhythm.max_grouped_frame_slides) findings.push({
		code: "ART_GROUPED_FRAMES_OVER_BUDGET",
		severity: "warning",
		message: `${grouped.length} grouped-frame slides exceed the planned maximum of ${plan.rhythm.max_grouped_frame_slides}`,
		page: grouped[plan.rhythm.max_grouped_frame_slides]?.page
	});
	let run = 1;
	for (let index = 1; index < plan.slides.length; index += 1) {
		const current = plan.slides[index];
		const previous = plan.slides[index - 1];
		run = current.composition === previous.composition ? run + 1 : 1;
		if (run > plan.rhythm.max_same_composition_run && !current.allow_intentional_repeat) findings.push({
			code: "ART_COMPOSITION_REPEATED",
			severity: "warning",
			message: `composition ${current.composition} repeats beyond the planned run length`,
			page: current.page
		});
	}
	if (plan.slides.length >= 6 && new Set(plan.slides.map((slide) => slide.composition)).size < 3) findings.push({
		code: "ART_COMPOSITION_VARIETY_LOW",
		severity: "warning",
		message: "decks with six or more slides should use at least three composition families"
	});
	return findings;
}
function artDirectionReviewChecklist(plan) {
	const checklist = [`Confirm the deck expresses the art direction concept “${plan.concept}” and intended audience effect “${plan.audience_effect}”.`, "Compare adjacent slides for deliberate rhythm rather than accidental repetition of silhouette, density, background, or card structure."];
	for (const slide of plan.slides) {
		const anchor = slide.visual_anchor.kind === "none" ? "no visual anchor" : `${slide.visual_anchor.kind} visual anchor`;
		checklist.push(`Page ${slide.page}: verify ${slide.composition}, ${slide.density} density, ${slide.background_role} background, ${anchor}, and ${slide.frame_policy} frame policy deliver “${slide.takeaway}”.`);
	}
	return checklist.slice(0, 30);
}
//#endregion
//#region src/ir.ts
const SLIDE_WIDTH_IN = 13.333333;
const SLIDE_HEIGHT_IN = 7.5;
function roundFixed(value, digits = 6) {
	const factor = 10 ** digits;
	return Math.round((value + Number.EPSILON) * factor) / factor;
}
function pxToInches(value) {
	return roundFixed(value / 96);
}
function pxToPoints(value) {
	return roundFixed(value * .75, 2);
}
//#endregion
//#region src/outline.ts
const SLIDE_TYPES = [
	"cover",
	"agenda",
	"section",
	"content",
	"comparison",
	"timeline",
	"process",
	"data",
	"quote",
	"summary",
	"ending"
];
const SLIDE_LAYOUTS = [
	"cover",
	"center",
	"title-content",
	"split",
	"two-column",
	"three-column",
	"grid",
	"hero-image",
	"image-left",
	"image-right",
	"timeline-horizontal",
	"timeline-vertical",
	"process-horizontal",
	"process-vertical",
	"chart-focus",
	"quote-focus",
	"full-bleed",
	"closing"
];
const FONT_NAMES = FONT_REGISTRY.map((item) => item.name);
const noMarkup = (value) => !/[\r\n]/u.test(value) && !/<\/?[a-z][^>]*>/iu.test(value);
function cleanString(max, multiline = false) {
	return z.string().transform((value) => value.normalize("NFC").trim()).pipe(z.string().refine((value) => [...value].length >= 1 && [...value].length <= max, `must contain 1..${max} Unicode code points`).refine((value) => multiline || noMarkup(value), "must not contain newlines or HTML"));
}
function safeReference(max) {
	return cleanString(max).refine((value) => {
		try {
			const url = new URL(value);
			return (url.protocol === "http:" || url.protocol === "https:") && url.username === "" && url.password === "";
		} catch {
			if (isAbsolute(value) || value.includes("\\")) return false;
			return value.split("/").every((segment) => segment !== ".." && segment !== "." && segment.length > 0);
		}
	}, "must be a public HTTP(S) URL or safe workspace-relative path");
}
const Point = z.strictObject({
	kind: z.literal("point"),
	text: cleanString(180),
	label: cleanString(40).optional(),
	group: cleanString(40).optional(),
	level: z.union([z.literal(1), z.literal(2)]).default(1),
	emphasis: z.boolean().default(false)
});
const Data = z.strictObject({
	kind: z.literal("data"),
	label: cleanString(60),
	value: z.union([z.number().finite(), cleanString(40)]),
	unit: cleanString(20).optional(),
	source: safeReference(500).optional(),
	note: cleanString(120).optional(),
	group: cleanString(40).optional(),
	emphasis: z.boolean().default(false)
});
const Image = z.strictObject({
	kind: z.literal("image"),
	role: z.enum([
		"hero",
		"supporting",
		"background",
		"portrait",
		"logo",
		"diagram"
	]),
	intent: cleanString(160),
	query: cleanString(160).optional(),
	asset: safeReference(240).optional(),
	caption: cleanString(120).optional(),
	group: cleanString(40).optional()
}).superRefine((item, context) => {
	if (item.query === void 0 === (item.asset === void 0)) context.addIssue({
		code: "custom",
		message: "image requires exactly one of query or asset"
	});
	if (item.role === "background" && item.caption !== void 0) context.addIssue({
		code: "custom",
		path: ["caption"],
		message: "background images cannot have captions"
	});
});
const Chart = z.strictObject({
	kind: z.literal("chart"),
	chart_type: z.enum([
		"bar",
		"line",
		"area",
		"pie",
		"donut",
		"scatter",
		"bubble",
		"radar",
		"waterfall",
		"funnel",
		"heatmap",
		"table"
	]),
	subject: cleanString(120),
	data_ref: safeReference(240).optional(),
	takeaway: cleanString(180),
	group: cleanString(40).optional()
});
const Note = z.strictObject({
	kind: z.literal("note"),
	purpose: z.enum(["speaker", "production"]),
	text: cleanString(500, true)
});
const OutlineContentItemSchema = z.discriminatedUnion("kind", [
	Point,
	Data,
	Image,
	Chart,
	Note
]);
const Style = z.strictObject({
	layout: z.enum(SLIDE_LAYOUTS),
	background: z.enum([
		"light",
		"dark",
		"accent",
		"image"
	]),
	accent: z.string().regex(/^#[0-9A-Fa-f]{6}$/u).transform((value) => value.toUpperCase()),
	title_font: z.enum(FONT_NAMES),
	body_font: z.enum(FONT_NAMES),
	visual_direction: cleanString(200)
});
const Slide = z.strictObject({
	page: z.number().int().min(1).max(60),
	type: z.enum(SLIDE_TYPES),
	title: cleanString(80),
	content: z.array(OutlineContentItemSchema).max(12),
	style: Style
}).superRefine((slide, context) => {
	const visible = slide.content.filter((item) => item.kind !== "note");
	const notes = slide.content.filter((item) => item.kind === "note");
	if (visible.length > 8) context.addIssue({
		code: "custom",
		path: ["content"],
		message: "a slide can contain at most 8 visible items"
	});
	if (notes.length > 2) context.addIssue({
		code: "custom",
		path: ["content"],
		message: "a slide can contain at most 2 notes"
	});
	if (![...[
		"cover",
		"section",
		"ending"
	]].includes(slide.type) && visible.length === 0) context.addIssue({
		code: "custom",
		path: ["content"],
		message: `${slide.type} requires at least one visible item`
	});
	const titleLimit = slide.type === "cover" ? 80 : 60;
	if ([...slide.title].length > titleLimit) context.addIssue({
		code: "custom",
		path: ["title"],
		message: `${slide.type} title exceeds ${titleLimit} code points`
	});
	if (!{
		cover: ["cover"],
		center: [
			"cover",
			"section",
			"quote",
			"ending"
		],
		"title-content": [
			"agenda",
			"content",
			"summary"
		],
		split: [
			"content",
			"comparison",
			"data"
		],
		"two-column": [
			"agenda",
			"content",
			"comparison",
			"data",
			"summary"
		],
		"three-column": [
			"agenda",
			"content",
			"summary"
		],
		grid: [
			"agenda",
			"content",
			"data",
			"summary"
		],
		"hero-image": [
			"cover",
			"section",
			"content"
		],
		"image-left": ["content", "quote"],
		"image-right": ["content", "quote"],
		"timeline-horizontal": ["timeline"],
		"timeline-vertical": ["timeline"],
		"process-horizontal": ["process"],
		"process-vertical": ["process"],
		"chart-focus": ["data"],
		"quote-focus": ["quote"],
		"full-bleed": [
			"cover",
			"section",
			"quote",
			"ending"
		],
		closing: ["ending"]
	}[slide.style.layout].includes(slide.type)) context.addIssue({
		code: "custom",
		path: ["style", "layout"],
		message: `${slide.style.layout} is incompatible with ${slide.type}`
	});
	const images = slide.content.filter((item) => item.kind === "image");
	const backgrounds = images.filter((item) => item.role === "background");
	if (slide.style.background === "image" && backgrounds.length !== 1) context.addIssue({
		code: "custom",
		path: ["content"],
		message: "image background requires exactly one background image item"
	});
	if (slide.style.background !== "image" && backgrounds.length > 0) context.addIssue({
		code: "custom",
		path: ["content"],
		message: "background image item requires style.background=image"
	});
	if ([
		"hero-image",
		"image-left",
		"image-right"
	].includes(slide.style.layout) && images.every((item) => item.role === "background")) context.addIssue({
		code: "custom",
		path: ["content"],
		message: `${slide.style.layout} requires a non-background image`
	});
	const charts = slide.content.filter((item) => item.kind === "chart");
	if (slide.style.layout === "chart-focus" && charts.length !== 1) context.addIssue({
		code: "custom",
		path: ["content"],
		message: "chart-focus requires exactly one chart"
	});
	if (slide.type === "data" && slide.style.layout !== "chart-focus" && charts.length > 2) context.addIssue({
		code: "custom",
		path: ["content"],
		message: "data slides allow at most two charts"
	});
	for (const [index, chart] of slide.content.entries()) {
		if (chart.kind !== "chart" || chart.data_ref !== void 0) continue;
		const dataReady = slide.content.some((item) => item.kind === "data");
		const pending = slide.content.some((item) => item.kind === "note" && item.purpose === "production" && /(?:待补.*数据|data.*pending)/iu.test(item.text));
		if (!dataReady && !pending) context.addIssue({
			code: "custom",
			path: [
				"content",
				index,
				"data_ref"
			],
			message: "chart without data_ref requires a data item or explicit pending-data production note"
		});
	}
	if (slide.type === "comparison") {
		if (new Set(visible.flatMap((item) => "group" in item && item.group !== void 0 ? [item.group] : [])).size < 2) context.addIssue({
			code: "custom",
			path: ["content"],
			message: "comparison requires at least two explicit groups"
		});
	}
	if (slide.type === "timeline" || slide.type === "process") {
		const points = slide.content.filter((item) => item.kind === "point").length;
		if (points < 3 || points > 8) context.addIssue({
			code: "custom",
			path: ["content"],
			message: `${slide.type} requires 3..8 point items`
		});
	}
});
const PptOutlineSchema = z.array(Slide).min(1).max(60).superRefine((slides, context) => {
	slides.forEach((slide, index) => {
		if (slide.page !== index + 1) context.addIssue({
			code: "custom",
			path: [index, "page"],
			message: `page must be ${index + 1}`
		});
	});
});
function bodyText(slide) {
	const values = [];
	for (const item of slide.content) if (item.kind === "point") values.push(item.label ?? "", item.text);
	else if (item.kind === "data") values.push(item.label, String(item.value), item.unit ?? "", item.note ?? "");
	else if (item.kind === "image") values.push(item.caption ?? "", item.intent);
	else if (item.kind === "chart") values.push(item.subject, item.takeaway);
	return values.filter(Boolean).join(" ") || slide.title;
}
function resolveFontPlan(outline, designPlan, options) {
	if (options === void 0) return {
		outline,
		...designPlan === void 0 ? {} : { designPlan },
		warnings: []
	};
	const resolvedOutline = structuredClone(outline);
	const resolvedDesign = designPlan === void 0 ? void 0 : structuredClone(designPlan);
	const warnings = /* @__PURE__ */ new Set();
	for (const slide of resolvedOutline) {
		const title = resolveRegisteredFont(slide.style.title_font, slide.title, options.discovered, options.platform);
		const body = resolveRegisteredFont(slide.style.body_font, bodyText(slide), options.discovered, options.platform);
		slide.style.title_font = title.resolved.name;
		slide.style.body_font = body.resolved.name;
		if (title.warning !== void 0) warnings.add(`FONT_FALLBACK (page ${slide.page}, title): ${title.warning}`);
		if (body.warning !== void 0) warnings.add(`FONT_FALLBACK (page ${slide.page}, body): ${body.warning}`);
	}
	if (resolvedDesign !== void 0) {
		const samples = {
			display: resolvedOutline.map((slide) => slide.title).join(" "),
			body: resolvedOutline.map(bodyText).join(" "),
			latin: "AaZz09",
			code: "AaZz09_{}[]();"
		};
		for (const role of Object.keys(samples)) {
			const requested = resolvedDesign.typography[role].family;
			const resolved = resolveRegisteredFont(requested, samples[role], options.discovered, options.platform);
			resolvedDesign.typography[role].family = resolved.resolved.name;
			if (resolved.warning !== void 0) warnings.add(`FONT_FALLBACK (art_direction.${role}): ${resolved.warning}`);
		}
	}
	return {
		outline: resolvedOutline,
		...resolvedDesign === void 0 ? {} : { designPlan: resolvedDesign },
		warnings: [...warnings]
	};
}
function validatePptOutline(value) {
	const result = PptOutlineSchema.safeParse(value);
	if (result.success) return result.data;
	throw new PptError("PPT_OUTLINE_INVALID", "PPT outline validation failed", { details: { issues: result.error.issues.map((issue) => ({
		path: issue.path.join("."),
		message: issue.message
	})) } });
}
async function writePptOutline(workspace, artifactTitle, value, outputRoot = "ppt-output", signal, artDirection, fontResolution) {
	const validatedOutline = validatePptOutline(value);
	const resolved = resolveFontPlan(validatedOutline, artDirection === void 0 ? void 0 : validateArtDirection(artDirection, validatedOutline.length), fontResolution);
	const outline = resolved.outline;
	const designPlan = resolved.designPlan;
	const paths = await allocateArtifactDirectory(workspace, artifactTitle, outputRoot);
	try {
		await atomicWriteJson(paths.outline, outline, { signal });
		if (designPlan !== void 0) await atomicWriteJson(paths.designPlan, designPlan, { signal });
	} catch (error) {
		await Promise.all([rm(paths.outline, { force: true }), rm(paths.designPlan, { force: true })]);
		throw error;
	}
	const typeCounts = {};
	const fonts = /* @__PURE__ */ new Set();
	const blocking = [];
	for (const slide of outline) {
		typeCounts[slide.type] = (typeCounts[slide.type] ?? 0) + 1;
		fonts.add(slide.style.title_font);
		fonts.add(slide.style.body_font);
		if (slide.content.some((item) => item.kind === "chart" && item.data_ref === void 0 && !slide.content.some((other) => other.kind === "data"))) blocking.push(`page ${slide.page}: chart data is explicitly pending`);
	}
	if (designPlan !== void 0) for (const role of Object.values(designPlan.typography)) fonts.add(role.family);
	return {
		artifact_dir: workspaceRelative(workspace, paths.root),
		outline_path: workspaceRelative(workspace, paths.outline),
		...designPlan === void 0 ? {} : { design_plan_path: workspaceRelative(workspace, paths.designPlan) },
		design_status: designPlan === void 0 ? "legacy" : "directed",
		page_count: outline.length,
		type_counts: typeCounts,
		fonts: [...fonts].sort(),
		warnings: [...resolved.warnings, ...designPlan === void 0 ? ["ART_DIRECTION_MISSING: legacy outline created without design-plan.json"] : artDirectionFindings(designPlan).map((finding) => `${finding.code}${finding.page === void 0 ? "" : ` (page ${finding.page})`}: ${finding.message}`)],
		blocking_warnings: blocking
	};
}
//#endregion
//#region src/html.ts
const LEAF_KINDS = /* @__PURE__ */ new Set([
	"text",
	"image",
	"shape",
	"svg",
	"table"
]);
const BLOCKED_ELEMENTS = /* @__PURE__ */ new Set([
	"SCRIPT",
	"IFRAME",
	"OBJECT",
	"EMBED",
	"FORM",
	"INPUT",
	"TEXTAREA",
	"SELECT",
	"VIDEO",
	"AUDIO",
	"CANVAS",
	"FOREIGNOBJECT"
]);
const ALLOWED_CSS_PREFIXES = [
	"width",
	"height",
	"min-",
	"max-",
	"box-sizing",
	"position",
	"top",
	"right",
	"bottom",
	"left",
	"display",
	"flex",
	"grid",
	"gap",
	"row-gap",
	"column-gap",
	"align-",
	"justify-",
	"place-",
	"order",
	"margin",
	"padding",
	"font",
	"line-height",
	"letter-spacing",
	"text-",
	"white-space",
	"word-break",
	"overflow",
	"color",
	"background",
	"border",
	"border-radius",
	"opacity",
	"z-index",
	"object-fit",
	"object-position",
	"list-style",
	"vertical-align"
];
const BLOCKED_CSS = /(?:^|[;{])\s*(?:transform|filter|animation|transition|clip-path|mask|mix-blend-mode|perspective|backdrop-filter|box-shadow)\s*:/imu;
const REMOTE_RESOURCE = /(?:url\s*\(\s*['"]?\s*(?:https?:|data:|javascript:|file:)|@import\b)/iu;
function cssProperties(css) {
	const result = /* @__PURE__ */ new Set();
	for (const match of css.matchAll(/(?:^|[;{])\s*([a-z-]+)\s*:/gimu)) result.add(match[1].toLowerCase());
	return [...result];
}
function localReference(value) {
	if (value.trim().length === 0 || value.includes("\0") || value.includes("\\") || isAbsolute(value)) return false;
	try {
		new URL(value);
		return false;
	} catch {}
	return value.split("/").every((segment) => segment !== ".." && segment !== ".");
}
async function validateDeckHtmlSource(workspace, artifactRoot, html, outlineLength, designPlan, strictDesign = false) {
	if (Buffer.byteLength(html) > 5242880) throw new PptError("PPT_RESOURCE_LIMIT", "HTML source exceeds 5 MiB");
	const dom = new JSDOM(html);
	const document = dom.window.document;
	const issues = [];
	const unsupported = /* @__PURE__ */ new Set();
	const allowedFonts = new Set(FONT_REGISTRY.map((font) => font.name));
	const usedFonts = /* @__PURE__ */ new Set();
	const primaryFonts = /* @__PURE__ */ new Set();
	const designFindings = designPlan === void 0 ? [] : artDirectionFindings(designPlan);
	for (const element of document.querySelectorAll("*")) {
		if (BLOCKED_ELEMENTS.has(element.tagName)) issues.push(`blocked element: ${element.tagName.toLowerCase()}`);
		for (const attribute of [...element.attributes]) {
			if (/^on/iu.test(attribute.name)) issues.push(`event handler attribute is blocked: ${attribute.name}`);
			if ([
				"src",
				"href",
				"xlink:href"
			].includes(attribute.name) && attribute.value.trim().length > 0) {
				if (!localReference(attribute.value)) issues.push(`non-local resource is blocked: ${attribute.value.slice(0, 120)}`);
			}
		}
	}
	const css = [...document.querySelectorAll("style")].map((style) => style.textContent ?? "").join("\n") + "\n" + [...document.querySelectorAll("[style]")].map((element) => element.getAttribute("style") ?? "").join("\n");
	if (REMOTE_RESOURCE.test(css)) issues.push("CSS contains a remote, data, script, or file resource");
	if (BLOCKED_CSS.test(css)) issues.push("CSS contains an unsupported effects or animation property");
	for (const property of cssProperties(css)) if (!ALLOWED_CSS_PREFIXES.some((prefix) => prefix.endsWith("-") ? property.startsWith(prefix) : property === prefix || property.startsWith(`${prefix}-`))) unsupported.add(property);
	if (unsupported.size > 0) issues.push(`unsupported CSS properties: ${[...unsupported].sort().join(", ")}`);
	for (const match of css.matchAll(/font-family\s*:\s*([^;}{]+)/gimu)) {
		const families = match[1].split(",").map((value) => value.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean);
		if (families[0] !== void 0) primaryFonts.add(families[0]);
		for (const family of families) {
			usedFonts.add(family);
			if (!allowedFonts.has(family)) issues.push(`unauthorized font: ${family}`);
		}
	}
	const slides = [...document.querySelectorAll(".ppt-slide[data-page]")];
	if (slides.length !== outlineLength) issues.push(`expected ${outlineLength} .ppt-slide elements, found ${slides.length}`);
	const ids = /* @__PURE__ */ new Set();
	slides.forEach((slide, index) => {
		if (slide.dataset.page !== String(index + 1)) issues.push(`slide ${index + 1} has non-contiguous data-page`);
		const planned = designPlan?.slides[index];
		if (planned !== void 0) {
			if (slide.dataset.artComposition !== planned.composition) issues.push(`page ${index + 1} data-art-composition must be ${planned.composition}`);
			if (slide.dataset.artDensity !== planned.density) issues.push(`page ${index + 1} data-art-density must be ${planned.density}`);
			if (slide.dataset.artBackground !== planned.background_role) issues.push(`page ${index + 1} data-art-background must be ${planned.background_role}`);
			const roleElements = [...slide.querySelectorAll("[data-art-role]")];
			for (const element of roleElements) if (!ART_ROLES.includes(element.dataset.artRole ?? "")) issues.push(`page ${index + 1} has invalid data-art-role: ${element.dataset.artRole ?? ""}`);
			const anchors = roleElements.filter((element) => element.dataset.artRole === "visual-anchor");
			if (planned.visual_anchor.kind === "none" && anchors.length !== 0) issues.push(`page ${index + 1} declares no visual anchor but HTML contains ${anchors.length}`);
			if (planned.visual_anchor.kind !== "none" && anchors.length !== 1) issues.push(`page ${index + 1} requires exactly one visual-anchor, found ${anchors.length}`);
			const frames = roleElements.filter((element) => element.dataset.artRole === "frame").length;
			if (planned.frame_policy === "none" && frames > 0) issues.push(`page ${index + 1} frame_policy=none but HTML contains frames`);
			if (planned.frame_policy === "single" && frames > 1) issues.push(`page ${index + 1} frame_policy=single but HTML contains ${frames} frames`);
			if (planned.frame_policy === "grouped" && frames < 2) designFindings.push({
				code: "ART_GROUPED_FRAMES_NOT_REALIZED",
				severity: "warning",
				message: "grouped frame policy is not visibly realized",
				page: index + 1
			});
		}
		const walker = document.createTreeWalker(slide, dom.window.NodeFilter.SHOW_TEXT);
		for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) if ((node.textContent ?? "").trim().length > 0 && node.parentElement?.closest("[data-ppt-id][data-ppt-kind]") === null) {
			issues.push(`page ${index + 1} contains visible text outside a convertible leaf`);
			break;
		}
		for (const leaf of slide.querySelectorAll("[data-ppt-id], [data-ppt-kind]")) {
			const id = leaf.dataset.pptId;
			const kind = leaf.dataset.pptKind;
			if (id === void 0 || !/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/u.test(id)) issues.push(`page ${index + 1} has invalid or missing data-ppt-id`);
			else if (ids.has(id)) issues.push(`duplicate data-ppt-id: ${id}`);
			else ids.add(id);
			if (kind === void 0 || !LEAF_KINDS.has(kind)) issues.push(`page ${index + 1} has invalid or missing data-ppt-kind`);
			if (leaf.querySelector("[data-ppt-id][data-ppt-kind]") !== null) issues.push(`${id ?? "unknown"} is not a leaf`);
			if (kind === "image" && leaf.tagName !== "IMG") issues.push(`${id ?? "unknown"} kind=image must be an img`);
			if (kind === "svg" && leaf.tagName !== "svg") issues.push(`${id ?? "unknown"} kind=svg must be an svg`);
			if (kind === "table" && leaf.tagName !== "TABLE") issues.push(`${id ?? "unknown"} kind=table must be a table`);
			const z = leaf.dataset.pptZ;
			if (z !== void 0 && (!/^-?\d+$/u.test(z) || Math.abs(Number(z)) > 1e4)) issues.push(`${id ?? "unknown"} has invalid data-ppt-z`);
		}
	});
	if (designPlan !== void 0) {
		const plannedFonts = new Set(Object.values(designPlan.typography).map((role) => role.family));
		for (const family of plannedFonts) if (!usedFonts.has(family)) designFindings.push({
			code: "ART_FONT_ROLE_UNUSED",
			severity: "warning",
			message: `planned font family ${family} is not declared in HTML CSS`
		});
		if (strictDesign) {
			for (const finding of designFindings) if (finding.severity === "warning") issues.push(`${finding.code}${finding.page === void 0 ? "" : ` page ${finding.page}`}: ${finding.message}`);
		}
	}
	const assetReferences = /* @__PURE__ */ new Set();
	for (const element of document.querySelectorAll("img[src], svg image[href], svg image[xlink\\:href]")) assetReferences.add(element.getAttribute("src") ?? element.getAttribute("href") ?? element.getAttribute("xlink:href") ?? "");
	for (const match of css.matchAll(/url\s*\(\s*['"]?([^'")]+)['"]?\s*\)/gimu)) assetReferences.add(match[1].trim());
	for (const ref of assetReferences) {
		if (!localReference(ref)) continue;
		try {
			if (!isPathInside(artifactRoot, await resolveWorkspacePath(workspace, join(artifactRoot, ref), {
				mustExist: true,
				kind: "file"
			}))) issues.push(`asset leaves artifact directory: ${ref}`);
		} catch {
			issues.push(`missing or invalid local asset: ${ref}`);
		}
	}
	dom.window.close();
	if (issues.length > 0) throw new PptError("HTML_CREATE_VALIDATION_FAILED", "HTML static validation failed", { details: { issues } });
	return {
		fonts: [...usedFonts].sort(),
		primaryFonts: [...primaryFonts].sort(),
		unsupported: [...unsupported].sort(),
		designFindings
	};
}
async function createHtmlDeck(browser, owner, workspace, outlinePathInput, html, signal, designPlanPathInput, strictDesign = false, fontDirs) {
	throwIfAborted(signal);
	const outlinePath = await resolveWorkspacePath(workspace, outlinePathInput, {
		mustExist: true,
		kind: "file"
	});
	const artifactRoot = dirname(outlinePath);
	const outline = validatePptOutline(JSON.parse(await readFile(outlinePath, "utf8")));
	let designPlan;
	if (designPlanPathInput !== void 0) {
		const designPlanPath = await resolveWorkspacePath(workspace, designPlanPathInput, {
			mustExist: true,
			kind: "file"
		});
		if (dirname(designPlanPath) !== artifactRoot) throw new PptError("HTML_CREATE_INPUT_INVALID", "design plan must be in the same artifact directory as outline.json");
		designPlan = validateArtDirection(JSON.parse(await readFile(designPlanPath, "utf8")), outline.length);
	}
	if (outline.some((slide) => slide.content.some((item) => item.kind === "chart" && item.data_ref === void 0 && !slide.content.some((other) => other.kind === "data")))) throw new PptError("HTML_CREATE_INPUT_INVALID", "outline still contains a chart with explicitly pending data");
	const output = join(artifactRoot, "deck.html");
	try {
		await access(output);
		throw new PptError("PPT_OUTPUT_EXISTS", `output already exists: ${workspaceRelative(workspace, output)}`);
	} catch (error) {
		if (error instanceof PptError) throw error;
	}
	const validation = await validateDeckHtmlSource(workspace, artifactRoot, html, outline.length, designPlan, strictDesign);
	if (fontDirs !== void 0) {
		const discovered = await discoverRegisteredFonts(fontDirs);
		const available = new Set(discovered.map((font) => font.name));
		const unavailable = validation.primaryFonts.filter((font) => !available.has(font));
		if (unavailable.length > 0) throw new PptError("PPT_DEPENDENCY_MISSING", "HTML declares a primary font that is not installed in the approved registry", { details: {
			unavailable,
			available: [...available].sort(),
			scope: "approved_registry"
		} });
	}
	const temporary = join(artifactRoot, `.deck.${process.pid}.${randomUUID()}.html`);
	const previewDirectory = join(artifactRoot, "preview");
	try {
		await atomicWriteText(temporary, html, { signal });
		const rendered = await browser.renderHtmlPreview(owner, workspace, temporary, previewDirectory, outline.length, FONT_REGISTRY.map((font) => font.name), signal);
		if (designPlan !== void 0) {
			for (const page of rendered.designPages) {
				const planned = designPlan.slides[page.page - 1];
				const typographyRole = (role) => {
					if (role === "title" || role === "subtitle") return "display";
					if (role === "body" || role === "supporting" || role === "frame" || role === "diagram") return "body";
					if (role === "metric") return "latin";
					if (role === "code") return "code";
					if (role === "visual-anchor") {
						if (planned.visual_anchor.kind === "typography") return "display";
						if (planned.visual_anchor.kind === "code") return "code";
						if (planned.visual_anchor.kind === "data") return "latin";
					}
				};
				for (const roleStyle of page.roleStyles) {
					const role = typographyRole(roleStyle.role);
					if (role === void 0) continue;
					const expected = designPlan.typography[role];
					if (roleStyle.fontFamily !== expected.family || roleStyle.fontWeight !== expected.weight) validation.designFindings.push({
						code: "ART_TYPOGRAPHY_ROLE_MISMATCH",
						severity: "warning",
						page: page.page,
						message: `${roleStyle.role} uses ${roleStyle.fontFamily} ${roleStyle.fontWeight}, expected ${expected.family} ${expected.weight}`
					});
				}
				const minimum = planned.visual_anchor.min_area_ratio;
				if (minimum !== void 0 && (page.anchorAreaRatio ?? 0) < minimum) validation.designFindings.push({
					code: "ART_VISUAL_ANCHOR_TOO_SMALL",
					severity: "warning",
					page: page.page,
					message: `visual anchor covers ${((page.anchorAreaRatio ?? 0) * 100).toFixed(1)}% of the slide, below the planned ${(minimum * 100).toFixed(1)}%`
				});
				if (page.page > 1 && !planned.allow_intentional_repeat) {
					const previous = rendered.designPages[page.page - 2];
					const intersection = page.occupancy.filter((value, index) => value === 1 && previous.occupancy[index] === 1).length;
					const union = page.occupancy.filter((value, index) => value === 1 || previous.occupancy[index] === 1).length;
					if (union > 0 && intersection / union > .88) validation.designFindings.push({
						code: "ART_SILHOUETTE_REPEATED",
						severity: "warning",
						page: page.page,
						message: "adjacent slide occupancy silhouettes are highly similar"
					});
				}
			}
			if (strictDesign && validation.designFindings.some((finding) => finding.severity === "warning")) throw new PptError("HTML_CREATE_VALIDATION_FAILED", "HTML design fidelity validation failed in strict mode", { details: { issues: validation.designFindings.map((finding) => ({
				code: finding.code,
				page: finding.page,
				message: finding.message
			})) } });
		}
		await atomicWriteText(output, html, { signal });
		const designValidation = join(artifactRoot, "design-validation.json");
		await atomicWriteJson(designValidation, {
			version: 1,
			mode: designPlan === void 0 ? "legacy" : "directed",
			checks: designPlan === void 0 ? [] : [
				"html-art-attributes",
				"art-roles",
				"visual-anchor-area",
				"frame-policy",
				"occupancy-silhouette",
				"font-declarations",
				"computed-typography-roles"
			],
			pages: rendered.designPages,
			findings: validation.designFindings
		}, { signal });
		return {
			html_path: workspaceRelative(workspace, output),
			page_count: outline.length,
			preview_paths: rendered.previews,
			fonts: [.../* @__PURE__ */ new Set([...validation.fonts, ...rendered.fonts])].sort(),
			external_resources: "none",
			warnings: [
				...designPlan === void 0 ? ["ART_DIRECTION_MISSING: HTML validated in legacy design mode"] : [],
				...validation.designFindings.map((finding) => `${finding.code}${finding.page === void 0 ? "" : ` (page ${finding.page})`}: ${finding.message}`),
				...rendered.warnings
			],
			unsupported_css: validation.unsupported,
			design_status: designPlan === void 0 ? "legacy" : "directed",
			design_findings: validation.designFindings,
			design_validation_path: workspaceRelative(workspace, designValidation)
		};
	} finally {
		await rm(temporary, { force: true });
	}
}
//#endregion
//#region src/pptx.ts
function color(value) {
	if (value === "transparent") return void 0;
	const match = /rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*[,/]\s*(\d+(?:\.\d+)?))?\s*\)/iu.exec(value);
	if (match === null) return void 0;
	const hex = [
		match[1],
		match[2],
		match[3]
	].map((channel) => Math.max(0, Math.min(255, Math.round(Number(channel)))).toString(16).padStart(2, "0")).join("").toUpperCase();
	const alpha = match[4] === void 0 ? 1 : Math.max(0, Math.min(1, Number(match[4])));
	return {
		hex,
		transparency: Math.round((1 - alpha) * 100)
	};
}
function baseOptions(element) {
	return {
		x: pxToInches(element.box.x),
		y: pxToInches(element.box.y),
		w: pxToInches(element.box.w),
		h: pxToInches(element.box.h),
		objectName: element.id
	};
}
function textOptions(style) {
	const foreground = color(style.color);
	const fill = color(style.backgroundColor);
	const line = color(style.borderColor);
	const align = [
		"left",
		"center",
		"right",
		"justify"
	].includes(style.textAlign) ? style.textAlign : "left";
	return {
		fontFace: style.fontFamily,
		fontSize: pxToPoints(style.fontSizePx),
		bold: style.fontWeight >= 600,
		italic: style.fontStyle === "italic",
		color: foreground?.hex ?? "000000",
		margin: 0,
		breakLine: false,
		fit: "none",
		align,
		valign: style.verticalAlign === "bottom" ? "bottom" : style.verticalAlign === "middle" ? "mid" : "top",
		lineSpacing: pxToPoints(style.lineHeightPx),
		...fill === void 0 ? {} : { fill: {
			color: fill.hex,
			transparency: fill.transparency
		} },
		...style.borderStyle === "none" || style.borderWidthPx <= 0 || line === void 0 ? { line: { type: "none" } } : { line: {
			color: line.hex,
			transparency: line.transparency,
			width: pxToPoints(style.borderWidthPx)
		} }
	};
}
function imageSource(pathOrUrl, workspace, artifactRoot) {
	let path;
	try {
		const parsed = new URL(pathOrUrl);
		if (parsed.protocol !== "file:") throw new PptError("PPT_CREATE_ASSET_MISSING", "PPTX images must be local frozen files");
		path = fileURLToPath(parsed);
	} catch (error) {
		if (error instanceof PptError) throw error;
		path = pathOrUrl;
	}
	if (!isPathInside(workspace, path) || !isPathInside(artifactRoot, path)) throw new PptError("PPT_CREATE_ASSET_MISSING", `image is outside the artifact directory: ${path}`);
	return path;
}
function addNativeElement(pptx, slide, element, workspace, artifactRoot) {
	const base = baseOptions(element);
	if (element.kind === "text") {
		const runs = (element.runs ?? []).map((run) => ({
			text: run.text,
			options: {
				fontFace: run.fontFamily,
				fontSize: pxToPoints(run.fontSizePx),
				bold: run.fontWeight >= 600,
				italic: run.fontStyle === "italic",
				color: color(run.color)?.hex ?? "000000",
				...run.textDecoration.includes("underline") ? { underline: { style: "sng" } } : {}
			}
		}));
		slide.addText(runs.length > 0 ? runs : element.text ?? "", {
			...base,
			...textOptions(element.style)
		});
		return;
	}
	if (element.kind === "image") {
		if (element.imagePath === void 0) throw new PptError("PPT_CREATE_ASSET_MISSING", `image path missing for ${element.id}`);
		const path = imageSource(element.imagePath, workspace, artifactRoot);
		const fit = element.style.objectFit === "contain" ? "contain" : "cover";
		slide.addImage({
			path,
			...base,
			sizing: {
				type: fit,
				w: base.w,
				h: base.h
			},
			transparency: Math.round((1 - element.style.opacity) * 100)
		});
		return;
	}
	if (element.kind === "svg") {
		if (element.svg === void 0) throw new PptError("PPT_CREATE_UNSUPPORTED_ELEMENT", `SVG markup missing for ${element.id}`);
		const data = `data:image/svg+xml;base64,${Buffer.from(element.svg).toString("base64")}`;
		slide.addImage({
			data,
			...base,
			sizing: {
				type: "contain",
				w: base.w,
				h: base.h
			}
		});
		return;
	}
	if (element.kind === "table") {
		slide.addTable((element.table ?? []).map((row) => row.map((cell) => ({ text: cell }))), {
			...base,
			border: {
				type: "solid",
				color: color(element.style.borderColor)?.hex ?? "999999",
				pt: pxToPoints(Math.max(1, element.style.borderWidthPx))
			},
			color: color(element.style.color)?.hex ?? "000000",
			fill: color(element.style.backgroundColor)?.hex ?? "FFFFFF",
			fontFace: element.style.fontFamily,
			fontSize: pxToPoints(element.style.fontSizePx),
			margin: 0
		});
		return;
	}
	const fill = color(element.style.backgroundColor);
	const line = color(element.style.borderColor);
	const radius = Number.parseFloat(element.style.borderRadius);
	const shape = element.box.w <= 2 || element.box.h <= 2 ? pptx.ShapeType.line : /%/u.test(element.style.borderRadius) && radius >= 50 ? pptx.ShapeType.ellipse : radius > 0 ? pptx.ShapeType.roundRect : pptx.ShapeType.rect;
	slide.addShape(shape, {
		...base,
		fill: fill === void 0 ? { type: "none" } : {
			color: fill.hex,
			transparency: fill.transparency
		},
		line: element.style.borderStyle === "none" || element.style.borderWidthPx <= 0 || line === void 0 ? { type: "none" } : {
			color: line.hex,
			transparency: line.transparency,
			width: pxToPoints(element.style.borderWidthPx)
		}
	});
}
function relationshipSource(path) {
	if (path === "_rels/.rels") return "";
	const index = path.indexOf("/_rels/");
	if (index < 0 || !path.endsWith(".rels")) return "";
	return `${path.slice(0, index)}/${path.slice(index + 7, -5)}`;
}
function inspectPptxPackage(data, expectedPages) {
	let files;
	try {
		files = unzipSync(data);
	} catch (error) {
		throw new PptError("PPT_CREATE_INVALID_PACKAGE", "PPTX is not a readable ZIP package", { cause: error });
	}
	const names = Object.keys(files).sort();
	for (const required of [
		"[Content_Types].xml",
		"_rels/.rels",
		"ppt/presentation.xml",
		"ppt/_rels/presentation.xml.rels"
	]) if (files[required] === void 0) throw new PptError("PPT_CREATE_INVALID_PACKAGE", `PPTX entry is missing: ${required}`);
	const slideNames = names.filter((name) => /^ppt\/slides\/slide\d+\.xml$/u.test(name)).sort((a, b) => Number(a.match(/\d+/u)[0]) - Number(b.match(/\d+/u)[0]));
	if (slideNames.length !== expectedPages) throw new PptError("PPT_CREATE_INVALID_PACKAGE", `expected ${expectedPages} slides, found ${slideNames.length}`);
	slideNames.forEach((name, index) => {
		if (name !== `ppt/slides/slide${index + 1}.xml`) throw new PptError("PPT_CREATE_INVALID_PACKAGE", `slide sequence is not contiguous at ${name}`);
	});
	const presentation = strFromU8(files["ppt/presentation.xml"]);
	const size = /<p:sldSz\b[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/u.exec(presentation);
	if (size === null) throw new PptError("PPT_CREATE_INVALID_PACKAGE", "presentation slide size is missing");
	const widthEmu = Number(size[1]);
	const heightEmu = Number(size[2]);
	if (widthEmu !== 12192e3 || heightEmu !== 6858e3) throw new PptError("PPT_CREATE_INVALID_PACKAGE", `unexpected slide size: ${widthEmu}x${heightEmu}`);
	const presentationRels = strFromU8(files["ppt/_rels/presentation.xml.rels"]);
	const relationTargets = /* @__PURE__ */ new Map();
	for (const match of presentationRels.matchAll(/<Relationship\b([^>]*)>/giu)) {
		const id = /\bId="([^"]+)"/iu.exec(match[1])?.[1];
		const target = /\bTarget="([^"]+)"/iu.exec(match[1])?.[1];
		if (id !== void 0 && target !== void 0) relationTargets.set(id, posix.normalize(posix.join("ppt", target)));
	}
	const orderedSlideIds = [...presentation.matchAll(/<p:sldId\b[^>]*\br:id="([^"]+)"/giu)].map((match) => match[1]);
	if (orderedSlideIds.length !== expectedPages) throw new PptError("PPT_CREATE_INVALID_PACKAGE", "presentation slide order list does not match page count");
	orderedSlideIds.forEach((id, index) => {
		if (relationTargets.get(id) !== `ppt/slides/slide${index + 1}.xml`) throw new PptError("PPT_CREATE_INVALID_PACKAGE", `presentation slide order is invalid at page ${index + 1}`);
	});
	for (const name of names.filter((entry) => entry.endsWith(".rels"))) {
		const xml = strFromU8(files[name]);
		if (/TargetMode="External"/iu.test(xml)) throw new PptError("PPT_CREATE_INVALID_PACKAGE", `external relationship is forbidden: ${name}`);
		const source = relationshipSource(name);
		const base = source === "" ? "" : posix.dirname(source);
		for (const match of xml.matchAll(/<Relationship\b[^>]*\bTarget="([^"]+)"[^>]*>/giu)) {
			const target = match[1];
			if (/^[a-z]+:/iu.test(target)) throw new PptError("PPT_CREATE_INVALID_PACKAGE", `non-package relationship target: ${target}`);
			const resolved = target.startsWith("/") ? target.slice(1) : posix.normalize(posix.join(base, target));
			if (files[resolved] === void 0) throw new PptError("PPT_CREATE_INVALID_PACKAGE", `relationship target is missing: ${resolved}`);
		}
	}
	for (const name of names.filter((entry) => entry.startsWith("ppt/media/") && !entry.endsWith("/"))) if (files[name].byteLength === 0) throw new PptError("PPT_CREATE_INVALID_PACKAGE", `empty media part: ${name}`);
	return {
		pageCount: slideNames.length,
		widthEmu,
		heightEmu,
		entries: names
	};
}
async function createPptx(browser, owner, workspace, htmlPathInput, outlinePathInput, outputPathInput, fallbackMode = "reject", signal) {
	throwIfAborted(signal, "PPT_CREATE_ABORTED");
	const [htmlPath, outlinePath, outputPath] = await Promise.all([
		resolveWorkspacePath(workspace, htmlPathInput, {
			mustExist: true,
			kind: "file"
		}),
		resolveWorkspacePath(workspace, outlinePathInput, {
			mustExist: true,
			kind: "file"
		}),
		resolveWorkspacePath(workspace, outputPathInput)
	]);
	const artifactRoot = dirname(outlinePath);
	if (dirname(htmlPath) !== artifactRoot || dirname(outputPath) !== artifactRoot) throw new PptError("PPT_CREATE_INPUT_INVALID", "HTML, outline, and PPTX output must share one artifact directory");
	const outline = validatePptOutline(JSON.parse(await readFile(outlinePath, "utf8")));
	try {
		await validateDeckHtmlSource(workspace, artifactRoot, await readFile(htmlPath, "utf8"), outline.length);
	} catch (error) {
		const issues = error instanceof PptError && Array.isArray(error.details?.issues) ? error.details.issues.map(String) : [];
		if (issues.some((issue) => /missing or invalid local asset/iu.test(issue))) throw new PptError("PPT_CREATE_ASSET_MISSING", "HTML references a missing or invalid local asset", {
			cause: error,
			details: { issues }
		});
		throw error;
	}
	let ir;
	try {
		ir = await browser.extractDeckIr(owner, workspace, htmlPath, outline.length, signal);
	} catch (error) {
		if (signal?.aborted) throw new PptError("PPT_CREATE_ABORTED", "PPTX creation was cancelled", { cause: error });
		throw error;
	}
	outline.forEach((slide, index) => {
		ir.slides[index].speakerNotes = slide.content.flatMap((item) => item.kind === "note" && item.purpose === "speaker" ? [item.text] : []);
	});
	const rasterized = [];
	for (const slide of ir.slides) for (const element of slide.elements) {
		if (element.unsupportedReason === void 0) continue;
		if (fallbackMode !== "rasterize-element") throw new PptError("PPT_CREATE_UNSUPPORTED_ELEMENT", `page ${slide.page} element ${element.id}: ${element.unsupportedReason}`);
		const target = join(artifactRoot, "assets", "rasterized", `page-${slide.page}-${element.id}.png`);
		const imagePath = await browser.rasterizeElement(owner, workspace, htmlPath, element.id, target, signal);
		rasterized.push({
			page: slide.page,
			element_id: element.id,
			reason: element.unsupportedReason,
			image_path: imagePath
		});
		element.kind = "image";
		element.imagePath = join(workspace, imagePath);
		delete element.unsupportedReason;
	}
	const pptx = new PptxGenJS();
	pptx.defineLayout({
		name: "DSH_PPT_16_9",
		width: SLIDE_WIDTH_IN,
		height: SLIDE_HEIGHT_IN
	});
	pptx.layout = "DSH_PPT_16_9";
	pptx.author = "DSH PPT";
	pptx.company = "DSH";
	pptx.subject = "Editable PPTX generated from constrained HTML";
	pptx.title = outline[0]?.title ?? "Presentation";
	let nativeElementCount = 0;
	for (const slideIr of ir.slides) {
		const slide = pptx.addSlide();
		for (const element of slideIr.elements) {
			addNativeElement(pptx, slide, element, workspace, artifactRoot);
			if (!rasterized.some((item) => item.page === slideIr.page && item.element_id === element.id)) nativeElementCount += 1;
		}
		if (slideIr.speakerNotes.length > 0) slide.addNotes(slideIr.speakerNotes.join("\n\n"));
	}
	const temporary = join(artifactRoot, `.deck.${process.pid}.${Date.now()}.pptx`);
	try {
		await pptx.writeFile({
			fileName: temporary,
			compression: true
		});
		throwIfAborted(signal, "PPT_CREATE_ABORTED");
		const bytes = new Uint8Array(await readFile(temporary));
		inspectPptxPackage(bytes, outline.length);
		await atomicWriteFile(outputPath, bytes, { signal });
		return {
			pptx_path: workspaceRelative(workspace, outputPath),
			page_count: outline.length,
			native_element_count: nativeElementCount,
			rasterized_elements: rasterized,
			structural_status: "passed"
		};
	} catch (error) {
		if (signal?.aborted) throw new PptError("PPT_CREATE_ABORTED", "PPTX creation was cancelled", { cause: error });
		throw error;
	} finally {
		await rm(temporary, { force: true });
	}
}
//#endregion
//#region src/ppt-image.ts
const KEYNOTE_SCRIPT = `on run argv
  set inputPath to item 1 of argv
  set outputPath to item 2 of argv
  set inputFile to POSIX file inputPath as alias
  set outputFile to POSIX file outputPath
  tell application "Keynote"
    set sourceDocument to open inputFile
    export sourceDocument to outputFile as slide images with properties {image format:PNG}
    close sourceDocument saving no
  end tell
end run
`;
const POWERPOINT_SCRIPT = `param(
  [Parameter(Mandatory=$true)][string]$InputPptx,
  [Parameter(Mandatory=$true)][string]$OutputDir
)
$ErrorActionPreference = "Stop"
$application = $null
$presentation = $null
try {
  $application = New-Object -ComObject PowerPoint.Application
  $presentation = $application.Presentations.Open($InputPptx, $true, $true, $false)
  $presentation.Export($OutputDir, "PNG", 1280, 720)
  Write-Output ("PowerPoint " + $application.Version)
} finally {
  if ($presentation -ne $null) { $presentation.Close() }
  if ($application -ne $null) { $application.Quit() }
  if ($presentation -ne $null) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($presentation) }
  if ($application -ne $null) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($application) }
}
`;
const POWERPOINT_MAC_SCREEN_SCRIPT = `on run argv
  set inputPath to item 1 of argv
  set outputDirectory to item 2 of argv
  set pageCount to (item 3 of argv) as integer
  set captureBinary to item 4 of argv
  set screenIndex to (item 5 of argv) as integer
  set inputFile to POSIX file inputPath as alias
  set sourcePresentation to missing value
  set showView to missing value
  tell application "Microsoft PowerPoint"
    try
      activate
      open inputFile
      set sourcePresentation to active presentation
      set settings to slide show settings of sourcePresentation
      try
        set advance mode of settings to slide show advance manual advance
      end try
      try
        set range type of settings to slide show range show all
      end try
      try
        set loop until stopped of settings to false
      end try
      try
        set show with presenter of settings to false
      end try
      set showWindow to run slide show settings
      set showView to slideshow view of showWindow
      delay 1
      repeat with pageNumber from 1 to pageCount
        if pageNumber > 1 then
          go to next slide showView
          delay 1
        end if
        set targetPath to outputDirectory & "/page-" & my zeroPad(pageNumber) & ".png"
        do shell script quoted form of captureBinary & " -x -D " & screenIndex & " " & quoted form of targetPath
      end repeat
      exit slide show showView
      close sourcePresentation saving no
    on error errorMessage number errorNumber
      try
        if showView is not missing value then exit slide show showView
      end try
      try
        if sourcePresentation is not missing value then close sourcePresentation saving no
      end try
      error errorMessage number errorNumber
    end try
  end tell
end run

on zeroPad(pageNumber)
  if pageNumber < 10 then return "00" & pageNumber
  if pageNumber < 100 then return "0" & pageNumber
  return pageNumber as text
end zeroPad
`;
function xmlEscape(value) {
	return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;").replaceAll("'", "&apos;");
}
function fontconfigDocument(fontDirs, cacheDir) {
	return `<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n<fontconfig>\n${[...new Set(fontDirs.map((path) => path.replaceAll("\\", "/")))].map((path) => `  <dir>${xmlEscape(path)}</dir>`).join("\n")}\n  <cachedir>${xmlEscape(cacheDir.replaceAll("\\", "/"))}</cachedir>\n  <config><rescan><int>30</int></rescan></config>\n</fontconfig>\n`;
}
function pptxPageCount(data) {
	let files;
	try {
		files = unzipSync(data);
	} catch (error) {
		throw new PptError("PPT_CREATE_INVALID_PACKAGE", "PPTX is not a readable ZIP package", { cause: error });
	}
	const pages = Object.keys(files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/u.test(name)).length;
	boundedInteger(pages, "PPTX page count", 1, DEFAULT_LIMITS.maxSlides);
	inspectPptxPackage(data, pages);
	return pages;
}
async function firstExecutable(subprocess, candidates, signal) {
	for (const candidate of candidates) try {
		return await subprocess.resolveExecutable(candidate, void 0, signal);
	} catch {}
}
async function firstExisting(candidates) {
	for (const candidate of candidates) try {
		await access(candidate);
		return candidate;
	} catch {}
}
async function fingerprint(path, fallback) {
	if (path === void 0) return fallback;
	try {
		const info = await stat(path);
		return `${basename(path)}:${Math.round(info.mtimeMs)}:${info.size}`;
	} catch {
		return fallback;
	}
}
async function filesRecursively(root) {
	const output = [];
	for (const item of await readdir(root, { withFileTypes: true })) {
		const path = join(root, item.name);
		if (item.isDirectory()) output.push(...await filesRecursively(path));
		else if (item.isFile()) output.push(path);
	}
	return output;
}
function naturalPageNumber(path) {
	const numbers = basename(path).match(/\d+/gu);
	return numbers === null ? Number.MAX_SAFE_INTEGER : Number(numbers.at(-1));
}
function processFailure(name, exitCode, stdout, stderr) {
	const diagnostic = safeErrorMessage(stderr.trim() || stdout.trim(), 1e3);
	return `${name} exited with ${exitCode ?? "no exit code"}${diagnostic.length === 0 ? "" : `: ${diagnostic}`}`;
}
async function createContactSheets(workspace, previews, targetDir, signal) {
	const results = [];
	await mkdir(targetDir, { recursive: true });
	for (let start = 0; start < previews.length; start += 4) {
		throwIfAborted(signal);
		const paths = previews.slice(start, start + 4);
		const composites = await Promise.all(paths.map(async (path, index) => ({
			input: await sharp(join(workspace, path)).resize(620, 349, {
				fit: "contain",
				background: "#FFFFFF"
			}).png().toBuffer(),
			left: index % 2 * 640 + 10,
			top: Math.floor(index / 2) * 360 + 5
		})));
		const target = join(targetDir, `contact-sheet-${String(start / 4 + 1).padStart(3, "0")}.png`);
		await atomicWriteFile(target, await sharp({ create: {
			width: 1280,
			height: 720,
			channels: 4,
			background: "#E5E7EB"
		} }).composite(composites).png().toBuffer(), {
			overwrite: true,
			signal
		});
		results.push(workspaceRelative(workspace, target));
	}
	return results;
}
var PptImageRuntime = class {
	subprocess;
	sandbox;
	resources;
	executables;
	fontDirs;
	platform;
	constructor(subprocess, sandbox, resources, executables = {}, fontDirs = [], platform = process.platform) {
		this.subprocess = subprocess;
		this.sandbox = sandbox;
		this.resources = resources;
		this.executables = executables;
		this.fontDirs = fontDirs;
		this.platform = platform;
	}
	async render(owner, workspace, pptxPathInput, options = {}, signal) {
		throwIfAborted(signal);
		const pptxPath = await resolveWorkspacePath(workspace, pptxPathInput, {
			mustExist: true,
			kind: "file"
		});
		if (!pptxPath.toLowerCase().endsWith(".pptx")) throw new PptError("PPT_PATH_INVALID", "ppt_image requires a .pptx file");
		const bytes = new Uint8Array(await readFile(pptxPath));
		const pageCount = pptxPageCount(bytes);
		const hash = createHash("sha256").update(bytes).digest("hex");
		const artifactRoot = dirname(pptxPath);
		const outputDirectory = await resolveWorkspacePath(workspace, options.outputDirectory ?? join(workspaceRelative(workspace, artifactRoot), "preview", "pptx"));
		if (dirname(dirname(outputDirectory)) !== artifactRoot && dirname(outputDirectory) !== artifactRoot) throw new PptError("PPT_PATH_INVALID", "ppt_image output directory must remain inside the PPTX artifact directory");
		await mkdir(outputDirectory, { recursive: true });
		const manifestPath = join(outputDirectory, "render-manifest.json");
		const attempts = [];
		if (this.subprocess === void 0 || this.sandbox === void 0) return {
			status: "not_available",
			page_count: pageCount,
			image_paths: [],
			contact_sheet_paths: [],
			cached: false,
			attempts: [{
				backend: "libreoffice",
				status: "not_available",
				message: "DSH subprocess or sandbox service is unavailable"
			}],
			warnings: []
		};
		const requested = options.backend ?? "auto";
		for (const backend of pptImageBackendOrder(this.platform, requested)) {
			throwIfAborted(signal);
			const available = await this.discover(backend, signal);
			if (available === void 0) {
				attempts.push({
					backend,
					status: "not_available",
					message: `${backend} rendering dependencies were not found`
				});
				continue;
			}
			if (options.force !== true) {
				const cached = await this.cachedResult(workspace, manifestPath, hash, available, attempts);
				if (cached !== void 0) return cached;
			}
			const temporary = join(artifactRoot, `.ppt-image-${randomUUID()}`);
			const rawDirectory = join(temporary, "raw");
			const normalizedDirectory = join(temporary, "normalized");
			await Promise.all([mkdir(rawDirectory, { recursive: true }), mkdir(normalizedDirectory, { recursive: true })]);
			this.resources.open(owner, workspace);
			const untrack = this.resources.trackTemporaryPath(owner, temporary);
			try {
				await this.renderBackend(available, workspace, pptxPath, temporary, rawDirectory, options.nativeAutomationApproved === true, options.screenIndex, signal);
				const rawImages = (await filesRecursively(rawDirectory)).filter((path) => /\.png$/iu.test(path)).sort((left, right) => naturalPageNumber(left) - naturalPageNumber(right) || left.localeCompare(right));
				if (rawImages.length !== pageCount) throw new PptError("PPT_RENDER_FAILED", `${backend} rendered ${rawImages.length} pages, expected ${pageCount}`);
				const normalized = [];
				for (let index = 0; index < rawImages.length; index += 1) {
					throwIfAborted(signal);
					const source = rawImages[index];
					const metadata = await sharp(source, { limitInputPixels: DEFAULT_LIMITS.maxImagePixels }).metadata();
					if (metadata.width === void 0 || metadata.height === void 0) throw new PptError("PPT_RENDER_FAILED", `${basename(source)} has no decodable dimensions`);
					const ratio = metadata.width / metadata.height;
					const target = join(normalizedDirectory, `page-${String(index + 1).padStart(3, "0")}.png`);
					let pipeline = sharp(source, { limitInputPixels: DEFAULT_LIMITS.maxImagePixels }).flatten({ background: "#FFFFFF" });
					if (available.captureMethod === "screen-capture") {
						const targetRatio = 16 / 9;
						if (ratio > targetRatio) {
							const width = Math.max(1, Math.floor(metadata.height * targetRatio));
							pipeline = pipeline.extract({
								left: Math.floor((metadata.width - width) / 2),
								top: 0,
								width,
								height: metadata.height
							});
						} else {
							const height = Math.max(1, Math.floor(metadata.width / targetRatio));
							pipeline = pipeline.extract({
								left: 0,
								top: Math.floor((metadata.height - height) / 2),
								width: metadata.width,
								height
							});
						}
					} else if (Math.abs(ratio / (16 / 9) - 1) > .03) throw new PptError("PPT_RENDER_FAILED", `${basename(source)} is not a supported 16:9 slide image`);
					await pipeline.resize(1280, 720, { fit: "fill" }).toColourspace("srgb").png().toFile(target);
					normalized.push(target);
				}
				for (const name of await readdir(outputDirectory)) if (/^page-\d+\.png$/u.test(name)) await rm(join(outputDirectory, name), { force: true });
				const imagePaths = [];
				for (let index = 0; index < normalized.length; index += 1) {
					const target = join(outputDirectory, `page-${String(index + 1).padStart(3, "0")}.png`);
					await atomicWriteFile(target, await readFile(normalized[index]), {
						overwrite: true,
						signal
					});
					imagePaths.push(workspaceRelative(workspace, target));
				}
				const contactRoot = dirname(outputDirectory);
				for (const name of await readdir(contactRoot)) if (/^contact-sheet-\d+\.png$/u.test(name)) await rm(join(contactRoot, name), { force: true });
				const contactSheets = await createContactSheets(workspace, imagePaths, contactRoot, signal);
				const warnings = available.captureMethod === "screen-capture" ? ["PowerPoint screen capture is a last-resort renderer; slide animations and multi-display configuration can affect the captured frame."] : [];
				await atomicWriteJson(manifestPath, {
					version: 2,
					pptx_path: workspaceRelative(workspace, pptxPath),
					pptx_sha256: hash,
					backend,
					backend_version: available.version,
					capture_method: available.captureMethod,
					page_count: pageCount,
					image_paths: imagePaths,
					contact_sheet_paths: contactSheets,
					warnings,
					generated_at: (/* @__PURE__ */ new Date()).toISOString()
				}, {
					overwrite: true,
					signal
				});
				attempts.push({
					backend,
					capture_method: available.captureMethod,
					status: "passed",
					message: `${backend} rendered ${pageCount} pages`
				});
				return {
					status: "passed",
					backend,
					backend_version: available.version,
					capture_method: available.captureMethod,
					page_count: pageCount,
					image_paths: imagePaths,
					contact_sheet_paths: contactSheets,
					manifest_path: workspaceRelative(workspace, manifestPath),
					cached: false,
					attempts,
					warnings
				};
			} catch (error) {
				if (signal?.aborted) throwIfAborted(signal);
				attempts.push({
					backend,
					capture_method: available.captureMethod,
					status: "failed",
					message: safeErrorMessage(error)
				});
			} finally {
				untrack();
				await rm(temporary, {
					recursive: true,
					force: true
				});
			}
		}
		return {
			status: attempts.some((attempt) => attempt.status === "failed") ? "failed" : "not_available",
			page_count: pageCount,
			image_paths: [],
			contact_sheet_paths: [],
			cached: false,
			attempts,
			warnings: []
		};
	}
	async discover(backend, signal) {
		if (backend === "keynote") {
			if (this.platform !== "darwin") return void 0;
			const [osascript, keynote] = await Promise.all([firstExecutable(this.subprocess, this.executables.osascript ?? appleScriptCandidates(this.platform), signal), firstExisting(this.executables.keynote ?? keynoteCandidates(this.platform))]);
			if (osascript === void 0 || keynote === void 0) return void 0;
			return {
				backend,
				captureMethod: "native-export",
				version: await fingerprint(keynote, "Keynote"),
				executables: {
					osascript,
					keynote
				}
			};
		}
		if (backend === "powerpoint") {
			if (this.platform === "darwin") {
				const [osascript, powerpoint, screencapture] = await Promise.all([
					firstExecutable(this.subprocess, this.executables.osascript ?? appleScriptCandidates(this.platform), signal),
					firstExisting(this.executables.powerpoint ?? powerPointCandidates(this.platform)),
					firstExecutable(this.subprocess, this.executables.screencapture ?? screenCaptureCandidates(this.platform), signal)
				]);
				if (osascript === void 0 || powerpoint === void 0 || screencapture === void 0) return void 0;
				return {
					backend,
					captureMethod: "screen-capture",
					version: await fingerprint(powerpoint, "PowerPoint-screen-capture"),
					executables: {
						osascript,
						powerpoint,
						screencapture
					}
				};
			}
			if (this.platform !== "win32") return void 0;
			const powershell = await firstExecutable(this.subprocess, this.executables.powershell ?? powerShellCandidates(this.platform), signal);
			if (powershell === void 0) return void 0;
			const powerpoint = await firstExisting(this.executables.powerpoint ?? powerPointCandidates(this.platform));
			return {
				backend,
				captureMethod: "native-export",
				version: await fingerprint(powerpoint, "PowerPoint-COM"),
				executables: {
					powershell,
					...powerpoint === void 0 ? {} : { powerpoint }
				}
			};
		}
		const [soffice, pdftoppm] = await Promise.all([firstExecutable(this.subprocess, this.executables.soffice ?? libreOfficeCandidates(this.platform), signal), firstExecutable(this.subprocess, this.executables.pdftoppm ?? pdfToPpmCandidates(this.platform), signal)]);
		if (soffice === void 0 || pdftoppm === void 0) return void 0;
		return {
			backend,
			captureMethod: "pdf-raster",
			version: await fingerprint(soffice, "LibreOffice"),
			executables: {
				soffice,
				pdftoppm
			}
		};
	}
	async cachedResult(workspace, manifestPath, hash, available, attempts) {
		try {
			const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
			if (manifest.version !== 2 || manifest.pptx_sha256 !== hash || manifest.backend !== available.backend || manifest.backend_version !== available.version || manifest.capture_method !== available.captureMethod) return void 0;
			for (const path of [...manifest.image_paths, ...manifest.contact_sheet_paths]) await resolveWorkspacePath(workspace, path, {
				mustExist: true,
				kind: "file"
			});
			attempts.push({
				backend: available.backend,
				capture_method: available.captureMethod,
				status: "passed",
				message: "reused complete render cache"
			});
			return {
				status: "passed",
				backend: manifest.backend,
				backend_version: manifest.backend_version,
				capture_method: manifest.capture_method,
				page_count: manifest.page_count,
				image_paths: manifest.image_paths,
				contact_sheet_paths: manifest.contact_sheet_paths,
				manifest_path: workspaceRelative(workspace, manifestPath),
				cached: true,
				attempts,
				warnings: manifest.warnings
			};
		} catch {
			return;
		}
	}
	async renderBackend(available, workspace, pptxPath, temporary, rawDirectory, nativeAutomationApproved, screenIndexInput, signal) {
		if (available.backend === "keynote") {
			const script = join(temporary, "render.applescript");
			await atomicWriteText(script, KEYNOTE_SCRIPT, { signal });
			const output = join(rawDirectory, "export");
			const argv = [
				available.executables.osascript,
				script,
				pptxPath,
				output
			];
			const command = nativeAutomationApproved ? argv : this.sandbox.confine(argv, {
				mode: "workspace-write",
				workspaceRoot: workspace
			}).argv;
			const result = await runCollected(this.subprocess, command, {
				cwd: dirname(pptxPath),
				signal,
				timeoutMs: 9e4,
				maxOutputBytes: 32768
			});
			if (result.exitCode !== 0) throw new PptError("PPT_RENDER_FAILED", processFailure("Keynote export", result.exitCode, result.stdout, result.stderr));
			return;
		}
		if (available.backend === "powerpoint") {
			if (this.platform === "darwin") {
				const screenIndex = screenIndexInput ?? 1;
				boundedInteger(screenIndex, "screen_index", 1, 16);
				const script = join(temporary, "render-powerpoint-screen.applescript");
				const sourceCopy = join(temporary, "source.pptx");
				await copyFile(pptxPath, sourceCopy);
				await atomicWriteText(script, POWERPOINT_MAC_SCREEN_SCRIPT, { signal });
				const argv = [
					available.executables.osascript,
					script,
					sourceCopy,
					rawDirectory,
					String(pptxPageCount(new Uint8Array(await readFile(sourceCopy)))),
					available.executables.screencapture,
					String(screenIndex)
				];
				const command = nativeAutomationApproved ? argv : this.sandbox.confine(argv, {
					mode: "workspace-write",
					workspaceRoot: workspace
				}).argv;
				const result = await runCollected(this.subprocess, command, {
					cwd: dirname(pptxPath),
					signal,
					timeoutMs: 18e4,
					maxOutputBytes: 32768
				});
				if (result.exitCode !== 0) throw new PptError("PPT_RENDER_FAILED", processFailure("PowerPoint screen capture", result.exitCode, result.stdout, result.stderr));
				return;
			}
			const script = join(temporary, "render.ps1");
			const output = join(rawDirectory, "export");
			await mkdir(output, { recursive: true });
			await atomicWriteText(script, POWERPOINT_SCRIPT, { signal });
			const argv = [
				available.executables.powershell,
				"-NoProfile",
				"-NonInteractive",
				"-ExecutionPolicy",
				"Bypass",
				"-File",
				script,
				"-InputPptx",
				pptxPath,
				"-OutputDir",
				output
			];
			const command = nativeAutomationApproved ? argv : this.sandbox.confine(argv, {
				mode: "workspace-write",
				workspaceRoot: workspace
			}).argv;
			const result = await runCollected(this.subprocess, command, {
				cwd: dirname(pptxPath),
				signal,
				timeoutMs: 9e4,
				maxOutputBytes: 32768
			});
			if (result.exitCode !== 0) throw new PptError("PPT_RENDER_FAILED", processFailure("PowerPoint export", result.exitCode, result.stdout, result.stderr));
			return;
		}
		const profile = join(temporary, "profile");
		const fontCache = join(temporary, "font-cache");
		const fontconfig = join(temporary, "fonts.conf");
		const pdfDirectory = join(temporary, "pdf");
		await Promise.all([
			mkdir(profile, { recursive: true }),
			mkdir(fontCache, { recursive: true }),
			mkdir(pdfDirectory, { recursive: true })
		]);
		const renderFontDirs = [...systemFontDirectories(this.platform), ...this.fontDirs];
		await atomicWriteText(fontconfig, fontconfigDocument(renderFontDirs, fontCache), { signal });
		const renderEnv = {
			FONTCONFIG_FILE: fontconfig,
			FONTCONFIG_PATH: temporary,
			XDG_CACHE_HOME: fontCache,
			SAL_PRIVATE_FONTPATH: renderFontDirs.join(delimiter)
		};
		const convert = this.sandbox.confine([
			available.executables.soffice,
			"--headless",
			"--nologo",
			"--nodefault",
			"--nolockcheck",
			"--norestore",
			`-env:UserInstallation=${pathToFileURL(profile).href}`,
			"--convert-to",
			"pdf",
			"--outdir",
			pdfDirectory,
			pptxPath
		], {
			mode: "workspace-write",
			workspaceRoot: workspace
		});
		if (convert.enforcement !== "full") throw new PptError("PPT_RENDER_FAILED", "LibreOffice sandbox enforcement is partial");
		const converted = await runCollected(this.subprocess, convert.argv, {
			cwd: dirname(pptxPath),
			signal,
			timeoutMs: 6e4,
			maxOutputBytes: 32768,
			env: renderEnv
		});
		if (converted.exitCode !== 0) throw new PptError("PPT_RENDER_FAILED", processFailure("LibreOffice", converted.exitCode, converted.stdout, converted.stderr));
		const pdf = join(pdfDirectory, `${basename(pptxPath, ".pptx")}.pdf`);
		await access(pdf);
		const raster = this.sandbox.confine([
			available.executables.pdftoppm,
			"-png",
			"-r",
			"96",
			"-scale-to-x",
			"1280",
			"-scale-to-y",
			"720",
			"-cropbox",
			pdf,
			join(rawDirectory, "page")
		], {
			mode: "workspace-write",
			workspaceRoot: workspace
		});
		const rasterized = await runCollected(this.subprocess, raster.argv, {
			cwd: dirname(pptxPath),
			signal,
			timeoutMs: 6e4,
			maxOutputBytes: 32768
		});
		if (rasterized.exitCode !== 0) throw new PptError("PPT_RENDER_FAILED", processFailure("pdftoppm", rasterized.exitCode, rasterized.stdout, rasterized.stderr));
	}
};
//#endregion
//#region src/quality.ts
const visualReviewSchema = z.object({
	version: z.literal(1),
	status: z.enum([
		"not_performed",
		"passed",
		"failed",
		"not_available"
	]),
	checklist: z.array(z.string().min(1).max(500)).max(30),
	reviewed_assets: z.array(z.string().min(1).max(500)).max(200),
	findings: z.array(z.object({
		page: z.number().int().positive().optional(),
		severity: z.enum(["warning", "error"]),
		message: z.string().min(1).max(1e3)
	}).strict()).max(500),
	completed_at: z.iso.datetime({ offset: true }).optional()
}).strict();
function computeOverallStatus(report) {
	const statuses = [
		report.structural_status,
		report.render_status,
		report.automatic_visual_status,
		report.model_visual_status
	];
	if (statuses.includes("failed")) return "failed";
	return statuses.every((status) => status === "passed") ? "verified" : "unverified";
}
function synchronizeStatuses(report) {
	report.structural_status = report.layers.structural.status;
	report.render_status = report.layers.render.status;
	report.automatic_visual_status = report.layers.automatic_visual.status;
	report.model_visual_status = report.layers.model_visual.status;
	report.overall_status = computeOverallStatus(report);
}
function structuralFindings(data, expectedPages) {
	inspectPptxPackage(data, expectedPages);
	const files = unzipSync(data);
	const findings = [];
	for (let page = 1; page <= expectedPages; page += 1) {
		const xml = strFromU8(files[`ppt/slides/slide${page}.xml`]);
		for (const block of xml.matchAll(/<p:sp\b[\s\S]*?<\/p:sp>/gu)) {
			if (!/<p:txBody\b/u.test(block[0]) || !/\btxBox="1"/u.test(block[0])) continue;
			if ([...block[0].matchAll(/<a:t>([\s\S]*?)<\/a:t>/gu)].map((match) => match[1].replace(/<[^>]+>/gu, "")).join("").trim().length === 0) findings.push({
				code: "EMPTY_TEXT_BOX",
				severity: "error",
				message: "slide contains an empty text box",
				page
			});
		}
		const pictures = [...xml.matchAll(/<p:pic\b[\s\S]*?<\/p:pic>/gu)];
		const textCount = [...xml.matchAll(/<a:t>\s*[^<\s][\s\S]*?<\/a:t>/gu)].length;
		if (pictures.length === 1 && textCount === 0 && /<a:off x="0" y="0"\/>[\s\S]*?<a:ext cx="12192000" cy="6858000"\/>/u.test(pictures[0][0])) findings.push({
			code: "FULL_PAGE_RASTER",
			severity: "error",
			message: "slide degraded to a single full-page image",
			page
		});
	}
	const allXml = Object.entries(files).filter(([name]) => name.endsWith(".xml")).map(([, bytes]) => strFromU8(bytes)).join("\n");
	const visibleText = [...allXml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/gu)].map((match) => match[1]).join("\n");
	if (/(?:�|\bTODO\b|\bTBD\b|\bPLACEHOLDER\b|待补(?:充|数据)?)/iu.test(visibleText)) findings.push({
		code: "PLACEHOLDER_TEXT",
		severity: "error",
		message: "placeholder or replacement text remains in the PPTX"
	});
	const sizes = [...allXml.matchAll(/<(?:a:rPr|a:defRPr)\b[^>]*\bsz="(\d+)"/gu)].map((match) => Number(match[1]) / 100);
	if (sizes.some((size) => size > 0 && size < 10)) findings.push({
		code: "SMALL_FONT",
		severity: "warning",
		message: `minimum detected font size is ${Math.min(...sizes).toFixed(1)}pt`
	});
	return findings;
}
async function imageQualityFindings(data, expectedPages, signal) {
	const files = unzipSync(data);
	const findings = [];
	for (let page = 1; page <= expectedPages; page += 1) {
		throwIfAborted(signal);
		const slide = strFromU8(files[`ppt/slides/slide${page}.xml`]);
		const relName = `ppt/slides/_rels/slide${page}.xml.rels`;
		const rels = files[relName] === void 0 ? "" : strFromU8(files[relName]);
		const targets = /* @__PURE__ */ new Map();
		for (const match of rels.matchAll(/<Relationship\b([^>]*)>/giu)) {
			const id = /\bId="([^"]+)"/iu.exec(match[1])?.[1];
			const target = /\bTarget="([^"]+)"/iu.exec(match[1])?.[1];
			if (id !== void 0 && target !== void 0) targets.set(id, posix.normalize(posix.join("ppt/slides", target)));
		}
		for (const match of slide.matchAll(/<p:pic\b[\s\S]*?<\/p:pic>/gu)) {
			const block = match[0];
			const relationId = /<a:blip\b[^>]*\br:embed="([^"]+)"/iu.exec(block)?.[1];
			const extent = /<a:ext\b[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/iu.exec(block);
			const target = relationId === void 0 ? void 0 : targets.get(relationId);
			if (extent === null || target === void 0 || files[target] === void 0 || target.endsWith(".svg")) continue;
			let metadata;
			try {
				metadata = await sharp(files[target]).metadata();
			} catch {
				continue;
			}
			if (metadata.width === void 0 || metadata.height === void 0) continue;
			const displayWidth = Number(extent[1]) / 914400 * 96;
			const displayHeight = Number(extent[2]) / 914400 * 96;
			if (metadata.width + 1 < displayWidth || metadata.height + 1 < displayHeight) findings.push({
				code: "LOW_RES_IMAGE",
				severity: "warning",
				message: `${basename(target)} is ${metadata.width}x${metadata.height} but displayed near ${Math.round(displayWidth)}x${Math.round(displayHeight)}`,
				page
			});
			const sourceRatio = metadata.width / metadata.height;
			const displayRatio = displayWidth / displayHeight;
			if (!/<a:srcRect\b/u.test(block) && Math.abs(sourceRatio / displayRatio - 1) > .15) findings.push({
				code: "STRETCHED_IMAGE",
				severity: "error",
				message: `${basename(target)} aspect ratio does not match its uncropped display box`,
				page
			});
		}
	}
	return findings;
}
async function analyzePage(path, page, signal) {
	throwIfAborted(signal);
	const { data, info } = await sharp(path).removeAlpha().raw().toBuffer({ resolveWithObject: true });
	throwIfAborted(signal);
	if (info.width !== 1280 || info.height !== 720) return {
		metrics: {
			page,
			width: info.width,
			height: info.height
		},
		findings: [{
			code: "RENDER_SIZE",
			severity: "error",
			message: `rendered page is ${info.width}x${info.height}, expected 1280x720`,
			page
		}]
	};
	const channels = info.channels;
	const background = [
		data[0],
		data[1],
		data[2]
	];
	let sum = 0;
	let sumSquares = 0;
	let changed = 0;
	let black = 0;
	let edgeChanged = 0;
	let edgePixels = 0;
	for (let y = 0; y < info.height; y += 1) for (let x = 0; x < info.width; x += 1) {
		const offset = (y * info.width + x) * channels;
		const r = data[offset];
		const g = data[offset + 1];
		const b = data[offset + 2];
		const luminance = (r + g + b) / 3;
		sum += luminance;
		sumSquares += luminance * luminance;
		const differs = Math.abs(r - background[0]) + Math.abs(g - background[1]) + Math.abs(b - background[2]) > 45;
		if (differs) changed += 1;
		if (luminance < 5) black += 1;
		if (x < 4 || y < 4 || x >= info.width - 4 || y >= info.height - 4) {
			edgePixels += 1;
			if (differs) edgeChanged += 1;
		}
	}
	const pixels = info.width * info.height;
	const mean = sum / pixels;
	const stdev = Math.sqrt(Math.max(0, sumSquares / pixels - mean * mean));
	const coverage = changed / pixels;
	const blackRatio = black / pixels;
	const edgeRatio = edgeChanged / edgePixels;
	const findings = [];
	if (coverage < .005 || stdev < 1) findings.push({
		code: "BLANK_PAGE",
		severity: "error",
		message: "rendered page is blank or nearly uniform",
		page
	});
	if (blackRatio > .98) findings.push({
		code: "BLACK_PAGE",
		severity: "error",
		message: "rendered page is almost entirely black",
		page
	});
	if (edgeRatio > .12) findings.push({
		code: "EDGE_CONTENT",
		severity: "warning",
		message: "significant content touches the slide boundary",
		page
	});
	return {
		metrics: {
			page,
			width: info.width,
			height: info.height,
			mean,
			stdev,
			content_coverage: coverage,
			black_ratio: blackRatio,
			edge_ratio: edgeRatio
		},
		findings
	};
}
async function compareImages(htmlPath, pptxPath, page, signal) {
	throwIfAborted(signal);
	const left = await sharp(htmlPath).removeAlpha().raw().toBuffer({ resolveWithObject: true });
	const right = await sharp(pptxPath).removeAlpha().raw().toBuffer({ resolveWithObject: true });
	throwIfAborted(signal);
	if (left.info.width !== right.info.width || left.info.height !== right.info.height || left.info.channels !== right.info.channels) return {
		metrics: { page },
		findings: [{
			code: "PREVIEW_DIMENSION_MISMATCH",
			severity: "error",
			message: "HTML and PPTX preview dimensions differ",
			page
		}]
	};
	let total = 0;
	let gross = 0;
	for (let index = 0; index < left.data.length; index += 1) {
		const delta = Math.abs(left.data[index] - right.data[index]);
		total += delta;
		if (delta > 64) gross += 1;
	}
	const meanAbsoluteDifference = total / left.data.length;
	const grossDifferenceRatio = gross / left.data.length;
	const findings = [];
	if (meanAbsoluteDifference > 45 || grossDifferenceRatio > .35) findings.push({
		code: "LAYOUT_DRIFT",
		severity: "error",
		message: `HTML/PPTX render drift is too large (MAD ${meanAbsoluteDifference.toFixed(1)}, gross ${(grossDifferenceRatio * 100).toFixed(1)}%)`,
		page
	});
	else if (meanAbsoluteDifference > 25 || grossDifferenceRatio > .18) findings.push({
		code: "LAYOUT_DRIFT_WARNING",
		severity: "warning",
		message: "HTML/PPTX render difference is elevated",
		page
	});
	return {
		metrics: {
			page,
			mean_absolute_difference: meanAbsoluteDifference,
			gross_difference_ratio: grossDifferenceRatio
		},
		findings
	};
}
function cjkTextRegions(data, expectedPages) {
	const files = unzipSync(data);
	const regions = [];
	for (let page = 1; page <= expectedPages; page += 1) {
		const xml = strFromU8(files[`ppt/slides/slide${page}.xml`]);
		for (const match of xml.matchAll(/<p:sp\b[\s\S]*?<\/p:sp>/gu)) {
			const block = match[0];
			const text = [...block.matchAll(/<a:t>([\s\S]*?)<\/a:t>/gu)].map((item) => item[1]).join("");
			if (!/[\u3400-\u9FFF\uF900-\uFAFF]/u.test(text)) continue;
			const transform = /<a:xfrm\b[^>]*>[\s\S]*?<a:off\b[^>]*\bx="(\d+)"[^>]*\by="(\d+)"[^>]*\/>[\s\S]*?<a:ext\b[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"[^>]*\/>/u.exec(block);
			if (transform === null) continue;
			regions.push({
				page,
				x: Number(transform[1]) / 9525,
				y: Number(transform[2]) / 9525,
				width: Number(transform[3]) / 9525,
				height: Number(transform[4]) / 9525
			});
		}
	}
	return regions;
}
async function regionEdgeCount(path, region) {
	const left = Math.max(0, Math.min(1279, Math.floor(region.x)));
	const top = Math.max(0, Math.min(719, Math.floor(region.y)));
	const width = Math.max(1, Math.min(1280 - left, Math.ceil(region.width)));
	const height = Math.max(1, Math.min(720 - top, Math.ceil(region.height)));
	const { data, info } = await sharp(path).extract({
		left,
		top,
		width,
		height
	}).removeAlpha().raw().toBuffer({ resolveWithObject: true });
	let edges = 0;
	for (let y = 0; y < height - 1; y += 1) for (let x = 0; x < width - 1; x += 1) {
		const current = (y * width + x) * info.channels;
		const right = current + info.channels;
		const down = current + width * info.channels;
		let delta = 0;
		for (let channel = 0; channel < Math.min(3, info.channels); channel += 1) {
			delta += Math.abs(data[current + channel] - data[right + channel]);
			delta += Math.abs(data[current + channel] - data[down + channel]);
		}
		if (delta > 80) edges += 1;
	}
	return edges;
}
async function cjkRenderFindings(pptx, htmlPreviews, pptxPreviews, expectedPages, signal) {
	const byPage = /* @__PURE__ */ new Map();
	for (const region of cjkTextRegions(pptx, expectedPages)) byPage.set(region.page, [...byPage.get(region.page) ?? [], region]);
	const findings = [];
	for (const [page, regions] of byPage) {
		throwIfAborted(signal);
		let htmlEdges = 0;
		let renderedEdges = 0;
		for (const region of regions) {
			htmlEdges += await regionEdgeCount(htmlPreviews[page - 1], region);
			renderedEdges += await regionEdgeCount(pptxPreviews[page - 1], region);
		}
		if (htmlEdges < 100) continue;
		const ratio = renderedEdges / htmlEdges;
		if (ratio < .45) findings.push({
			code: "CJK_GLYPHS_MISSING",
			severity: "error",
			message: `rendered CJK text edge coverage is only ${(ratio * 100).toFixed(1)}% of the HTML preview`,
			page
		});
		else if (ratio < .65) findings.push({
			code: "CJK_FONT_SUBSTITUTION",
			severity: "warning",
			message: `rendered CJK text edge coverage is reduced to ${(ratio * 100).toFixed(1)}% of the HTML preview`,
			page
		});
	}
	return findings;
}
var QualityRuntime = class {
	pptImage;
	constructor(subprocess, sandbox, resources, executables = {}, fontDirs = [], pptImage) {
		this.pptImage = pptImage ?? new PptImageRuntime(subprocess, sandbox, resources, executables, fontDirs);
	}
	async refresh(owner, workspace, pptxPathInput, modelReviewAvailable, signal, nativeAutomationApproved = false) {
		throwIfAborted(signal);
		const pptxPath = await resolveWorkspacePath(workspace, pptxPathInput, {
			mustExist: true,
			kind: "file"
		});
		const artifactRoot = dirname(pptxPath);
		const reportPath = join(artifactRoot, "report.json");
		const visualReviewPath = join(artifactRoot, "visual-review.json");
		let existing;
		try {
			existing = JSON.parse(await readFile(reportPath, "utf8"));
		} catch (error) {
			if (error.code === "ENOENT") return void 0;
			throw error;
		}
		if (existing.version !== 1 || existing.machine_owned !== true || existing.pptx_path !== workspaceRelative(workspace, pptxPath)) throw new PptError("PPT_QUALITY_FAILED", "existing report.json is not the machine report for this PPTX");
		const expectedPages = pptxPageCount(new Uint8Array(await readFile(pptxPath)));
		const htmlPreviews = Array.from({ length: expectedPages }, (_, index) => workspaceRelative(workspace, join(artifactRoot, "preview", `page-${String(index + 1).padStart(3, "0")}.png`)));
		await Promise.all(htmlPreviews.map((path) => resolveWorkspacePath(workspace, path, {
			mustExist: true,
			kind: "file"
		})));
		return this.evaluate(owner, workspace, workspaceRelative(workspace, pptxPath), htmlPreviews, workspaceRelative(workspace, reportPath), workspaceRelative(workspace, visualReviewPath), expectedPages, modelReviewAvailable, existing.conversion, signal, nativeAutomationApproved);
	}
	async evaluate(owner, workspace, pptxPathInput, htmlPreviewInputs, reportPathInput, visualReviewPathInput, expectedPages, modelReviewAvailable, conversion, signal, nativeAutomationApproved = false) {
		throwIfAborted(signal);
		expectedPages = boundedInteger(expectedPages, "expectedPages", 1, DEFAULT_LIMITS.maxSlides);
		const pptxPath = await resolveWorkspacePath(workspace, pptxPathInput, {
			mustExist: true,
			kind: "file"
		});
		const reportPath = await resolveWorkspacePath(workspace, reportPathInput);
		const visualReviewPath = await resolveWorkspacePath(workspace, visualReviewPathInput);
		const artifactRoot = dirname(pptxPath);
		let designPlan;
		try {
			designPlan = validateArtDirection(JSON.parse(await readFile(join(artifactRoot, "design-plan.json"), "utf8")), expectedPages);
		} catch (error) {
			if (error.code !== "ENOENT") throw error;
		}
		let htmlDesignValidation = {};
		try {
			htmlDesignValidation = JSON.parse(await readFile(join(artifactRoot, "design-validation.json"), "utf8"));
		} catch (error) {
			if (error.code !== "ENOENT") throw error;
		}
		const designFindings = [...designPlan === void 0 ? [] : artDirectionFindings(designPlan), ...htmlDesignValidation.findings ?? []].filter((finding, index, all) => all.findIndex((other) => other.code === finding.code && other.page === finding.page) === index);
		const htmlPreviews = await Promise.all(htmlPreviewInputs.map(async (path) => workspaceRelative(workspace, await resolveWorkspacePath(workspace, path, {
			mustExist: true,
			kind: "file"
		}))));
		const report = {
			version: 1,
			machine_owned: true,
			generated_at: (/* @__PURE__ */ new Date()).toISOString(),
			pptx_path: workspaceRelative(workspace, pptxPath),
			structural_status: "not_performed",
			render_status: "not_performed",
			automatic_visual_status: "not_performed",
			model_visual_status: modelReviewAvailable ? "not_performed" : "not_available",
			overall_status: "unverified",
			layers: {
				structural: {
					status: "not_performed",
					findings: []
				},
				render: {
					status: "not_performed",
					findings: []
				},
				automatic_visual: {
					status: "not_performed",
					findings: [],
					pages: [],
					html_comparison_pages: [],
					design_fidelity: {
						mode: designPlan === void 0 ? "legacy" : "directed",
						checks: designPlan === void 0 ? [] : [
							"art-direction-schema",
							"page-sequence",
							"composition-rhythm",
							"frame-budget",
							"review-checklist",
							...htmlDesignValidation.checks ?? []
						],
						pages: htmlDesignValidation.pages ?? designPlan?.slides.map((slide) => ({
							page: slide.page,
							composition: slide.composition,
							density: slide.density,
							background_role: slide.background_role,
							visual_anchor: slide.visual_anchor.kind,
							frame_policy: slide.frame_policy
						})) ?? [],
						findings: designFindings
					}
				},
				model_visual: {
					status: modelReviewAvailable ? "not_performed" : "not_available",
					findings: []
				}
			},
			artifacts: {
				html_previews: htmlPreviews,
				pptx_previews: [],
				contact_sheets: [],
				high_risk_previews: [],
				visual_review: workspaceRelative(workspace, visualReviewPath)
			},
			...conversion === void 0 ? {} : { conversion }
		};
		try {
			const bytes = new Uint8Array(await readFile(pptxPath));
			report.layers.structural.findings = [...structuralFindings(bytes, expectedPages), ...await imageQualityFindings(bytes, expectedPages, signal)];
			report.layers.structural.status = report.layers.structural.findings.some((item) => item.severity === "error") ? "failed" : "passed";
		} catch (error) {
			report.layers.structural.status = "failed";
			report.layers.structural.findings.push({
				code: "STRUCTURE_INVALID",
				severity: "error",
				message: error instanceof Error ? error.message : String(error)
			});
		}
		const review = {
			version: 1,
			status: modelReviewAvailable ? "not_performed" : "not_available",
			checklist: [
				"Inspect every contact sheet for consistency and blank, black, duplicated, or missing pages.",
				"Inspect cover, agenda, data/chart, comparison, ending, and every machine-flagged page at full resolution.",
				"Check text clipping, overlap, hierarchy, alignment, contrast, image quality, stretched images, and font substitution.",
				"Record reviewed asset paths and page-specific findings; do not edit report.json directly.",
				...designPlan === void 0 ? ["This deck has no design-plan.json; record that Art Direction fidelity could not be verified."] : artDirectionReviewChecklist(designPlan).slice(0, 26)
			],
			reviewed_assets: [],
			findings: []
		};
		const rendered = await this.pptImage.render(owner, workspace, workspaceRelative(workspace, pptxPath), {
			backend: "auto",
			nativeAutomationApproved
		}, signal);
		if (rendered.status === "not_available") {
			report.layers.render.status = "not_available";
			report.layers.render.findings.push({
				code: "RENDERER_NOT_AVAILABLE",
				severity: "warning",
				message: rendered.attempts.map((attempt) => `${attempt.backend}: ${attempt.message}`).join("; ") || "no supported PPTX renderer was found"
			});
			report.layers.automatic_visual.status = "not_available";
		} else if (rendered.status === "failed") {
			report.layers.render.status = "failed";
			report.layers.render.findings.push({
				code: "RENDER_FAILED",
				severity: "error",
				message: rendered.attempts.map((attempt) => `${attempt.backend}: ${attempt.message}`).join("; ")
			});
			report.layers.automatic_visual.status = "not_performed";
		} else {
			report.layers.render.status = "passed";
			report.layers.render.name = rendered.backend;
			report.layers.render.version = rendered.backend_version;
			report.artifacts.pptx_previews = rendered.image_paths;
			report.artifacts.contact_sheets = rendered.contact_sheet_paths;
			try {
				const analyses = await Promise.all(report.artifacts.pptx_previews.map((path, index) => analyzePage(join(workspace, path), index + 1, signal)));
				report.layers.automatic_visual.pages = analyses.map((item) => item.metrics);
				const comparisons = await Promise.all(report.artifacts.pptx_previews.map((path, index) => compareImages(join(workspace, htmlPreviews[index]), join(workspace, path), index + 1, signal)));
				const cjkFindings = await cjkRenderFindings(new Uint8Array(await readFile(pptxPath)), htmlPreviews.map((path) => join(workspace, path)), report.artifacts.pptx_previews.map((path) => join(workspace, path)), expectedPages, signal);
				report.layers.automatic_visual.html_comparison_pages = comparisons.map((item) => item.metrics);
				report.layers.automatic_visual.findings = [
					...designFindings,
					...analyses.flatMap((item) => item.findings),
					...comparisons.flatMap((item) => item.findings),
					...cjkFindings
				];
				report.layers.automatic_visual.status = report.layers.automatic_visual.findings.some((item) => item.severity === "error") ? "failed" : "passed";
				const risky = /* @__PURE__ */ new Set([...report.layers.structural.findings.flatMap((item) => item.page === void 0 ? [] : [item.page]), ...report.layers.automatic_visual.findings.flatMap((item) => item.page === void 0 ? [] : [item.page])]);
				for (const page of [...risky].sort((a, b) => a - b)) {
					throwIfAborted(signal);
					const source = join(workspace, report.artifacts.pptx_previews[page - 1]);
					const target = join(artifactRoot, "preview", `high-risk-page-${String(page).padStart(3, "0")}.png`);
					await copyFile(source, target);
					report.artifacts.high_risk_previews.push(workspaceRelative(workspace, target));
				}
			} catch (error) {
				if (signal?.aborted) throwIfAborted(signal);
				report.layers.automatic_visual.status = "failed";
				report.layers.automatic_visual.findings.push({
					code: "AUTOMATIC_VISUAL_FAILED",
					severity: "error",
					message: error instanceof Error ? error.message : String(error)
				});
			}
		}
		synchronizeStatuses(report);
		await atomicWriteJson(visualReviewPath, review, { overwrite: true });
		await atomicWriteJson(reportPath, report, { overwrite: true });
		return report;
	}
};
async function applyVisualReview(workspace, reportPathInput, reviewPathInput) {
	const reportPath = await resolveWorkspacePath(workspace, reportPathInput, {
		mustExist: true,
		kind: "file"
	});
	const reviewPath = await resolveWorkspacePath(workspace, reviewPathInput, {
		mustExist: true,
		kind: "file"
	});
	const report = JSON.parse(await readFile(reportPath, "utf8"));
	const parsed = visualReviewSchema.safeParse(JSON.parse(await readFile(reviewPath, "utf8")));
	if (!parsed.success) throw new PptError("PPT_QUALITY_FAILED", "visual-review.json does not match the required schema", { details: parsed.error.flatten() });
	const review = parsed.data;
	if (review.version !== 1 || ![
		"passed",
		"failed",
		"not_available"
	].includes(review.status)) throw new PptError("PPT_QUALITY_FAILED", "visual-review.json has not been completed with a valid status");
	if (review.status === "passed" && review.reviewed_assets.length === 0) throw new PptError("PPT_QUALITY_FAILED", "a passed visual review must record reviewed asset paths");
	if (review.status === "passed" && review.findings.some((item) => item.severity === "error")) throw new PptError("PPT_QUALITY_FAILED", "a passed visual review cannot contain error findings");
	const reviewedAssets = /* @__PURE__ */ new Set();
	for (const asset of review.reviewed_assets) reviewedAssets.add(workspaceRelative(workspace, await resolveWorkspacePath(workspace, asset, {
		mustExist: true,
		kind: "file"
	})));
	if (review.status === "passed") {
		const missing = [...report.artifacts.contact_sheets, ...report.artifacts.high_risk_previews].filter((asset) => !reviewedAssets.has(asset));
		if (missing.length > 0) throw new PptError("PPT_QUALITY_FAILED", "a passed visual review must cover every contact sheet and high-risk preview", { details: { missing } });
	}
	report.layers.model_visual = {
		status: review.status === "passed" ? "passed" : review.status === "failed" ? "failed" : "not_available",
		findings: review.findings.map((item) => ({
			code: "MODEL_VISUAL_REVIEW",
			severity: item.severity,
			message: item.message,
			...item.page === void 0 ? {} : { page: item.page }
		}))
	};
	synchronizeStatuses(report);
	await atomicWriteJson(reportPath, report, { overwrite: true });
	return report;
}
//#endregion
export { pdfToPpmCandidates as C, atomicWriteText as D, screenCaptureCandidates as E, libreOfficeCandidates as S, powerShellCandidates as T, summarizeFontAvailability as _, createHtmlDeck as a, isSupportedPlatform as b, resolveWorkspacePath as c, boundedInteger as d, runCollected as f, registeredFont as g, discoverRegisteredFonts as h, createPptx as i, workspaceRelative as l, buildFontCatalog as m, applyVisualReview as n, writePptOutline as o, safeErrorMessage as p, PptImageRuntime as r, isPathInside as s, QualityRuntime as t, DEFAULT_LIMITS as u, appleScriptCandidates as v, powerPointCandidates as w, keynoteCandidates as x, browserSystemCandidates as y };

//# sourceMappingURL=quality-BPW2jBVC.mjs.map