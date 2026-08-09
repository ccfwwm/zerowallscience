import { createHash, createPublicKey, verify } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { publicUrl, qiniuConfig, uploadObject } from "./upload-qiniu-object.mjs";
import { signEnvironmentEnvelope } from "./environment/build-manifest.mjs";

export const REQUIRED_ENVIRONMENT_TARGETS = Object.freeze([
  "aarch64-apple-darwin",
  "x86_64-apple-darwin",
  "x86_64-pc-windows-msvc",
  "x86_64-unknown-linux-gnu",
]);

export function validatePromotionManifests(version, manifests, requireAllTargets = true) {
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(version)) throw new Error("invalid environment version");
  const seen = new Set();
  const validated = manifests.map((manifest) => {
    if (seen.has(manifest.target)) throw new Error(`duplicate target ${manifest.target}`);
    seen.add(manifest.target);
    if (!REQUIRED_ENVIRONMENT_TARGETS.includes(manifest.target)) {
      throw new Error(`unsupported environment target ${manifest.target}`);
    }
    const payload = typeof manifest.envelope?.payload === "string"
      ? JSON.parse(manifest.envelope.payload)
      : manifest.envelope?.payload;
    if (payload?.schema !== "zerowall.science/environment/v1") {
      throw new Error(`unsupported environment manifest for ${manifest.target}`);
    }
    if (payload.version !== version) {
      throw new Error(`environment manifest version mismatch for ${manifest.target}`);
    }
    if (payload.target !== manifest.target) {
      throw new Error(`environment manifest target mismatch for ${manifest.target}`);
    }
    return { ...manifest, payload };
  });
  if (requireAllTargets) {
    const actual = [...seen].sort();
    const required = [...REQUIRED_ENVIRONMENT_TARGETS].sort();
    if (actual.length !== required.length || actual.some((target, index) => target !== required[index])) {
      throw new Error(`full environment promotion requires exactly ${required.join(", ")}`);
    }
  }
  return validated;
}

export function mergePromotionTargets(existing, replacement) {
  return { ...existing, ...replacement };
}

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export function verifySignedEnvironmentEnvelope(envelope, publicKeyBase64) {
  if (envelope?.schema !== "zerowall.science/environment-envelope/v1") {
    throw new Error("unsupported environment envelope schema");
  }
  if (typeof envelope.payload !== "string" || typeof envelope.signature !== "string") {
    throw new Error("invalid signed environment envelope");
  }
  const rawKey = Buffer.from(publicKeyBase64 ?? "", "base64");
  if (rawKey.length !== 32) throw new Error("environment update public key is invalid");
  const key = createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, rawKey]),
    format: "der",
    type: "spki",
  });
  const signature = Buffer.from(envelope.signature, "base64");
  if (!verify(null, Buffer.from(envelope.payload), key, signature)) {
    throw new Error("environment envelope signature verification failed");
  }
  return JSON.parse(envelope.payload);
}

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
  manifests = validatePromotionManifests(version, manifests, true);
  const config = qiniuConfig(env);
  const immutableTargets = immutablePromotionTargets(config, version, manifests);
  await publishLatestTargetManifests(config, manifests, env);
  return publishLatestIndex(config, version, immutableTargets, env);
}

export async function promoteTargetLatest({ version, manifests, env = process.env }) {
  manifests = validatePromotionManifests(version, manifests, false);
  if (manifests.length !== 1) throw new Error("single-target promotion requires exactly one manifest");
  const config = qiniuConfig(env);
  const latestIndexUrl = publicUrl(config.domain, "environment/latest/index.json");
  const response = await fetch(latestIndexUrl);
  let existingTargets = {};
  if (response.ok) {
    const currentEnvelope = JSON.parse(await response.text());
    const current = verifySignedEnvironmentEnvelope(
      currentEnvelope,
      env.ZEROWALL_ENV_UPDATE_PUBLIC_KEY,
    );
    if (current?.schema !== "zerowall.science/environment-index/v1" || typeof current.targets !== "object") {
      throw new Error("unsupported existing environment index");
    }
    existingTargets = current.targets;
  } else if (response.status !== 404) {
    throw new Error(`existing environment index download failed: HTTP ${response.status}`);
  }
  const replacement = immutablePromotionTargets(config, version, manifests);
  await publishLatestTargetManifests(config, manifests, env);
  return publishLatestIndex(
    config,
    version,
    mergePromotionTargets(existingTargets, replacement),
    env,
  );
}

function immutablePromotionTargets(config, version, manifests) {
  return Object.fromEntries(manifests.map((manifest) => [manifest.target, {
    manifestUrl: publicUrl(config.domain, `environment/${version}/${manifest.target}/ZeroWall-Environment-${manifest.target}.tar.gz.json`),
    manifestSha256: sha256(Buffer.from(`${JSON.stringify(manifest.envelope, null, 2)}\n`)),
  }]));
}

async function publishLatestTargetManifests(config, manifests, env) {
  for (const manifest of manifests) {
    const manifestBytes = Buffer.from(`${JSON.stringify(manifest.envelope, null, 2)}\n`);
    const path = `${process.env.TEMP || "."}/zerowall-environment-${manifest.target}.json`;
    await writeFile(path, manifestBytes);
    await uploadObject(path, `environment/latest/${manifest.target}.json`, "application/json", env, { insertOnly: false });
    await verifyObject(publicUrl(config.domain, `environment/latest/${manifest.target}.json`), manifestBytes.length, sha256(manifestBytes));
  }
}

async function publishLatestIndex(config, version, targets, env) {
  const indexPayload = JSON.stringify({ schema: "zerowall.science/environment-index/v1", version, targets });
  const signedIndex = signEnvironmentEnvelope(indexPayload, env.ZEROWALL_ENV_UPDATE_PRIVATE_KEY);
  const indexBytes = Buffer.from(`${JSON.stringify(signedIndex, null, 2)}\n`);
  const temp = `${process.env.TEMP || "."}/zerowall-environment-index-${Date.now()}.json`;
  await writeFile(temp, indexBytes);
  await uploadObject(temp, "environment/latest/index.json", "application/json", env, { insertOnly: false });
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
if (command === "promote-target") {
  const [version, ...manifestPaths] = args;
  Promise.all(manifestPaths.map(async (argument) => {
    const separator = argument.indexOf("=");
    if (separator < 1) throw new Error("manifest arguments must use target=path");
    const path = argument.slice(separator + 1);
    return { target: argument.slice(0, separator), envelope: JSON.parse(await readFile(path, "utf8")) };
  }))
    .then((manifests) => promoteTargetLatest({ version, manifests }))
    .then((url) => console.log(`Promoted target in ${url}`));
}

function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
