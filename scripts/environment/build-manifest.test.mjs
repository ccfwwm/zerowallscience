import assert from "node:assert/strict";
import { createPublicKey, verify } from "node:crypto";
import test from "node:test";
import {
  buildEnvironmentPayload,
  createEd25519PrivateKey,
  signEnvironmentEnvelope,
} from "./build-manifest.mjs";

const seed = Buffer.alloc(32, 7);

test("builds a target-specific environment payload", () => {
  const payload = buildEnvironmentPayload({
    version: "v0.4.57-env.1",
    target: "x86_64-pc-windows-msvc",
    assetName: "zerowall-environment-x86_64-pc-windows-msvc.tar.gz",
    assetUrl: "https://github.com/example/releases/download/v1/environment.tar.gz",
    sha256: "a".repeat(64),
    sizeBytes: 123,
  });
  assert.equal(payload.schema, "zerowall.science/environment/v1");
  assert.equal(payload.components[0].archive, "tarGz");
  assert.equal(payload.healthChecks[0].executable, "opencode.exe");
});

test("signs the exact serialized payload with an Ed25519 seed", () => {
  const payload = JSON.stringify({
    schema: "zerowall.science/environment/v1",
    version: "v1",
    components: [],
    healthChecks: [],
  });
  const envelope = signEnvironmentEnvelope(payload, seed.toString("base64"));
  const privateKey = createEd25519PrivateKey(seed);
  const publicKey = createPublicKey(privateKey);
  assert.equal(envelope.payload, payload);
  assert.equal(
    verify(null, Buffer.from(envelope.payload), publicKey, Buffer.from(envelope.signature, "base64")),
    true,
  );
});
