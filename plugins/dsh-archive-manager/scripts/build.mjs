// 统一从 src 生成可发布的 lib，避免运行产物成为手工维护入口。
// 先在同级暂存目录完成构建，成功后再替换，避免失败时破坏可安装产物。
import { mkdir, lstat, readdir, readFile, realpath, symlink, writeFile } from "node:fs/promises";
import { contract } from "../../../tools/build/paths.mjs";
import { build } from "esbuild";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = join(root, "src");
const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const outputDirectory = join(contract.dev, manifest.name.replaceAll("/", "__"), "lib");
const stagingDirectory = outputDirectory;
await mkdir(outputDirectory, { recursive: true });
/**
 * 被 minify 抹掉的第三方版权声明按 esbuild metafile 逐个补回文件尾部。
 * 宿主在运行时提供的模块（@deepseek-ai/*、react/react-dom 别名到 shim）不进包，也就不列入。
 */
async function bundledLicenseNotice(metafile) {
	const directories = new Map();
	for (const input of Object.keys(metafile.inputs)) {
		const match = input.replaceAll("\\", "/").match(/^(.*node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?((?:@[^/]+\/)?[^/]+))\//);
		if (match === null || match[2].startsWith("@deepseek-ai/")) continue;
		if (!directories.has(match[2])) directories.set(match[2], match[1]);
	}
	const blocks = [];
	for (const [name, directory] of [...directories].sort(([left], [right]) => left < right ? -1 : 1)) {
		const file = (await readdir(directory)).find((entry) => /^licen[sc]e/i.test(entry));
		if (file === undefined) {
			const manifest = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
			blocks.push(`${name}\n\n${typeof manifest.license === "string" ? manifest.license : "see package.json"} (declared in package.json)`);
			continue;
		}
		blocks.push(`${name}\n\n${(await readFile(join(directory, file), "utf8")).trim()}`);
	}
	const lines = ["/*!", `Third-party notices for the ${blocks.length} packages bundled into this file.`, "", blocks.join("\n\n"), "*/"];
	return lines.join("\n");
}

await build({
		entryPoints: ["contracts.ts", "index.ts", "workspace.ts", "projcache.ts", "host-install.ts", "tombstone.ts", "plugin-updater.ts", "release-age.ts", "archive-experience.ts", "archive-organizer.ts", "archive-discovery.ts", "session-repair.ts"].map((file) => join(sourceDirectory, file)),
		outdir: stagingDirectory,
		outbase: sourceDirectory,
		bundle: false,
		format: "esm",
		platform: "node",
		target: "node20"
	});

	const clientBundle = await build({
		entryPoints: [join(sourceDirectory, "client.ts")],
		bundle: true,
		format: "cjs",
		platform: "browser",
		target: "es2022",
		external: ["@deepseek-ai/dsh-client-ui-primitives"],
		write: false,
		minify: true,
		keepNames: true,
		legalComments: "none",
		metafile: true,
		define: { "process.env.NODE_ENV": "\"production\"" },
		alias: {
			react: join(sourceDirectory, "host-react-shim.ts"),
			"react/jsx-runtime": join(sourceDirectory, "host-jsx-shim.ts"),
			"react-dom": join(sourceDirectory, "host-react-dom-shim.ts"),
			"react-dom/client": join(sourceDirectory, "host-react-dom-shim.ts")
		}
	});
	const clientSource = clientBundle.outputFiles[0].text;
	const thirdPartyNotices = await bundledLicenseNotice(clientBundle.metafile);
	await writeFile(join(stagingDirectory, "client.js"), `window.__ModuleLoader__.load({
  id: "@michengai/dsh-archive-manager",
  factory: function(require) {
    globalThis.__dshArchiveReact = require("react");
    globalThis.__dshArchiveJsx = require("react/jsx-runtime");
    globalThis.__dshArchiveReactDOM = require("react-dom");
    globalThis.__dshArchiveReactDOMClient = require("react-dom/client");
    var module = { exports: {} };
    var exports = module.exports;
    ${clientSource}
    return module.exports.startArchiveClient(require);
  }
});
${thirdPartyNotices}
`);

const link = join(root, "lib");
const existing = await lstat(link).catch(error => { if (error.code !== "ENOENT") throw error; });
if (existing) {
  if (!existing.isSymbolicLink() || await realpath(link) !== await realpath(outputDirectory)) throw new Error("Unknown archive-manager output path; preserve it before building");
} else await symlink(outputDirectory, link, process.platform === "win32" ? "junction" : "dir");
console.log("[dsh-archive-manager] Host and Client output: " + outputDirectory);
