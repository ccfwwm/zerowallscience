import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const tauriDir = join(root, "apps", "desktop", "src-tauri");
const detectedTriple = process.platform === "win32"
  ? `${process.arch === "arm64" ? "aarch64" : "x86_64"}-pc-windows-msvc`
  : process.platform === "darwin"
    ? `${process.arch === "arm64" ? "aarch64" : "x86_64"}-apple-darwin`
    : `${process.arch === "arm64" ? "aarch64" : "x86_64"}-unknown-linux-gnu`;
const triple = process.argv[2] || detectedTriple;
const extension = process.platform === "win32" ? ".exe" : "";
const destination = join(tauriDir, "binaries", `zerowall-mcp-proxy-${triple}${extension}`);
// This intentionally stays outside src/bin: Cargo's Tauri build compiles every
// auto-discovered bin, and a sidecar there can be mistaken for the main app.
const source = join(tauriDir, "src", "mcp_proxy_main.rs");

mkdirSync(dirname(destination), { recursive: true });
const rustcArgs = ["--edition=2021", "-O"];
if (process.argv[2]) rustcArgs.push("--target", triple);
rustcArgs.push(source, "-o", destination);
const result = spawnSync("rustc", rustcArgs, {
  cwd: tauriDir,
  stdio: "inherit",
});
if (result.status !== 0) process.exit(result.status ?? 1);
