/**
 * Build the host faces (service entry + typert/remote artifacts) as ESM for
 * Node. @deepseek-ai/* and ssh2 stay external (resolved from the profile's
 * node_modules at runtime); zod is bundled so the plugin pins its own copy.
 */
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

await build({
  entryPoints: [
    resolve(rootDir, "src/index.js"),
    resolve(rootDir, "src/typert.js"),
    resolve(rootDir, "src/remote.js")
  ],
  outdir: resolve(rootDir, "lib"),
  format: "esm",
  platform: "node",
  target: "node20",
  bundle: true,
  sourcemap: false,
  // DB drivers stay external: their internal require("node:buffer") etc. breaks
  // when esbuild rewrites CJS to ESM. Loaded as native CJS from node_modules at
  // runtime, same as ssh2. pg-cursor must stay here too: bundling it inlines
  // deep requires of "pg/lib/result.js" which have no ESM import mapping and
  // crash the host loader at plugin import time (0.2.15 boot crash).
  external: ["@deepseek-ai/*", "ssh2", "mysql2", "pg", "pg-cursor", "redis", "mongodb"],
  logLevel: "info"
});
for (const file of ["index.js", "typert.js", "remote.js"]) {
  const path = resolve(rootDir, "lib", file);
  writeFileSync(path, readFileSync(path, "utf8").replace(/[ \t]+$/gm, ""), "utf8");
}
console.log("build-host: wrote lib/index.js, lib/typert.js, lib/remote.js");
