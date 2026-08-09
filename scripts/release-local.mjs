import { createHash } from "node:crypto";
import { access, readdir, stat, readFile, writeFile } from "node:fs/promises";
import { createReadStream, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { uploadObject, publicUrl } from "./upload-qiniu-object.mjs";
import { promoteLatest, verifyObject } from "./qiniu-release.mjs";
import { derivePublicKey } from "./environment/derive-public-key.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = parseArgs(process.argv.slice(2));
const version = args.version ?? readVersion();
const dryRun = args.dryRun === true;
const mode = args.mode ?? "app";

if (!["app", "environment", "all"].includes(mode)) fail("--mode must be app, environment, or all");
if (!/^\d+\.\d+\.\d+$/.test(version) && mode !== "environment") fail("--version must be MAJOR.MINOR.PATCH for app releases");

const qiniuEnv = {
  ...process.env,
  QINIU_BUCKET: process.env.QINIU_BUCKET ?? "zerowallscience",
  QINIU_REGION: process.env.QINIU_REGION ?? "z2",
  QINIU_UPLOAD_URL: process.env.QINIU_UPLOAD_URL ?? "https://up-z2.qiniup.com",
  QINIU_DOMAIN: process.env.QINIU_DOMAIN ?? "https://zerowall.chengxunkeji.cn",
};
if (!qiniuEnv.ZEROWALL_ENV_UPDATE_PUBLIC_KEY && qiniuEnv.ZEROWALL_ENV_UPDATE_PRIVATE_KEY) {
  qiniuEnv.ZEROWALL_ENV_UPDATE_PUBLIC_KEY = derivePublicKey(qiniuEnv.ZEROWALL_ENV_UPDATE_PRIVATE_KEY);
}
qiniuEnv.ZEROWALL_ENV_MANIFEST_URL ??= `${qiniuEnv.QINIU_DOMAIN}/environment/latest/index.json`;
if ((mode === "app" || mode === "all") && !qiniuEnv.ZEROWALL_ENV_UPDATE_PUBLIC_KEY) {
  fail("ZEROWALL_ENV_UPDATE_PUBLIC_KEY or ZEROWALL_ENV_UPDATE_PRIVATE_KEY is required for desktop builds");
}
if (!dryRun) for (const name of ["QINIU_ACCESS_KEY", "QINIU_SECRET_KEY"]) if (!qiniuEnv[name]) fail(`${name} is required in the environment`);

if (mode === "app" || mode === "all") await publishApp();
if (mode === "environment" || mode === "all") await publishEnvironment();

async function publishApp() {
  let installer = args.installer;
  if (!installer) {
    if (process.platform !== "win32") fail("automatic app build currently supports Windows only; pass --installer on other platforms");
    await run("pnpm", ["--filter", "@zerowall/desktop", "tauri", "build", "--bundles", "nsis"], qiniuEnv);
    const bundleDirs = [
      join(root, "apps", "desktop", "src-tauri", "target", "release", "bundle", "nsis"),
      join(root, "apps", "desktop", "src-tauri", "target", "x86_64-pc-windows-msvc", "release", "bundle", "nsis"),
    ];
    const installers = [];
    for (const bundleDir of bundleDirs) {
      const files = await readdir(bundleDir).catch(() => []);
      installers.push(
        ...files
          .filter((file) => file.endsWith("-setup.exe") && file.includes(version))
          .map((file) => join(bundleDir, file)),
      );
    }
    if (installers.length !== 1) {
      fail(`expected one ${version} NSIS installer across ${bundleDirs.join(", ")}`);
    }
    installer = installers[0];
  }
  installer = resolve(installer);
  const info = await stat(installer);
  if (!info.isFile() || !installer.toLowerCase().endsWith(".exe")) fail("--installer must point to an existing .exe file");
  const key = `releases/${version}/${basename(installer)}`;
  const url = publicUrl(qiniuEnv.QINIU_DOMAIN, key);
  const digest = await sha256(installer);
  log(`app ${version}: ${installer}`);
  if (!dryRun) {
    await uploadObject(installer, key, "application/vnd.microsoft.portable-executable", qiniuEnv);
    await verifyObject(url, info.size, digest);
    const manifest = JSON.stringify({ version, url, name: `ZeroWall Science ${version}`, notes: process.env.ZEROWALL_RELEASE_NOTES ?? "修复基础环境安装限制，补充下载进度和更新提示。", publishedAt: new Date().toISOString(), assetUrl: url, assetName: basename(installer), assetSha256: digest, sizeBytes: info.size }, null, 2) + "\n";
    const temp = join(process.env.TEMP ?? ".", `zerowall-release-${version}-latest.json`);
    await writeFile(temp, manifest);
    await uploadObject(temp, "releases/latest.json", "application/json", qiniuEnv, { insertOnly: false });
    const latestUrl = publicUrl(qiniuEnv.QINIU_DOMAIN, "releases/latest.json");
    await verifyAppReleaseMetadata(latestUrl, {
      version,
      assetSha256: digest,
      sizeBytes: info.size,
      bytes: Buffer.from(manifest),
    });
    log(`verified ${url}`);
  }
}

async function verifyAppReleaseMetadata(latestUrl, expected) {
  const separator = latestUrl.includes("?") ? "&" : "?";
  const response = await fetch(`${latestUrl}${separator}verify=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) fail(`release metadata verification failed: HTTP ${response.status} ${latestUrl}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const expectedSha256 = createHash("sha256").update(expected.bytes).digest("hex");
  const actualSha256 = createHash("sha256").update(bytes).digest("hex");
  if (bytes.length !== expected.bytes.length || actualSha256 !== expectedSha256) {
    fail(`release metadata content mismatch for ${latestUrl}`);
  }
  const metadata = JSON.parse(bytes.toString("utf8"));
  if (
    metadata.version !== expected.version
    || metadata.assetSha256 !== expected.assetSha256
    || Number(metadata.sizeBytes) !== Number(expected.sizeBytes)
  ) {
    fail(`release metadata fields mismatch for ${latestUrl}`);
  }
}

async function publishEnvironment() {
  const dir = resolve(args.environmentDir ?? fail("--environment-dir is required for environment publishing"));
  const targets = ["aarch64-apple-darwin", "x86_64-apple-darwin", "x86_64-pc-windows-msvc", "x86_64-unknown-linux-gnu"];
  const manifests = [];
  for (const target of targets) {
    const prefix = `ZeroWall-Environment-${target}.tar.gz`;
    const archive = join(dir, prefix);
    const manifestPath = `${archive}.json`;
    const bootstrapper = join(dir, `ZeroWall-Environment-Bootstrapper-${target}${target.includes("windows") ? ".exe" : ""}`);
    for (const file of [archive, manifestPath, bootstrapper]) await access(file).catch(() => fail(`missing ${file}`));
    const versionKey = `environment/${version}/${target}`;
    log(`environment ${target}: ${archive}`);
    if (!dryRun) {
      const archiveInfo = await stat(archive);
      const archiveDigest = await sha256(archive);
      const archiveKey = `${versionKey}/${prefix}`;
      const manifestKey = `${versionKey}/${prefix}.json`;
      await uploadObject(archive, `${versionKey}/${prefix}`, "application/gzip", qiniuEnv);
      await uploadObject(manifestPath, manifestKey, "application/json", qiniuEnv);
      await uploadObject(bootstrapper, `${versionKey}/${basename(bootstrapper)}`, "application/octet-stream", qiniuEnv);
      await verifyObject(publicUrl(qiniuEnv.QINIU_DOMAIN, archiveKey), archiveInfo.size, archiveDigest);
      const manifestInfo = await stat(manifestPath);
      const manifestDigest = await sha256(manifestPath);
      await verifyObject(publicUrl(qiniuEnv.QINIU_DOMAIN, manifestKey), manifestInfo.size, manifestDigest);
      const envelope = JSON.parse(await readFile(manifestPath, "utf8"));
      manifests.push({ target, envelope });
    }
  }
  if (!dryRun) {
    await promoteLatest({ version, manifests, env: qiniuEnv });
    log(`promoted environment/latest for ${version}`);
  }
}

function parseArgs(values) {
  const result = {};
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (value === "--dry-run") result.dryRun = true;
    else if (value.startsWith("--") && values[i + 1] && !values[i + 1].startsWith("--")) result[value.slice(2).replaceAll("-", "")] = values[++i];
    else fail(`unknown argument ${value}`);
  }
  return result;
}

function readVersion() {
  return JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
}
function sha256(path) {
  return new Promise((resolveHash, reject) => { const hash = createHash("sha256"); createReadStream(path).on("error", reject).on("data", (chunk) => hash.update(chunk)).on("end", () => resolveHash(hash.digest("hex"))); });
}
function run(command, commandArgs, env = process.env) { return new Promise((resolveRun, reject) => { const child = spawn(command, commandArgs, { cwd: root, stdio: "inherit", env, shell: process.platform === "win32" }); child.on("error", reject); child.on("exit", (code) => code === 0 ? resolveRun() : reject(new Error(`${command} exited with ${code}`))); }); }
function log(message) { console.log(`[release-local] ${message}`); }
function fail(message) { throw new Error(message); }
