import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { publicUrl, qiniuConfig, uploadObject } from "./upload-qiniu-object.mjs";
import { signEnvironmentEnvelope } from "./environment/build-manifest.mjs";

export async function verifyObject(url, expectedSize, expectedSha256) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`public object verification failed: HTTP ${response.status} ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (bytes.length !== Number(expectedSize)) throw new Error(`size mismatch for ${url}`);
  if (actual !== expectedSha256.toLowerCase()) throw new Error(`SHA-256 mismatch for ${url}`);
  return { url, size: bytes.length, sha256: actual };
}

export async function promoteLatest({ version, manifests, env = process.env }) {
  const config = qiniuConfig(env);
  const targets = Object.fromEntries(manifests.map((manifest) => [manifest.target, {
      manifestUrl: publicUrl(config.domain, `environment/latest/${manifest.target}.json`),
      versionedManifestUrl: publicUrl(config.domain, `environment/${version}/${manifest.target}/ZeroWall-Environment-${manifest.target}.tar.gz.json`),
  }]));
  const immutableTargets = Object.fromEntries(
    manifests.map((manifest) => [manifest.target, {
      manifestUrl: targets[manifest.target].versionedManifestUrl,
      manifestSha256: sha256(Buffer.from(`${JSON.stringify(manifest.envelope, null, 2)}\n`)),
    }]),
  );
  const indexPayload = JSON.stringify({ schema: "zerowall.science/environment-index/v1", version, targets: immutableTargets });
  const signedIndex = signEnvironmentEnvelope(indexPayload, env.ZEROWALL_ENV_UPDATE_PRIVATE_KEY);
  const indexBytes = Buffer.from(`${JSON.stringify(signedIndex, null, 2)}\n`);
  const temp = `${process.env.TEMP || "."}/zerowall-environment-index-${Date.now()}.json`;
  await writeFile(temp, indexBytes);
  await uploadObject(temp, "environment/latest/index.json", "application/json", env);
  for (const manifest of manifests) {
    const manifestBytes = Buffer.from(`${JSON.stringify(manifest.envelope, null, 2)}\n`);
    const path = `${process.env.TEMP || "."}/zerowall-environment-${manifest.target}.json`;
    await writeFile(path, manifestBytes);
    await uploadObject(path, `environment/latest/${manifest.target}.json`, "application/json", env);
    await verifyObject(publicUrl(config.domain, `environment/latest/${manifest.target}.json`), manifestBytes.length, sha256(manifestBytes));
  }
  await verifyObject(publicUrl(config.domain, "environment/latest/index.json"), indexBytes.length, sha256(indexBytes));
  return publicUrl(config.domain, "environment/latest/index.json");
}

export function manifestTarget(envelope) {
  const payload = typeof envelope.payload === "string" ? JSON.parse(envelope.payload) : envelope.payload;
  const target = payload?.target;
  if (typeof target !== "string" || !target) throw new Error("environment manifest target is missing");
  return target;
}

const [command, ...args] = process.argv.slice(2);
if (command === "verify") {
  const [url, size, digest] = args;
  verifyObject(url, size, digest).then(() => console.log(`Verified ${url}`));
}
if (command === "promote") {
  const [version, ...manifestPaths] = args;
  Promise.all(manifestPaths.map(async (argument) => {
    const separator = argument.indexOf("=");
    if (separator < 1) throw new Error("manifest arguments must use target=path");
    const path = argument.slice(separator + 1);
    return { target: argument.slice(0, separator), envelope: JSON.parse(await readFile(path, "utf8")) };
  }))
    .then((manifests) => promoteLatest({ version, manifests }))
    .then((url) => console.log(`Promoted ${url}`));
}

function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
