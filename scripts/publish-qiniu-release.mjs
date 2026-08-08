import { createHash, createHmac } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { basename, resolve } from "node:path";

const domain = (process.env.QINIU_DOMAIN ?? "https://zerowall.chengxunkeji.cn").replace(/\/+$/, "");
const uploadUrl = process.env.QINIU_UPLOAD_URL ?? "https://up-z2.qiniup.com";
const accessKey = required(process.env.QINIU_ACCESS_KEY, "QINIU_ACCESS_KEY");
const secretKey = required(process.env.QINIU_SECRET_KEY, "QINIU_SECRET_KEY");
const bucket = required(process.env.QINIU_BUCKET, "QINIU_BUCKET");

const [installerArgument] = process.argv.slice(2);
if (!installerArgument) {
  throw new Error("Usage: node scripts/publish-qiniu-release.mjs <installer.exe>");
}

const installerPath = resolve(installerArgument);
const installerInfo = await stat(installerPath);
if (!installerInfo.isFile() || !installerPath.toLowerCase().endsWith(".exe")) {
  throw new Error("The release installer must be an existing .exe file");
}

const version = process.env.ZEROWALL_RELEASE_VERSION ?? "1.0.2";
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error("ZEROWALL_RELEASE_VERSION must be MAJOR.MINOR.PATCH");
}

const objectKey = `releases/${version}/${basename(installerPath)}`;
const installerUrl = `${domain}/${objectKey.split("/").map(encodeURIComponent).join("/")}`;
const installerBytes = await readFile(installerPath);
const manifest = JSON.stringify(
  {
    version,
    url: installerUrl,
    name: `ZeroWall Science ${version}`,
    publishedAt: new Date().toISOString(),
    assetUrl: installerUrl,
    assetName: basename(installerPath),
    assetSha256: createHash("sha256").update(installerBytes).digest("hex"),
    sizeBytes: installerInfo.size,
  },
  null,
  2,
);

await upload(objectKey, installerBytes, "application/vnd.microsoft.portable-executable");
await upload("releases/latest.json", Buffer.from(`${manifest}\n`), "application/json; charset=utf-8");

console.log(`Published ${installerUrl}`);
console.log(`Published ${domain}/releases/latest.json`);

function required(value, name) {
  if (!value?.trim()) throw new Error(`${name} is required`);
  return value.trim();
}

function base64Url(value) {
  return Buffer.from(value).toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
}

function uploadToken(key) {
  const policy = base64Url(
    JSON.stringify({ scope: `${bucket}:${key}`, deadline: Math.floor(Date.now() / 1000) + 600 }),
  );
  const signature = createHmac("sha1", secretKey).update(policy).digest("base64").replace(/\+/g, "-").replace(/\//g, "_");
  return `${accessKey}:${signature}:${policy}`;
}

async function upload(key, contents, contentType) {
  const form = new FormData();
  form.set("token", uploadToken(key));
  form.set("key", key);
  form.set("file", new Blob([contents], { type: contentType }), key.split("/").at(-1));
  const response = await fetch(uploadUrl, { method: "POST", body: form });
  if (!response.ok) throw new Error(`Qiniu upload failed for ${key}: HTTP ${response.status}`);
}
