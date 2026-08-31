import { n as PptError, t as PPT_ERROR_CODES } from "./errors-B2SDbEye.mjs";
import { D as atomicWriteText, b as isSupportedPlatform } from "./quality-BPW2jBVC.mjs";
import { t as createPptRuntime } from "./runtime-BCcDfQ7s.mjs";
import { PPT_MODE_TOOL_NAMES, PPT_TOOL_NAMES } from "./schemas.mjs";
import { createHash, randomUUID } from "node:crypto";
import { cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import z from "schemastery";
//#region src/index.ts
/** DeepSeek Harness host-plane entry for the PPT design plugin. */
const name = "dsh-ppt";
const inject = ["sandbox", "subprocess"];
const Config = z.object({
	presetId: z.string().pattern(/^[a-z0-9][a-z0-9-]*$/).default("ppt"),
	installPreset: z.boolean().default(true),
	pythonExecutable: z.string().default(process.platform === "win32" ? "python" : "python3"),
	browserExecutable: z.string().default(""),
	fontDirs: z.array(z.string()).default([]),
	outputRoot: z.string().default("ppt-output")
});
function resolveDshHome(env = process.env) {
	const configured = env.DSH_HOME?.trim();
	const selected = configured === void 0 || configured.length === 0 ? join(homedir(), ".dsh") : configured;
	return resolve(selected.startsWith("~/") ? join(homedir(), selected.slice(2)) : selected);
}
const MANAGED_MANIFEST = ".dsh-ppt-managed.json";
const MANAGED_FILES = ["agent.cordis.yml", "preset.yml"];
function sha256(value) {
	return createHash("sha256").update(value).digest("hex");
}
async function sourcePresetState() {
	const sourceDir = fileURLToPath(new URL("../preset/ppt/", import.meta.url));
	const contents = {};
	for (const file of MANAGED_FILES) contents[file] = await readFile(join(sourceDir, file), "utf8");
	return {
		sourceDir,
		contents,
		manifest: {
			package: "@yejiming/dsh-ppt",
			version: 1,
			files: Object.fromEntries(Object.entries(contents).map(([file, content]) => [file, sha256(content)]))
		}
	};
}
async function readManagedManifest(targetDir) {
	try {
		const value = JSON.parse(await readFile(join(targetDir, MANAGED_MANIFEST), "utf8"));
		if (value.package !== "@yejiming/dsh-ppt" || value.version !== 1 || typeof value.files !== "object") return void 0;
		return value;
	} catch {
		return;
	}
}
/** Install or safely update the package-owned PPT preset without overwriting user edits. */
async function installPreset(presetId = "ppt", dshHome = resolveDshHome()) {
	const targetDir = join(dshHome, ".agent-presets", presetId);
	const source = await sourcePresetState();
	try {
		await readFile(join(targetDir, "agent.cordis.yml"), "utf8");
	} catch {
		const temporary = `${targetDir}.install-${process.pid}-${randomUUID()}`;
		await mkdir(dirname(targetDir), { recursive: true });
		try {
			await cp(source.sourceDir, temporary, {
				recursive: true,
				errorOnExist: true
			});
			await writeFile(join(temporary, MANAGED_MANIFEST), `${JSON.stringify(source.manifest, null, 2)}\n`, { flag: "wx" });
			await rename(temporary, targetDir);
			return {
				status: "installed",
				targetDir,
				conflicts: []
			};
		} catch (error) {
			await rm(temporary, {
				recursive: true,
				force: true
			});
			if (error.code !== "EEXIST" && error.code !== "ENOTEMPTY") throw error;
		}
	}
	const installed = await readManagedManifest(targetDir);
	if (installed === void 0) return {
		status: "conflict",
		targetDir,
		conflicts: [...MANAGED_FILES]
	};
	const conflicts = [];
	let changed = false;
	for (const file of MANAGED_FILES) {
		const target = join(targetDir, file);
		let current;
		try {
			current = await readFile(target, "utf8");
		} catch {
			conflicts.push(file);
			continue;
		}
		if (sha256(current) !== installed.files[file]) {
			conflicts.push(file);
			continue;
		}
		if (current !== source.contents[file]) {
			await atomicWriteText(target, source.contents[file], { overwrite: true });
			changed = true;
		}
	}
	if (conflicts.length > 0) return {
		status: "conflict",
		targetDir,
		conflicts
	};
	await atomicWriteText(join(targetDir, MANAGED_MANIFEST), `${JSON.stringify(source.manifest, null, 2)}\n`, { overwrite: true });
	return {
		status: changed ? "updated" : "unchanged",
		targetDir,
		conflicts: []
	};
}
/** Remove only an unchanged package-managed preset directory; user edits are preserved. */
async function removeManagedPreset(presetId = "ppt", dshHome = resolveDshHome()) {
	const targetDir = join(dshHome, ".agent-presets", presetId);
	const manifest = await readManagedManifest(targetDir);
	if (manifest === void 0) try {
		await readFile(join(targetDir, "agent.cordis.yml"), "utf8");
		return {
			status: "conflict",
			targetDir,
			conflicts: [...MANAGED_FILES]
		};
	} catch {
		return {
			status: "absent",
			targetDir,
			conflicts: []
		};
	}
	const conflicts = [];
	for (const file of MANAGED_FILES) try {
		if (sha256(await readFile(join(targetDir, file), "utf8")) !== manifest.files[file]) conflicts.push(file);
	} catch {
		conflicts.push(file);
	}
	if (conflicts.length > 0) return {
		status: "conflict",
		targetDir,
		conflicts
	};
	await rm(targetDir, {
		recursive: true,
		force: true
	});
	return {
		status: "removed",
		targetDir,
		conflicts: []
	};
}
function assertSupportedPlatform(platform = process.platform) {
	if (!isSupportedPlatform(platform)) throw new PptError("PPT_PLATFORM_UNSUPPORTED", `PPT mode supports macOS, Linux, and Windows; unsupported platform: ${platform}`);
}
async function apply(ctx, config) {
	assertSupportedPlatform();
	const runtime = createPptRuntime({
		context: ctx,
		pythonExecutable: config.pythonExecutable,
		browserExecutable: config.browserExecutable || void 0,
		fontDirs: config.fontDirs,
		outputRoot: config.outputRoot
	});
	ctx.provide("pptRuntime", runtime);
	ctx.effect(() => () => runtime.dispose(), "dsh-ppt: dispose runtime resources");
	if (config.installPreset) {
		const result = await installPreset(config.presetId);
		if (result.status === "conflict") ctx.logger.warn("dsh-ppt: preserved user-edited preset at %s; conflicts: %s", result.targetDir, result.conflicts.join(", "));
		else ctx.logger.info("dsh-ppt: preset \"%s\" %s at %s", config.presetId, result.status, result.targetDir);
	}
}
//#endregion
export { Config, PPT_ERROR_CODES, PPT_MODE_TOOL_NAMES, PPT_TOOL_NAMES, PptError, apply, assertSupportedPlatform, createPptRuntime, inject, installPreset, name, removeManagedPreset, resolveDshHome };

//# sourceMappingURL=index.mjs.map