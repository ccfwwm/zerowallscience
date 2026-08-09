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
    version: "env-2026.08.08.1",
    target: "x86_64-pc-windows-msvc",
    assetName: "zerowall-environment-x86_64-pc-windows-msvc.tar.gz",
    assetUrl: "https://zerowall.chengxunkeji.cn/environment/env-2026.08.08.1/x86_64-pc-windows-msvc/environment.tar.gz",
    sha256: "a".repeat(64),
    sizeBytes: 123,
  });
  assert.equal(payload.schema, "zerowall.science/environment/v1");
  assert.equal(payload.target, "x86_64-pc-windows-msvc");
  assert.equal(payload.components[0].archive, "tarGz");
  assert.equal(payload.healthChecks[0].executable, "opencode.exe");
  const pythonCheck = payload.healthChecks.find((check) => check.executable.includes("mcp-python"));
  assert.deepEqual(pythonCheck?.args.slice(0, 2), ["-s", "-c"]);
  const pythonProbe = pythonCheck?.args[2] ?? "";
  assert.match(pythonProbe, /MP_API_KEY/);
  assert.match(pythonProbe, /FRED_API_KEY/);
  for (const moduleName of [
    "paper_search_mcp.server",
    "biomcp",
    "mcp_materials",
    "fred_mcp.main",
    "spaceweather_mcp.server",
    "mcp_weather_server",
    "usgs_mcp.server",
    "uniprot_mcp.server",
    "wikipedia_mcp",
  ]) {
    assert.ok(pythonProbe.includes(moduleName), `health probe must import ${moduleName}`);
  }
});

test("rejects latest and non-versioned bundle URLs", () => {
  assert.throws(
    () => buildEnvironmentPayload({
      version: "env-2026.08.08.1",
      target: "x86_64-pc-windows-msvc",
      assetName: "environment.tar.gz",
      assetUrl: "https://zerowall.chengxunkeji.cn/environment/latest/environment.tar.gz",
      sha256: "a".repeat(64),
      sizeBytes: 123,
    }),
    /versioned environment path/,
  );
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
