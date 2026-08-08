import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import qiniu from "qiniu";

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

export async function uploadObject(filePath, objectKey, contentType, env = process.env, options = {}) {
  const config = qiniuConfig(env);
  const contents = await readFile(filePath);
  const mac = new qiniu.auth.digest.Mac(config.accessKey, config.secretKey);
  const sdkConfig = new qiniu.conf.Config();
  if (qiniu.zone?.Zone_z2 && config.uploadUrl === "https://up-z2.qiniup.com") sdkConfig.zone = qiniu.zone.Zone_z2;
  const putPolicyOptions = { scope: `${config.bucket}:${objectKey}`, expires: 600 };
  if (options.insertOnly !== false) putPolicyOptions.insertOnly = 1;
  const putPolicy = new qiniu.rs.PutPolicy(putPolicyOptions);
  const token = putPolicy.uploadToken(mac);
  const result = await new Promise((resolve, reject) => {
    if (contents.length >= 100 * 1024 * 1024) {
      const uploader = new qiniu.resume_up.ResumeUploader(sdkConfig);
      const extra = new qiniu.resume_up.PutExtra();
      uploader.putFileV2(token, objectKey, filePath, extra, (error, body, info) => {
        if (error || !info || info.statusCode >= 400) reject(new Error(`Qiniu upload failed for ${objectKey}: ${error?.message ?? info?.statusCode ?? "unknown"}`));
        else resolve(body);
      });
      return;
    }
    const uploader = new qiniu.form_up.FormUploader(sdkConfig);
    const extra = new qiniu.form_up.PutExtra();
    extra.mimeType = contentType;
    uploader.putFile(token, objectKey, filePath, extra, (error, body, info) => {
      if (error || !info || info.statusCode >= 400) reject(new Error(`Qiniu upload failed for ${objectKey}: ${error?.message ?? info?.statusCode ?? "unknown"}`));
      else resolve(body);
    });
  });
  return { key: objectKey, url: publicUrl(config.domain, objectKey), size: contents.length, sha256: sha256(contents), result };
}

function required(value, name) { if (!value?.trim()) throw new Error(`${name} is required`); return value.trim(); }

if (process.argv[1]?.endsWith("upload-qiniu-object.mjs")) {
  const [filePath, objectKey] = process.argv.slice(2);
  if (!filePath || !objectKey) throw new Error("Usage: node scripts/upload-qiniu-object.mjs <file> <object-key>");
  uploadObject(filePath, objectKey, "application/octet-stream").then((result) => console.log(`Uploaded ${result.url}`));
}
