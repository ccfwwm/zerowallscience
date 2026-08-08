import { copyFileSync, mkdirSync } from "node:fs";
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
const proxyDir = join(tauriDir, "crates", "zerowall-mcp-proxy");
const manifest = join(proxyDir, "Cargo.toml");

mkdirSync(dirname(destination), { recursive: true });
const cargoArgs = ["build", "--manifest-path", manifest, "--release"];
if (process.argv[2]) cargoArgs.push("--target", triple);
const result = spawnSync("cargo", cargoArgs, {
  cwd: tauriDir,
  stdio: "inherit",
});
if (result.status !== 0) process.exit(result.status ?? 1);

const built = join(
  proxyDir,
  "target",
  ...(process.argv[2] ? [triple] : []),
  "release",
  `zerowall-mcp-proxy${extension}`,
);
copyFileSync(built, destination);
