import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("release builds publish a platform-specific signed application manifest to Qiniu", async () => {
  const workflow = await readFile(new URL("../.github/workflows/build.yml", import.meta.url), "utf8");
  assert.match(workflow, /ZEROWALL_APP_UPDATE_PUBLIC_KEY/);
  assert.match(workflow, /ZEROWALL_APP_UPDATE_PRIVATE_KEY/);
  assert.match(workflow, /scripts\/app\/build-manifest\.mjs/);
  assert.match(workflow, /zerowall-app-manifest-\$target\.json/);
  assert.match(workflow, /QINIU_ACCESS_KEY/);
  assert.match(workflow, /scripts\/upload-qiniu-object\.mjs/);
  assert.match(workflow, /scripts\/publish-qiniu-release\.mjs/);
});

test("application builds keep the environment release channel on the Qiniu index", async () => {
  const workflow = await readFile(new URL("../.github/workflows/build.yml", import.meta.url), "utf8");
  assert.match(workflow, /ZEROWALL_ENV_UPDATE_PUBLIC_KEY/);
  assert.match(workflow, /environment\/latest\/index\.json/);
});

test("environment bootstrapper defaults to the signed environment index", async () => {
  const workflow = await readFile(new URL("../.github/workflows/build.yml", import.meta.url), "utf8");
  assert.match(workflow, /ZEROWALL_ENV_MANIFEST_URL: https:\/\/zerowall\.chengxunkeji\.cn\/environment\/latest\/index\.json/);
});
