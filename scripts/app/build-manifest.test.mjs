import assert from "node:assert/strict";
import { createPublicKey, verify } from "node:crypto";
import test from "node:test";
import {
  buildApplicationPayload,
  createEd25519PrivateKey,
  signApplicationEnvelope,
} from "./build-manifest.mjs";

const seed = Buffer.alloc(32, 9).toString("base64");

test("builds a signed application payload with the installer digest", () => {
  const payload = buildApplicationPayload({
    version: "v0.4.58",
    target: "x86_64-pc-windows-msvc",
    assetName: "ZeroWall_x64-setup.exe",
    assetUrl: "https://github.com/example/releases/download/v0.4.58/ZeroWall_x64-setup.exe",
    sha256: "a".repeat(64),
    sizeBytes: 42,
  });
  assert.deepEqual(payload.asset, {
    name: "ZeroWall_x64-setup.exe",
    url: "https://github.com/example/releases/download/v0.4.58/ZeroWall_x64-setup.exe",
    sha256: "a".repeat(64),
    sizeBytes: 42,
  });
  assert.equal(payload.schema, "zerowall.science/app-update/v1");
});

test("signs the exact serialized application payload", () => {
  const payload = JSON.stringify(buildApplicationPayload({
    version: "v0.4.58",
    target: "x86_64-pc-windows-msvc",
    assetName: "ZeroWall_x64-setup.exe",
    assetUrl: "https://downloads.example/ZeroWall_x64-setup.exe",
    sha256: "b".repeat(64),
    sizeBytes: 11,
  }));
  const envelope = signApplicationEnvelope(payload, seed);
  const key = createPublicKey(createEd25519PrivateKey(Buffer.alloc(32, 9)));
  assert.equal(
    verify(null, Buffer.from(payload), key, Buffer.from(envelope.signature, "base64")),
    true,
  );
});
