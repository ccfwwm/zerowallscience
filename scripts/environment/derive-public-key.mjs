import { createPrivateKey, createPublicKey } from "node:crypto";

const prefix = Buffer.from("302e020100300506032b657004220420", "hex");
export function derivePublicKey(privateSeedBase64) {
  const seed = Buffer.from(privateSeedBase64 ?? "", "base64");
  if (seed.length !== 32) throw new Error("ZEROWALL_ENV_UPDATE_PRIVATE_KEY must contain a base64 Ed25519 seed");
  const privateKey = createPrivateKey({ key: Buffer.concat([prefix, seed]), format: "der", type: "pkcs8" });
  const publicKey = createPublicKey(privateKey).export({ format: "der", type: "spki" });
  return publicKey.subarray(-32).toString("base64");
}

if (process.argv[1]?.endsWith("derive-public-key.mjs")) {
  process.stdout.write(derivePublicKey(process.env.ZEROWALL_ENV_UPDATE_PRIVATE_KEY));
}
