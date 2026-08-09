import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  REQUIRED_ENVIRONMENT_TARGETS,
  mergePromotionTargets,
  validatePromotionManifests,
} from "./qiniu-release.mjs";

function manifest(version, target) {
  return {
    target,
    envelope: {
      schema: "zerowall.science/environment-envelope/v1",
      payload: JSON.stringify({
        schema: "zerowall.science/environment/v1",
        version,
        target,
      }),
      signature: "test-signature",
    },
  };
}

test("full environment promotion requires every supported target", () => {
  const version = "env-2026.08.09.1";
  assert.equal(
    validatePromotionManifests(
      version,
      REQUIRED_ENVIRONMENT_TARGETS.map((target) => manifest(version, target)),
    ).length,
    REQUIRED_ENVIRONMENT_TARGETS.length,
  );
  assert.throws(
    () => validatePromotionManifests(version, [manifest(version, REQUIRED_ENVIRONMENT_TARGETS[0])]),
    /requires exactly/,
  );
});

test("promotion rejects mixed versions and target spoofing", () => {
  const target = "x86_64-pc-windows-msvc";
  assert.throws(
    () => validatePromotionManifests("env-2", [manifest("env-1", target)], false),
    /version mismatch/,
  );
  const spoofed = manifest("env-2", target);
  spoofed.target = "x86_64-unknown-linux-gnu";
  assert.throws(
    () => validatePromotionManifests("env-2", [spoofed], false),
    /target mismatch/,
  );
});

test("promotion rejects duplicate and unsupported targets", () => {
  const version = "env-2";
  const target = "x86_64-pc-windows-msvc";
  assert.throws(
    () => validatePromotionManifests(version, [manifest(version, target), manifest(version, target)], false),
    /duplicate target/,
  );
  assert.throws(
    () => validatePromotionManifests(version, [manifest(version, "unsupported-target")], false),
    /unsupported environment target/,
  );
});

test("single-target promotion preserves existing platform entries", () => {
  const existing = {
    "aarch64-apple-darwin": { manifestUrl: "mac", manifestSha256: "aaa" },
    "x86_64-pc-windows-msvc": { manifestUrl: "old", manifestSha256: "bbb" },
  };
  const replacement = {
    "x86_64-pc-windows-msvc": { manifestUrl: "new", manifestSha256: "ccc" },
  };

  assert.deepEqual(mergePromotionTargets(existing, replacement), {
    "aarch64-apple-darwin": existing["aarch64-apple-darwin"],
    "x86_64-pc-windows-msvc": replacement["x86_64-pc-windows-msvc"],
  });
});

test("app latest metadata is promoted only after the installer is publicly verified", async () => {
  const source = await readFile(new URL("./release-local.mjs", import.meta.url), "utf8");
  const uploadInstaller = source.indexOf("await uploadObject(installer");
  const verifyInstaller = source.indexOf("await verifyObject(url, info.size, digest)");
  const uploadLatest = source.indexOf('await uploadObject(temp, "releases/latest.json"');
  const verifyLatest = source.indexOf("await verifyAppReleaseMetadata(latestUrl");

  assert.ok(uploadInstaller >= 0);
  assert.ok(uploadInstaller < verifyInstaller);
  assert.ok(verifyInstaller < uploadLatest);
  assert.ok(uploadLatest < verifyLatest);
});
