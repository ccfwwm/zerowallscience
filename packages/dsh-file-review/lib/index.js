import z from "@deepseek-ai/schemastery";
import { randomUUID } from "node:crypto";
import { link, lstat, open, readFile, realpath, rename, unlink } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { structuredPatch } from "diff";
//#region src/file-review-change.ts
function validMode(mode) {
	return Number.isInteger(mode) && mode >= 0 && mode <= 511;
}
/** Whether one diff carries enough information for a strict reverse operation. */
function isReversibleDiff(diff, path) {
	if (diff.path !== path) return false;
	if (diff.lifecycle?.kind === "create") return diff.oldText === null && validMode(diff.lifecycle.mode);
	if (diff.lifecycle?.kind === "delete") return typeof diff.oldText === "string" && diff.newText === "" && validMode(diff.lifecycle.mode);
	if (diff.lifecycle !== void 0 || diff.oldText === null || diff.oldText === diff.newText) return false;
	if (diff.oldText === "" && diff.oldStart === void 0) return false;
	if (diff.newText === "" && diff.newStart === void 0) return false;
	return true;
}
/** Shared Host/browser classifier for one complete turn-scoped file change. */
function isReversibleChange(file) {
	return file.complete !== false && file.diffs.length > 0 && file.diffs.every((diff) => isReversibleDiff(diff, file.path));
}
//#endregion
//#region src/file-review-service.ts
/** Host-side, workspace-contained undo / redo service for produced text diffs. */
var FileConflictError = class extends Error {};
function inside$1(root, candidate) {
	const child = relative(root, candidate);
	return child === "" || !child.startsWith("..") && !isAbsolute(child);
}
function errorCode$1(error, code) {
	return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
async function resolveFile(cwd, requestedPath) {
	const root = await realpath(cwd);
	const candidate = resolve(root, requestedPath);
	if (!inside$1(root, candidate)) throw new Error("path is outside the session workspace");
	let linkStat;
	try {
		linkStat = await lstat(candidate);
	} catch (error) {
		if (!errorCode$1(error, "ENOENT")) throw error;
		const parent = await realpath(dirname(candidate));
		if (!inside$1(root, parent)) throw new Error("resolved path is outside the session workspace");
		return {
			kind: "missing",
			filename: resolve(parent, basename(candidate))
		};
	}
	if (linkStat.isSymbolicLink()) throw new Error("symbolic links are not supported");
	if (!linkStat.isFile()) throw new Error("path is not a regular file");
	const filename = await realpath(candidate);
	if (!inside$1(root, filename)) throw new Error("resolved path is outside the session workspace");
	const bytes = await readFile(filename);
	const text = bytes.toString("utf8");
	if (!Buffer.from(text, "utf8").equals(bytes)) throw new Error("file is not valid UTF-8 text");
	return {
		kind: "file",
		filename,
		mode: linkStat.mode & 511,
		bytes,
		text
	};
}
function offsetAtLine$1(text, line) {
	if (!Number.isInteger(line) || line < 1) return null;
	if (line === 1) return 0;
	let offset = 0;
	for (let current = 1; current < line; current += 1) {
		const next = text.indexOf("\n", offset);
		if (next === -1) return null;
		offset = next + 1;
	}
	return offset;
}
function replaceHunk(text, source, replacement, line) {
	let offset;
	if (line !== void 0) {
		const located = offsetAtLine$1(text, line);
		if (located === null || text.slice(located, located + source.length) !== source) return null;
		offset = located;
	} else {
		if (source === "") return null;
		offset = text.indexOf(source);
		if (offset === -1 || text.indexOf(source, offset + 1) !== -1) return null;
	}
	return text.slice(0, offset) + replacement + text.slice(offset + source.length);
}
/** Apply a complete file's hunk sequence in memory, or report a strict mismatch. */
function transformFile(text, file, action) {
	if (!isReversibleChange(file) || file.diffs.some((diff) => diff.lifecycle !== void 0)) return null;
	const diffs = action === "undo" ? [...file.diffs].reverse() : file.diffs;
	let next = text;
	for (const diff of diffs) {
		const source = action === "undo" ? diff.newText : diff.oldText;
		const replacement = action === "undo" ? diff.oldText : diff.newText;
		if (source === null || replacement === null) return null;
		const changed = replaceHunk(next, source, replacement, action === "undo" ? diff.newStart : diff.oldStart);
		if (changed === null) return null;
		next = changed;
	}
	return next;
}
function virtualFile(image, text, mode) {
	return {
		kind: "file",
		filename: image.filename,
		mode,
		bytes: Buffer.from(text),
		text
	};
}
function transformImage(image, file, action) {
	if (!isReversibleChange(file)) return null;
	const diffs = action === "undo" ? [...file.diffs].reverse() : file.diffs;
	let next = image;
	for (const diff of diffs) {
		if (diff.lifecycle?.kind === "create") {
			if (action === "redo") {
				if (next.kind !== "missing") return null;
				next = virtualFile(next, diff.newText, diff.lifecycle.mode);
			} else {
				if (next.kind !== "file" || next.text !== diff.newText || next.mode !== diff.lifecycle.mode) return null;
				next = {
					kind: "missing",
					filename: next.filename
				};
			}
			continue;
		}
		if (diff.lifecycle?.kind === "delete") {
			if (diff.oldText === null) return null;
			if (action === "redo") {
				if (next.kind !== "file" || next.text !== diff.oldText || next.mode !== diff.lifecycle.mode) return null;
				next = {
					kind: "missing",
					filename: next.filename
				};
			} else {
				if (next.kind !== "missing") return null;
				next = virtualFile(next, diff.oldText, diff.lifecycle.mode);
			}
			continue;
		}
		if (next.kind !== "file" || diff.oldText === null) return null;
		const source = action === "undo" ? diff.newText : diff.oldText;
		const replacement = action === "undo" ? diff.oldText : diff.newText;
		const changed = replaceHunk(next.text, source, replacement, action === "undo" ? diff.newStart : diff.oldStart);
		if (changed === null) return null;
		next = virtualFile(next, changed, next.mode);
	}
	return next;
}
function sameImage(left, right) {
	return left.kind === "missing" ? right.kind === "missing" : right.kind === "file" && left.text === right.text && left.mode === right.mode;
}
function inspectImage(image, file, requestedAction) {
	if (!isReversibleChange(file)) return {
		state: "unsupported",
		reason: "change has no complete reversible diff"
	};
	const undone = transformImage(image, file, "undo");
	const redone = transformImage(image, file, "redo");
	if (undone !== null && redone !== null) {
		if (sameImage(undone, image) && sameImage(redone, image)) return { state: requestedAction === "undo" ? "applied" : "undone" };
		return {
			state: "conflict",
			reason: "file matches both diff directions ambiguously"
		};
	}
	if (undone !== null) return { state: "applied" };
	if (redone !== null) return { state: "undone" };
	return {
		state: "conflict",
		reason: "current content does not match the recorded change"
	};
}
async function inspectOne(cwd, file, action) {
	if (!isReversibleChange(file)) return {
		path: file.path,
		state: "unsupported",
		changed: false,
		reason: "change has no complete reversible diff"
	};
	try {
		const inspected = inspectImage(await resolveFile(cwd, file.path), file, action);
		return {
			path: file.path,
			state: inspected.state,
			changed: false,
			reason: inspected.reason
		};
	} catch (error) {
		return {
			path: file.path,
			state: "error",
			changed: false,
			reason: error instanceof Error ? error.message : String(error)
		};
	}
}
async function assertUnchanged(image) {
	try {
		const currentStat = await lstat(image.filename);
		if (currentStat.isSymbolicLink() || !currentStat.isFile() || (currentStat.mode & 511) !== image.mode) throw new FileConflictError("file changed while the operation was being prepared");
		const current = await readFile(image.filename);
		if (!Buffer.from(image.bytes).equals(current)) throw new FileConflictError("file changed while the operation was being prepared");
	} catch (error) {
		if (error instanceof FileConflictError) throw error;
		throw new FileConflictError("file changed while the operation was being prepared");
	}
}
async function createFileAtomicExclusive(image) {
	const temp = `${image.filename}.${randomUUID()}.tmp`;
	const handle = await open(temp, "wx", image.mode);
	try {
		try {
			await handle.writeFile(image.text, "utf8");
			await handle.chmod(image.mode);
		} finally {
			await handle.close();
		}
		try {
			await link(temp, image.filename);
		} catch (error) {
			if (errorCode$1(error, "EEXIST")) throw new FileConflictError("target path is no longer missing");
			throw error;
		}
	} finally {
		await unlink(temp).catch(() => {});
	}
}
async function replaceFileAtomicExact(current, target) {
	const temp = `${target.filename}.${randomUUID()}.tmp`;
	const handle = await open(temp, "wx", target.mode);
	try {
		try {
			await handle.writeFile(target.text, "utf8");
			await handle.chmod(target.mode);
		} finally {
			await handle.close();
		}
		await assertUnchanged(current);
		await rename(temp, target.filename);
	} finally {
		await unlink(temp).catch(() => {});
	}
}
async function commitImage(current, target) {
	if (sameImage(current, target)) return false;
	if (current.kind === "file") await assertUnchanged(current);
	if (current.kind === "file" && target.kind === "missing") {
		await unlink(current.filename);
		return true;
	}
	if (current.kind === "missing" && target.kind === "file") {
		try {
			await lstat(current.filename);
			throw new FileConflictError("target path is no longer missing");
		} catch (error) {
			if (!errorCode$1(error, "ENOENT")) throw error;
		}
		await createFileAtomicExclusive(target);
		return true;
	}
	if (current.kind === "file" && target.kind === "file") {
		await replaceFileAtomicExact(current, target);
		return true;
	}
	return false;
}
async function applyOne(cwd, file, action) {
	if (!isReversibleChange(file)) return {
		path: file.path,
		state: "unsupported",
		changed: false,
		reason: "change has no complete reversible diff"
	};
	try {
		const resolved = await resolveFile(cwd, file.path);
		const targetState = action === "undo" ? "undone" : "applied";
		const target = transformImage(resolved, file, action);
		const reverse = transformImage(resolved, file, action === "undo" ? "redo" : "undo");
		if (target === null) {
			if (reverse !== null) return {
				path: file.path,
				state: targetState,
				changed: false
			};
			return {
				path: file.path,
				state: "conflict",
				changed: false,
				reason: "current content does not match the recorded change"
			};
		}
		if (reverse !== null && !(sameImage(target, resolved) && sameImage(reverse, resolved))) return {
			path: file.path,
			state: "conflict",
			changed: false,
			reason: "file matches both diff directions ambiguously"
		};
		const changed = await commitImage(resolved, target);
		return {
			path: file.path,
			state: targetState,
			changed
		};
	} catch (error) {
		if (error instanceof FileConflictError) return {
			path: file.path,
			state: "conflict",
			changed: false,
			reason: error.message
		};
		return {
			path: file.path,
			state: "error",
			changed: false,
			reason: error instanceof Error ? error.message : String(error)
		};
	}
}
function sessionCwd(agent) {
	const cwd = agent.session.header.cwd;
	if (cwd === void 0 || cwd.trim() === "") throw new Error("session has no workspace directory");
	return cwd;
}
/** Host service published as the `fileReview` Remote namespace. */
var FileReviewService = class extends TypertRemoteService {
	constructor(ctx) {
		super(ctx, "fileReview");
	}
	/** Inspect current disk state without changing files. */
	async status(agent, request) {
		const cwd = sessionCwd(agent);
		return { files: await Promise.all(request.files.map((file) => inspectOne(cwd, file, request.action))) };
	}
	/** Toggle every independently safe file while the receiving Agent is idle. */
	async apply(agent, request) {
		const cwd = sessionCwd(agent);
		return agent.runMaintenance(async () => {
			const files = [];
			for (const file of request.files) files.push(await applyOne(cwd, file, request.action));
			return { files };
		});
	}
};
const PTC_FILE_REVIEW_MAX_BYTES = 256 * 1024;
function record(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
}
function positiveInteger(value) {
	return typeof value === "number" && Number.isInteger(value) && value >= 1;
}
function pathOf$1(value) {
	const item = record(value);
	return item !== null && typeof item.path === "string" && item.path !== "" ? item.path : null;
}
function diffPresentation(value) {
	const view = record(value);
	if (view?.card !== "diff") return { kind: "absent" };
	if (!Array.isArray(view.diffs)) return { kind: "invalid" };
	const diffs = [];
	for (const candidate of view.diffs) {
		const diff = record(candidate);
		if (diff === null) return { kind: "invalid" };
		const { path, oldText, newText, oldStart, newStart } = diff;
		if (typeof path !== "string" || path === "" || oldText !== null && typeof oldText !== "string" || typeof newText !== "string" || oldStart !== void 0 && !positiveInteger(oldStart) || newStart !== void 0 && !positiveInteger(newStart)) return { kind: "invalid" };
		diffs.push({
			path,
			oldText,
			newText,
			...typeof oldStart === "number" ? { oldStart } : {},
			...typeof newStart === "number" ? { newStart } : {}
		});
	}
	return {
		kind: "present",
		diffs
	};
}
function isMutationCall(view) {
	const item = record(view);
	if (item === null) return false;
	if (item.card === "diff" || item.card === "generic" && item.kind === "edit") return true;
	return item.card === "generic" && item.kind === "delete" && locationPaths(item).length > 0;
}
function locationPaths(view) {
	const item = record(view);
	if (item === null || item.card !== "diff" && !(item.card === "generic" && (item.kind === "edit" || item.kind === "delete")) || !Array.isArray(item.locations)) return [];
	return item.locations.map(pathOf$1).filter((path) => path !== null);
}
function appendPath(paths, seen, path) {
	if (seen.has(path)) return;
	seen.add(path);
	paths.push(path);
}
function resultChanges(diffs) {
	const files = [];
	const byPath = /* @__PURE__ */ new Map();
	for (const diff of diffs) {
		const existing = byPath.get(diff.path);
		if (existing !== void 0) {
			existing.push(diff);
			continue;
		}
		const grouped = [diff];
		byPath.set(diff.path, grouped);
		files.push({
			path: diff.path,
			diffs: grouped,
			source: "result"
		});
	}
	return files;
}
/**
* Normalize tool presentation without knowing the tool name. Applied result
* hunks win; call-time intent is the accepted fallback when they are absent.
*/
function normalizeMutationPresentation(callView, resultView) {
	if (!isMutationCall(callView)) return [];
	const result = diffPresentation(resultView);
	if (result.kind === "invalid") return [];
	if (result.kind === "present") return resultChanges(result.diffs);
	const intent = diffPresentation(callView);
	if (intent.kind === "invalid") return [];
	const intentDiffs = intent.kind === "present" ? intent.diffs : [];
	const paths = [];
	const seen = /* @__PURE__ */ new Set();
	for (const path of locationPaths(callView)) appendPath(paths, seen, path);
	for (const diff of intentDiffs) appendPath(paths, seen, diff.path);
	return paths.map((path) => ({
		path,
		diffs: intentDiffs.filter((diff) => diff.path === path),
		source: "intent"
	}));
}
function parseLifecycle(value) {
	const lifecycle = record(value);
	if (lifecycle === null || lifecycle.kind !== "create" && lifecycle.kind !== "delete" || typeof lifecycle.mode !== "number" || !Number.isInteger(lifecycle.mode) || lifecycle.mode < 0 || lifecycle.mode > 511) return null;
	return {
		kind: lifecycle.kind,
		mode: lifecycle.mode
	};
}
function parseDiff(value, expectedPath, schema) {
	const item = record(value);
	if (item === null || item.path !== expectedPath) return null;
	const { path, oldText, newText, oldStart, newStart, lifecycle: rawLifecycle } = item;
	if (typeof path !== "string" || oldText !== null && typeof oldText !== "string" || typeof newText !== "string" || oldStart !== void 0 && !positiveInteger(oldStart) || newStart !== void 0 && !positiveInteger(newStart)) return null;
	const lifecycle = rawLifecycle === void 0 ? void 0 : parseLifecycle(rawLifecycle);
	if (rawLifecycle !== void 0 && lifecycle === null || schema === 1 && rawLifecycle !== void 0 || lifecycle?.kind === "create" && oldText !== null || lifecycle?.kind === "delete" && (typeof oldText !== "string" || newText !== "")) return null;
	return {
		path,
		oldText,
		newText,
		...typeof oldStart === "number" ? { oldStart } : {},
		...typeof newStart === "number" ? { newStart } : {},
		...lifecycle !== void 0 && lifecycle !== null ? { lifecycle } : {}
	};
}
function parseFile(value, schema) {
	const item = record(value);
	if (item === null || typeof item.path !== "string" || item.path === "" || item.source !== "result" && item.source !== "intent" || !Array.isArray(item.diffs)) return null;
	const diffs = [];
	for (const value of item.diffs) {
		const diff = parseDiff(value, item.path, schema);
		if (diff === null) return null;
		diffs.push(diff);
	}
	return {
		path: item.path,
		diffs,
		source: item.source
	};
}
/** Parse and detach one marker, optionally requiring its event correlations. */
function parsePtcFileReviewMarker(value, expected) {
	const marker = record(value);
	if (marker === null || marker.schema !== 1 && marker.schema !== 2 || typeof marker.turn !== "number" || !Number.isInteger(marker.turn) || marker.turn < 0 || typeof marker.step !== "number" || !Number.isInteger(marker.step) || marker.step < 0 || typeof marker.rootCallId !== "string" || marker.rootCallId === "" || typeof marker.subCallId !== "string" || marker.subCallId === "" || typeof marker.truncated !== "boolean" || !Array.isArray(marker.files) || expected !== void 0 && (marker.rootCallId !== expected.rootCallId || marker.subCallId !== expected.subCallId)) return null;
	const files = [];
	const seen = /* @__PURE__ */ new Set();
	for (const value of marker.files) {
		const file = parseFile(value, marker.schema);
		if (file === null || seen.has(file.path) || marker.truncated === true && file.diffs.length > 0) return null;
		seen.add(file.path);
		files.push(file);
	}
	if (files.length === 0) return null;
	return {
		schema: marker.schema,
		turn: marker.turn,
		step: marker.step,
		rootCallId: marker.rootCallId,
		subCallId: marker.subCallId,
		files,
		truncated: marker.truncated
	};
}
/** Read the last valid invisible marker from one PTC settlement content array. */
function markerFromContent(content, expected) {
	for (let index = content.length - 1; index >= 0; index--) {
		const block = record(content[index]);
		if (block?.type !== "text" || block.text !== "") continue;
		const marker = parsePtcFileReviewMarker(block.dshFileReview, expected);
		if (marker !== null) return marker;
	}
	return null;
}
function bytes(value) {
	return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}
/** Bound one marker before it is duplicated into the durable PTC log. */
function boundedPtcFileReviewMarker(marker, maxBytes = PTC_FILE_REVIEW_MAX_BYTES) {
	const complete = {
		schema: 2,
		...marker,
		truncated: false
	};
	if (bytes(complete) <= maxBytes) return complete;
	const truncated = {
		...complete,
		files: complete.files.map((file) => ({
			...file,
			diffs: []
		})),
		truncated: true
	};
	return bytes(truncated) <= maxBytes ? truncated : null;
}
/** Build the invisible standard text block used as the durable carrier. */
function markerBlock(marker) {
	return {
		type: "text",
		text: "",
		dshFileReview: marker
	};
}
//#endregion
//#region src/session-events.ts
/** Read session events across DSH alpha.3 and alpha.4+. */
function sessionEvents(session) {
	return session.snapshotEvents?.() ?? session.events ?? [];
}
//#endregion
//#region src/file-lifecycle-capture.ts
/** Capture exact file transitions around successful mutation tools. */
const INLINE_UNCHANGED_LINES = 5;
function inside(root, candidate) {
	const child = relative(root, candidate);
	return child === "" || !child.startsWith("..") && !isAbsolute(child);
}
function errorCode(error, code) {
	return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
async function capturePath(root, path) {
	const candidate = resolve(root, path);
	if (!inside(root, candidate)) return null;
	let stat;
	try {
		stat = await lstat(candidate);
	} catch (error) {
		return errorCode(error, "ENOENT") ? { kind: "missing" } : null;
	}
	if (stat.isSymbolicLink() || !stat.isFile()) return null;
	const filename = await realpath(candidate);
	if (!inside(root, filename)) return null;
	const bytes = await readFile(filename);
	const text = bytes.toString("utf8");
	if (!Buffer.from(text, "utf8").equals(bytes)) return null;
	return {
		kind: "file",
		text,
		mode: stat.mode & 511
	};
}
function pathOf(value) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
	const path = value.path;
	return typeof path === "string" && path !== "" ? path : null;
}
function mutationPaths(view) {
	if (view === void 0) return [];
	if (!(view.card === "diff" || view.card === "generic" && (view.kind === "edit" || view.kind === "delete"))) return [];
	const paths = [];
	const seen = /* @__PURE__ */ new Set();
	const append = (path) => {
		if (path === null || seen.has(path)) return;
		seen.add(path);
		paths.push(path);
	};
	if ("locations" in view) for (const location of view.locations ?? []) append(pathOf(location));
	if (view.card === "diff") for (const diff of view.diffs) append(pathOf(diff));
	return paths;
}
function rootCall$1(agent, rootCallId) {
	const events = sessionEvents(agent.session);
	for (let index = events.length - 1; index >= 0; index--) {
		const event = events[index];
		if (event?.type !== "tool/call" || event.data.callId !== rootCallId || !Number.isInteger(event.data.turn) || event.data.turn < 0 || !Number.isInteger(event.data.step) || event.data.step < 0) continue;
		return {
			turn: event.data.turn,
			step: event.data.step
		};
	}
	return null;
}
async function captureImages(root, paths) {
	const entries = await Promise.all(paths.map(async (path) => [path, await capturePath(root, path)]));
	return new Map(entries);
}
/** Find the string offset of a one-based line, or null when that line does not exist. */
function offsetAtLine(text, line) {
	let offset = 0;
	for (let current = 1; current < line; current += 1) {
		const next = text.indexOf("\n", offset);
		if (next === -1) return null;
		offset = next + 1;
	}
	return offset;
}
/** Slice an exact line range while preserving its original newline characters. */
function lineRange(text, start, count) {
	const from = offsetAtLine(text, start);
	if (from === null) return null;
	if (count === 0) return "";
	let to = from;
	for (let current = 0; current < count; current += 1) {
		const next = text.indexOf("\n", to);
		if (next === -1) return current === count - 1 ? text.slice(from) : null;
		to = next + 1;
	}
	return text.slice(from, to);
}
/** Keep up to five unchanged lines inline by joining compatible neighboring hunks. */
function mergeNearbyHunks(hunks) {
	const merged = [];
	for (const hunk of hunks) {
		const previous = merged.at(-1);
		if (previous !== void 0) {
			const oldGap = hunk.oldStart - (previous.oldStart + previous.oldLines);
			if (oldGap === hunk.newStart - (previous.newStart + previous.newLines) && oldGap >= 0 && oldGap <= INLINE_UNCHANGED_LINES) {
				previous.oldLines = hunk.oldStart + hunk.oldLines - previous.oldStart;
				previous.newLines = hunk.newStart + hunk.newLines - previous.newStart;
				continue;
			}
		}
		merged.push({
			oldStart: hunk.oldStart,
			oldLines: hunk.oldLines,
			newStart: hunk.newStart,
			newLines: hunk.newLines
		});
	}
	return merged;
}
/** Derive authoritative, line-addressed hunks from complete before/after file images. */
function snapshotDiffs(path, oldText, newText) {
	return mergeNearbyHunks(structuredPatch(path, path, oldText, newText, void 0, void 0, { context: 0 }).hunks).flatMap((hunk) => {
		const oldRange = lineRange(oldText, hunk.oldStart, hunk.oldLines);
		const newRange = lineRange(newText, hunk.newStart, hunk.newLines);
		return oldRange === null || newRange === null ? [] : [{
			path,
			oldText: oldRange,
			newText: newRange,
			oldStart: hunk.oldStart,
			newStart: hunk.newStart
		}];
	});
}
/** Convert captured file images into review changes for creates, deletes, and edits. */
function snapshotFiles(paths, before, after) {
	const files = [];
	for (const path of paths) {
		const oldImage = before.get(path);
		const newImage = after.get(path);
		if (oldImage?.kind === "missing" && newImage?.kind === "file") files.push({
			path,
			source: "result",
			diffs: [{
				path,
				oldText: null,
				newText: newImage.text,
				oldStart: 1,
				newStart: 1,
				lifecycle: {
					kind: "create",
					mode: newImage.mode
				}
			}]
		});
		else if (oldImage?.kind === "file" && newImage?.kind === "missing") files.push({
			path,
			source: "result",
			diffs: [{
				path,
				oldText: oldImage.text,
				newText: "",
				oldStart: 1,
				newStart: 1,
				lifecycle: {
					kind: "delete",
					mode: oldImage.mode
				}
			}]
		});
		else if (oldImage?.kind === "file" && newImage?.kind === "file" && oldImage.text !== newImage.text) {
			const diffs = snapshotDiffs(path, oldImage.text, newImage.text);
			if (diffs.length > 0) files.push({
				path,
				source: "result",
				diffs
			});
		}
	}
	return files;
}
/** Prefer snapshot-derived diffs while retaining tool presentation for uncaptured paths. */
function mergePresentedFiles(presented, captured) {
	const replacements = new Map(captured.map((file) => [file.path, file]));
	return [...presented.map((file) => {
		const replacement = replacements.get(file.path);
		replacements.delete(file.path);
		return replacement ?? file;
	}), ...replacements.values()];
}
/** Register snapshot capture without changing mutation-tool success or failure semantics. */
function registerFileLifecycleCapture(ctx) {
	const captured = /* @__PURE__ */ new Map();
	ctx.on("tools/execute", async (exec, next) => {
		const agent = exec.agent;
		const cwd = agent?.session.header.cwd;
		let paths = [];
		let callView;
		try {
			callView = ctx.tools.get(exec.name, agent)?.presentCall?.(exec.arguments);
			paths = mutationPaths(callView);
		} catch {
			paths = [];
		}
		if (agent === void 0 || cwd === void 0 || cwd.trim() === "" || paths.length === 0) return next();
		let root;
		let before;
		try {
			root = await realpath(cwd);
			before = await captureImages(root, paths);
		} catch {
			return next();
		}
		const result = await next();
		if (result.isError) return result;
		try {
			const after = await captureImages(root, paths);
			const snapshots = snapshotFiles(paths, before, after);
			let presented;
			try {
				const resultView = ctx.tools.get(exec.name, agent)?.presentResult?.(exec.arguments, result);
				presented = normalizeMutationPresentation(callView, resultView);
			} catch {
				presented = normalizeMutationPresentation(callView, void 0);
			}
			const files = mergePresentedFiles(presented, snapshots);
			const owner = rootCall$1(agent, exec.rootCallId);
			if (snapshots.length > 0 && files.length > 0 && owner !== null) captured.set(exec.token, {
				files,
				turn: owner.turn,
				step: owner.step,
				rootCallId: exec.rootCallId,
				subCallId: exec.callId
			});
		} catch {}
		return result;
	});
	ctx.on("tools/post-execute", async (exec, result, next) => {
		const decision = await next();
		const snapshot = captured.get(exec.token);
		captured.delete(exec.token);
		if (result.isError || snapshot === void 0 || decision.kind !== "accept" || "value" in decision) return decision;
		const marker = boundedPtcFileReviewMarker(snapshot);
		if (marker === null) return decision;
		return {
			...decision,
			content: [...decision.content ?? result.content, markerBlock(marker)]
		};
	});
	ctx.on("tools/result", (exec) => {
		captured.delete(exec.token);
	});
}
//#endregion
//#region src/ptc-adapter.ts
function dispatchStart(events, dispatch) {
	const rootCallId = dispatch.exec.rootCallId;
	const subCallId = dispatch.subCallId;
	if (typeof rootCallId !== "string" || rootCallId === "" || typeof subCallId !== "string" || subCallId === "") return null;
	for (let index = events.length - 1; index >= 0; index--) {
		const event = events[index];
		if (event?.type !== "tool/ptc-dispatch-start" || event.data.subCallId !== subCallId || event.data.rootCallId !== rootCallId || event.data.name !== dispatch.name) continue;
		return {
			arguments: event.data.arguments,
			rootCallId,
			subCallId
		};
	}
	return null;
}
function rootCall(events, rootCallId) {
	for (let index = events.length - 1; index >= 0; index--) {
		const event = events[index];
		if (event?.type !== "tool/call" || event.data.callId !== rootCallId || !Number.isInteger(event.data.turn) || event.data.turn < 0 || !Number.isInteger(event.data.step) || event.data.step < 0) continue;
		return {
			turn: event.data.turn,
			step: event.data.step
		};
	}
	return null;
}
function present(run) {
	try {
		return {
			kind: "ok",
			view: run()
		};
	} catch {
		return { kind: "error" };
	}
}
function sanitizeLoggedContent(content) {
	let sanitized;
	for (let index = 0; index < content.length; index++) {
		const block = content[index];
		if (typeof block !== "object" || block === null || !Object.prototype.hasOwnProperty.call(block, "dshFileReview")) continue;
		const copy = { ...block };
		delete copy.dshFileReview;
		sanitized ??= [...content];
		sanitized[index] = copy;
	}
	return sanitized ?? content;
}
/**
* Await the existing log shapers, then append this plugin's invisible marker.
* Any Adapter failure degrades to the already-shaped content.
*/
async function adaptPtcDispatchLog(ctx, dispatch, next) {
	const loggedContent = sanitizeLoggedContent(await next());
	if (dispatch.isError || dispatch.agent === void 0) return loggedContent;
	try {
		const events = sessionEvents(dispatch.agent.session);
		const start = dispatchStart(events, dispatch);
		if (start === null) return loggedContent;
		const root = rootCall(events, start.rootCallId);
		if (root === null) return loggedContent;
		const captured = markerFromContent(dispatch.content, {
			rootCallId: start.rootCallId,
			subCallId: start.subCallId
		});
		const definition = ctx.tools.get(dispatch.name, dispatch.agent);
		if (definition === void 0) return loggedContent;
		const call = definition.presentCall === void 0 ? {
			kind: "ok",
			view: void 0
		} : present(() => definition.presentCall?.(start.arguments));
		if (call.kind === "error") return loggedContent;
		const result = definition.presentResult === void 0 ? {
			kind: "ok",
			view: void 0
		} : present(() => definition.presentResult?.(start.arguments, {
			content: dispatch.content,
			isError: false
		}));
		if (result.kind === "error") return loggedContent;
		const files = captured !== null && captured.turn === root.turn && captured.step === root.step ? captured.files : normalizeMutationPresentation(call.view, result.view);
		if (files.length === 0) return loggedContent;
		const marker = boundedPtcFileReviewMarker({
			turn: root.turn,
			step: root.step,
			rootCallId: start.rootCallId,
			subCallId: start.subCallId,
			files
		});
		return marker === null ? loggedContent : [...loggedContent, markerBlock(marker)];
	} catch {
		return loggedContent;
	}
}
/** Register the Adapter on the awaited PTC log-copy seam. */
function registerPtcAdapter(ctx) {
	return ctx.on("tools/ptc-dispatch-log", (dispatch, next) => adaptPtcDispatchLog(ctx, dispatch, next));
}
//#endregion
//#region src/settings-contract.ts
/** Shared Host/browser contract for file-review display preferences. */
/** Settings namespace owned by this plugin. */
const FILE_REVIEW_SETTINGS_NAMESPACE = "file-review";
/** Preserve the existing horizontally scrollable diff presentation by default. */
const DEFAULT_WORD_WRAP = false;
//#endregion
//#region src/index.ts
/** Plugin configuration and durable settings schema. */
const Config = z.object({
	wordWrap: z.boolean().default(false),
	diffLayout: z.union([z.const("split"), z.const("unified")]).default("split")
});
/** Services required for the model guidance paired with the browser renderer. */
const inject = ["systemPrompt", "tools"];
/** Stable final-response guidance owned by the matching renderer. */
const FILE_REFERENCE_PROMPT = "When you successfully create or modify files, mention the primary outputs in your final response. To make those and any other changed-file references clickable in Web, format them as Markdown inline code using the exact file-tool path, or a basename when unique among the files changed in that turn.";
/**
* Register model guidance for the file-reference renderer shipped by this package.
* @param ctx - host context carrying the system-prompt registry.
*/
function apply(ctx, config = {}) {
	ctx.inject(["settings"], (settingsCtx) => {
		settingsCtx.settings.installSection(ctx, FILE_REVIEW_SETTINGS_NAMESPACE, Config, config, {
			setSource: () => {},
			onChange: () => {}
		});
	});
	new FileReviewService(ctx);
	registerFileLifecycleCapture(ctx);
	registerPtcAdapter(ctx);
	ctx.systemPrompt.section({
		name: "ui:file-review-references",
		order: 190,
		text: FILE_REFERENCE_PROMPT
	});
}
//#endregion
export { Config, DEFAULT_WORD_WRAP, FILE_REVIEW_SETTINGS_NAMESPACE, FileReviewService, apply, inject, transformFile };
