import assert from "node:assert/strict";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");

test("an extra legacy literal in an allowed file violates the brand contract", async () => {
  const fixture = await mkdtemp(resolve(tmpdir(), "zerowall-brand-contract-"));
  try {
    const script = "scripts/check-brand-contract.mjs";
    const allowedFiles = [
      "apps/desktop/src-tauri/src/project.rs",
      "apps/desktop/src-tauri/src/runtime.rs",
    ];
    for (const path of [script, ...allowedFiles]) {
      const destination = resolve(fixture, path);
      await mkdir(dirname(destination), { recursive: true });
      await cp(resolve(root, path), destination);
    }
    const allowed = resolve(fixture, allowedFiles[0]);
    const contents = await readFile(allowed, "utf8");
    const forbiddenStore = [".open", "science"].join("");
    await writeFile(allowed, `${contents}\n// unexpected legacy store: ${forbiddenStore}\n`);

    const result = spawnSync(process.execPath, [resolve(fixture, script)], {
      cwd: fixture,
      encoding: "utf8",
    });

    assert.notEqual(result.status, 0, `contract unexpectedly passed:\n${result.stdout}`);
    assert.match(result.stderr, /project\.rs/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
