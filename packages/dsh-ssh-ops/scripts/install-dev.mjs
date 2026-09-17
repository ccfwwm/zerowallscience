/**
 * Dev install helper: link this plugin into the web profile and register it as
 * a bundle. Equivalent to:
 *   dsh plugin --profile web add file:/path/to/dsh-ssh-ops -w
 */
import { execFileSync } from "node:child_process";
import { readdirSync, statSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Prefer the newest npx-cache dsh binary; fall back to PATH. */
function findDsh() {
  const cacheRoot = join(process.env.HOME ?? "", ".npm/_npx");
  try {
    const dirs = readdirSync(cacheRoot).filter((d) =>
      existsSync(join(cacheRoot, d, "node_modules/@deepseek-ai/dsh/lib/bin.js"))
    );
    if (dirs.length > 0) {
      dirs.sort((a, b) =>
        statSync(join(cacheRoot, b)).mtimeMs - statSync(join(cacheRoot, a)).mtimeMs
      );
      return join(cacheRoot, dirs[0], "node_modules/.bin/dsh");
    }
  } catch {}
  return "dsh";
}

const dsh = findDsh();
console.log(`install-dev: ${dsh} plugin --profile web add ${rootDir} -w`);
execFileSync(dsh, ["plugin", "--profile", "web", "add", rootDir, "-w"], { stdio: "inherit" });
console.log("install-dev: done. Restart dsh web for the plugin to load.");
