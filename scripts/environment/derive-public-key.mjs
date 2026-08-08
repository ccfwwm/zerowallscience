import { createPrivateKey, createPublicKey } from "node:crypto";

const seed = Buffer.from(process.env.ZEROWALL_ENV_UPDATE_PRIVATE_KEY ?? "", "base64");
if (seed.length !== 32) throw new Error("ZEROWALL_ENV_UPDATE_PRIVATE_KEY must contain a base64 Ed25519 seed");

const prefix = Buffer.from("302e020100300506032b657004220420", "hex");
const privateKey = createPrivateKey({
  key: Buffer.concat([prefix, seed]),
  format: "der",
  type: "pkcs8",
});
const publicKey = createPublicKey(privateKey).export({ format: "der", type: "spki" });
process.stdout.write(publicKey.subarray(-32).toString("base64"));
