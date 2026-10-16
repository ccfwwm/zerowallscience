import { execFileSync } from 'node:child_process';
import { access, cp, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { relative, resolve } from "node:path";
import { build, type Plugin } from "esbuild";

import { isLocalArtifactPath } from "../build-path-policy.js";

const root = resolve(import.meta.dirname, "..");
const packageRoot = root;
// Typert generation writes into this package's source lib directory.  The
// bundle candidate is the only output that is later promoted to artifacts/dev.
const generatedRoot = resolve(packageRoot, "lib");
const finalRoot = resolve(root, "../../artifacts/dev/@oh-story__dsh/lib");
const outputRoot = `${finalRoot}.candidate-${randomUUID()}`;
const inlineCss: Plugin = {
  name: "inline-css",
  setup(builder) {
    builder.onResolve({ filter: /\.css\?inline$/ }, (args) => ({
      path: resolve(args.resolveDir, args.path.slice(0, -"?inline".length)),
      namespace: "inline-css"
    }));
    builder.onLoad({ filter: /.*/, namespace: "inline-css" }, async (args) => ({
      contents: await readFile(args.path, "utf8"),
      loader: "text"
    }));
  }
};

execFileSync(process.execPath, [resolve(root, '../../tools/plugins/generate-typert.mjs'), '--plugin', '@oh-story/dsh'], { cwd: resolve(root, '../..'), stdio: 'inherit' });
await mkdir(outputRoot, { recursive: true });
for (const file of ['typert.host.js','typert.host.d.ts','typert.remote-client.js','typert.remote-client.d.ts','typert.remote-client.d.ts.map']) await cp(resolve(generatedRoot,file), resolve(outputRoot,file));

await build({
  entryPoints: [resolve(packageRoot, "src/index.ts")],
  outfile: resolve(outputRoot, "index.js"),
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node24",
  sourcemap: true,
  treeShaking: true,
  packages: "bundle",
  external: ["@deepseek-ai/*", "@zerowallscience/*"]
});

const hostEntry = resolve(outputRoot, "index.js");
await writeFile(hostEntry, (await readFile(hostEntry, "utf8")).replace(/[\t ]+$/gmu, ""));

await build({
  // Mount this package's generated Remote contribution before activating the
  // feature which requires remote.zerowallMediaStudio. Exporting ./remote alone
  // does not mount its namespace in DSH's browser Context.
  stdin: {
    contents: `import * as feature from './src/client/index.tsx';
import contribution from './lib/typert.remote-client.js';
export * from './src/client/index.tsx';
export const inject = ['remote'];
export async function apply(ctx, config) {
  const dispose = await ctx.remote.$mount(contribution);
  try { ctx.plugin(feature, config); } catch (error) { await dispose(); throw error; }
  return dispose;
}`,
    resolveDir: packageRoot,
    sourcefile: 'media-client-entry.js',
    loader: 'js',
  },
  outfile: resolve(outputRoot, "client.js"),
  bundle: true,
  format: "cjs",
  platform: "browser",
  target: ["chrome120", "safari17"],
  nodePaths: [resolve(packageRoot, 'node_modules')],
  sourcemap: true,
  treeShaking: true,
  define: { "process.env.NODE_ENV": '"production"' },
  minify: true,
  external: ["@deepseek-ai/*", "react", "react/jsx-runtime", "react-dom", "react-dom/client"],
  plugins: [inlineCss],
  banner: { js: "window.__ModuleLoader__.load({id:\"@oh-story/dsh\",factory:(require)=>{var module={exports:{}};var exports=module.exports;" },
  footer: { js: ";return module.exports;}});" }
});

await cp(resolve(root, 'knowledge/media-create'), resolve(outputRoot, 'media-create'), { recursive: true, filter: source => !isLocalArtifactPath(resolve(root, 'knowledge/media-create'), source) });

const hostBundle = await readFile(hostEntry, "utf8");
for (const forbidden of ["dsh-sdk-jsonrpc", "DeepSeekHarness", "FakeRuntimeAdapter", "NativeDshRuntimeAdapter", "EventSource"]) {
  if (hostBundle.includes(forbidden)) {
    throw new Error(`Native DSH plugin bundle retained forbidden parallel runtime code: ${forbidden}`);
  }
}

const clientEntry = resolve(outputRoot, "client.js");
const clientBundle = await readFile(clientEntry, "utf8");
for (const forbidden of ["react-dom.development", "react.development", "process.env.NODE_ENV"]) {
  if (clientBundle.includes(forbidden)) {
    throw new Error(`Browser bundle retained development runtime code: ${forbidden}`);
  }
}
const clientBytes = Buffer.byteLength(clientBundle);
if (clientBytes > 400_000) {
  throw new Error(`Browser bundle exceeds the 400 KB release budget: ${String(clientBytes)} bytes`);
}

// Build and validate a complete candidate before swapping owned generated
// output. Retain the previous generation for diagnosis; never remove sources.
const previousRoot = `${finalRoot}.previous-${randomUUID()}`;
async function swap(from: string, to: string) {
  for (let attempt = 0; ; attempt++) {
    try { await rename(from, to); return; }
    catch (error) {
      if (process.platform !== "win32" || !["EPERM", "EACCES", "EBUSY"].includes((error as NodeJS.ErrnoException).code ?? "") || attempt >= 9) throw error;
      await delay(100 * (attempt + 1));
    }
  }
}
let previous = false;
try { await swap(finalRoot, previousRoot); previous = true; }
catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
try { await swap(outputRoot, finalRoot); }
catch (error) { if (previous) await swap(previousRoot, finalRoot); throw error; }
