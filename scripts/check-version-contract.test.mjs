import assert from "node:assert/strict";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const script = "scripts/check-version-contract.mjs";
// Everything the check reads. The script resolves the repo root relative to
// itself, so a fixture holding these paths is a complete standalone repo.
const versionFiles = [
  "package.json",
  "apps/desktop/package.json",
  "apps/desktop/src-tauri/tauri.conf.json",
  "apps/desktop/src-tauri/Cargo.toml",
  "apps/desktop/src-tauri/Cargo.lock",
  "packages/sdk/package.json",
  "packages/shared/package.json",
];

async function buildFixture() {
  const fixture = await mkdtemp(resolve(tmpdir(), "zerowall-version-contract-"));
  for (const path of [script, ...versionFiles]) {
    const destination = resolve(fixture, path);
    await mkdir(dirname(destination), { recursive: true });
    await cp(resolve(root, path), destination);
  }
  return fixture;
}

function runCheck(fixture) {
  return spawnSync(process.execPath, [resolve(fixture, script)], { cwd: fixture, encoding: "utf8" });
}

test("a version bumped in tauri.conf.json alone violates the version contract", async () => {
  const fixture = await buildFixture();
  try {
    const path = "apps/desktop/src-tauri/tauri.conf.json";
    const target = resolve(fixture, path);
    const contents = await readFile(target, "utf8");
    const bumped = contents.replace(/"version":\s*"[^"]+"/, '"version": "99.0.0"');
    assert.notEqual(bumped, contents, `fixture ${path} declared no version to bump`);
    await writeFile(target, bumped);

    const result = runCheck(fixture);

    assert.notEqual(result.status, 0, `contract unexpectedly passed:\n${result.stdout}`);
    assert.match(result.stderr, /tauri\.conf\.json/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("a stale Cargo.lock left behind by a bump violates the version contract", async () => {
  const fixture = await buildFixture();
  try {
    const path = "apps/desktop/src-tauri/Cargo.lock";
    const target = resolve(fixture, path);
    const contents = await readFile(target, "utf8");
    // Rewrite only the workspace crate's own entry, the way a bump that never
    // re-ran `cargo build` leaves it. \r? because the lock file is CRLF here.
    const cargoToml = await readFile(resolve(fixture, "apps/desktop/src-tauri/Cargo.toml"), "utf8");
    const crate = /^\[package\][\s\S]*?^name\s*=\s*"([^"]+)"/m.exec(cargoToml)[1];
    const stale = contents.replace(
      new RegExp(`(name = "${crate}"\\r?\\nversion = ")[^"]+`),
      "$10.0.1",
    );
    assert.notEqual(stale, contents, `fixture ${path} has no [[package]] entry for ${crate}`);
    await writeFile(target, stale);

    const result = runCheck(fixture);

    assert.notEqual(result.status, 0, `contract unexpectedly passed:\n${result.stdout}`);
    assert.match(result.stderr, /Cargo\.lock/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
