import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowPath = new URL("../.github/workflows/release-environment.yml", import.meta.url);

test("environment releases use an independent callable workflow and versioned Qiniu keys", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const releaseScript = await readFile(new URL("./qiniu-release.mjs", import.meta.url), "utf8");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /workflow_call:/);
  assert.match(workflow, /environment\/\$\{ENVIRONMENT_VERSION\}\/\$\{TARGET\}/);
  assert.match(workflow, /environment\/latest\/index\.json/);
  assert.match(releaseScript, /environment\/latest\/\$\{manifest\.target\}\.json/);
});

test("promotion waits for every platform and verifies public Qiniu objects", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  for (const target of ["aarch64-apple-darwin", "x86_64-apple-darwin", "x86_64-pc-windows-msvc", "x86_64-unknown-linux-gnu"]) {
    assert.match(workflow, new RegExp(target));
  }
  assert.match(workflow, /needs:\s*build-environment/);
  assert.match(workflow, /qiniu-release\.mjs verify/);
  assert.match(workflow, /qiniu-release\.mjs promote/);
});

test("environment release configuration contains no credential values or GitHub fallback URLs", async () => {
  const source = [
    await readFile(workflowPath, "utf8"),
    await readFile(new URL("./qiniu-release.mjs", import.meta.url), "utf8"),
  ].join("\n");
  assert.doesNotMatch(source, /github\.com\/ccfwwm\/zerowallscience-releases/);
  assert.doesNotMatch(source, /gHDYZ|h-zFzr/);
  assert.match(source, /QINIU_ACCESS_KEY/);
  assert.match(source, /QINIU_SECRET_KEY/);
  assert.match(source, /https:\/\/up-z2\.qiniup\.com/);
  assert.match(source, /https:\/\/zerowall\.chengxunkeji\.cn/);
});
