import { createHash, createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";

export function qiniuConfig(env = process.env) {
  return {
    accessKey: required(env.QINIU_ACCESS_KEY, "QINIU_ACCESS_KEY"),
    secretKey: required(env.QINIU_SECRET_KEY, "QINIU_SECRET_KEY"),
    bucket: required(env.QINIU_BUCKET, "QINIU_BUCKET"),
    uploadUrl: (env.QINIU_UPLOAD_URL || "https://up-z2.qiniup.com").replace(/\/+$/, ""),
    domain: (env.QINIU_DOMAIN || "https://zerowall.chengxunkeji.cn").replace(/\/+$/, ""),
  };
}

export function publicUrl(domain, key) {
  return `${domain.replace(/\/+$/, "")}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

export function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }

export async function uploadObject(filePath, objectKey, contentType, env = process.env) {
  const config = qiniuConfig(env);
  const contents = await readFile(filePath);
  const policy = base64Url(JSON.stringify({ scope: `${config.bucket}:${objectKey}`, deadline: Math.floor(Date.now() / 1000) + 600 }));
  const signature = createHmac("sha1", config.secretKey).update(policy).digest("base64").replace(/\+/g, "-").replace(/\//g, "_");
  const form = new FormData();
  form.set("token", `${config.accessKey}:${signature}:${policy}`);
  form.set("key", objectKey);
  form.set("file", new Blob([contents], { type: contentType }), objectKey.split("/").at(-1));
  const response = await fetch(config.uploadUrl, { method: "POST", body: form });
  if (!response.ok) throw new Error(`Qiniu upload failed for ${objectKey}: HTTP ${response.status}`);
  return { key: objectKey, url: publicUrl(config.domain, objectKey), size: contents.length, sha256: sha256(contents) };
}

function required(value, name) { if (!value?.trim()) throw new Error(`${name} is required`); return value.trim(); }
function base64Url(value) { return Buffer.from(value).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }

if (process.argv[1]?.endsWith("upload-qiniu-object.mjs")) {
  const [filePath, objectKey] = process.argv.slice(2);
  if (!filePath || !objectKey) throw new Error("Usage: node scripts/upload-qiniu-object.mjs <file> <object-key>");
  uploadObject(filePath, objectKey, "application/octet-stream").then((result) => console.log(`Uploaded ${result.url}`));
}
