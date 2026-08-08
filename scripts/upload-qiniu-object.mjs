import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";

const [filePath, objectKey] = process.argv.slice(2);
if (!filePath || !objectKey) throw new Error("Usage: node scripts/upload-qiniu-object.mjs <file> <object-key>");
const accessKey = required(process.env.QINIU_ACCESS_KEY, "QINIU_ACCESS_KEY");
const secretKey = required(process.env.QINIU_SECRET_KEY, "QINIU_SECRET_KEY");
const bucket = required(process.env.QINIU_BUCKET, "QINIU_BUCKET");
const uploadUrl = process.env.QINIU_UPLOAD_URL ?? "https://up-z2.qiniup.com";
const contents = await readFile(filePath);
const policy = base64Url(JSON.stringify({ scope: `${bucket}:${objectKey}`, deadline: Math.floor(Date.now() / 1000) + 600 }));
const signature = createHmac("sha1", secretKey).update(policy).digest("base64").replace(/\+/g, "-").replace(/\//g, "_");
const form = new FormData();
form.set("token", `${accessKey}:${signature}:${policy}`);
form.set("key", objectKey);
form.set("file", new Blob([contents]), objectKey.split("/").at(-1));
const response = await fetch(uploadUrl, { method: "POST", body: form });
if (!response.ok) throw new Error(`Qiniu upload failed for ${objectKey}: HTTP ${response.status}`);

function required(value, name) { if (!value?.trim()) throw new Error(`${name} is required`); return value.trim(); }
function base64Url(value) { return Buffer.from(value).toString("base64").replace(/\+/g, "-").replace(/\//g, "_"); }
