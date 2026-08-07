import { createPrivateKey, sign } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const ENVELOPE_SCHEMA = "zerowall.science/app-update-envelope/v1";
const PAYLOAD_SCHEMA = "zerowall.science/app-update/v1";
const ED25519_PKCS8_SEED_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

export function createEd25519PrivateKey(seed) {
  if (!Buffer.isBuffer(seed) || seed.length !== 32) {
    throw new Error("Ed25519 private seed must be exactly 32 bytes");
  }
  return createPrivateKey({
    key: Buffer.concat([ED25519_PKCS8_SEED_PREFIX, seed]),
    format: "der",
    type: "pkcs8",
  });
}

export function buildApplicationPayload({ version, target, assetName, assetUrl, sha256, sizeBytes }) {
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(version)) throw new Error("invalid application version");
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(target)) throw new Error("invalid target triple");
  if (typeof assetName !== "string" || assetName.length === 0 || assetName.length > 256 || assetName === "." || assetName === ".." || /[\\/:\u0000-\u001f\u007f]/.test(assetName)) {
    throw new Error("invalid application asset name");
  }
  const url = new URL(assetUrl);
  if (url.protocol !== "https:") throw new Error("application asset URL must use HTTPS");
  if (!/^[a-fA-F0-9]{64}$/.test(sha256)) throw new Error("invalid application SHA-256");
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) throw new Error("invalid application size");
  return {
    schema: PAYLOAD_SCHEMA,
    version,
    target,
    asset: { name: assetName, url: assetUrl, sha256: sha256.toLowerCase(), sizeBytes },
  };
}

export function signApplicationEnvelope(payload, privateSeedBase64) {
  const seed = Buffer.from(privateSeedBase64 ?? "", "base64");
  const privateKey = createEd25519PrivateKey(seed);
  return {
    schema: ENVELOPE_SCHEMA,
    payload,
    signature: sign(null, Buffer.from(payload), privateKey).toString("base64"),
  };
}

function parseArgs(args) {
  const values = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || value === undefined) throw new Error(`invalid argument near ${key ?? "end"}`);
    values.set(key.slice(2), value);
  }
  return values;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const output = args.get("output");
  if (!output) throw new Error("--output is required");
  const payload = buildApplicationPayload({
    version: args.get("version"),
    target: args.get("target"),
    assetName: args.get("asset-name"),
    assetUrl: args.get("asset-url"),
    sha256: args.get("sha256"),
    sizeBytes: Number(args.get("size")),
  });
  const envelope = signApplicationEnvelope(JSON.stringify(payload), process.env.ZEROWALL_APP_UPDATE_PRIVATE_KEY);
  await writeFile(output, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
