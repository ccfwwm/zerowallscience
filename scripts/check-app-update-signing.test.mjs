import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("release builds publish a platform-specific signed application manifest", async () => {
  const workflow = await readFile(new URL("../.github/workflows/build.yml", import.meta.url), "utf8");
  assert.match(workflow, /ZEROWALL_APP_UPDATE_PUBLIC_KEY/);
  assert.match(workflow, /ZEROWALL_APP_UPDATE_PRIVATE_KEY/);
  assert.match(workflow, /scripts\/app\/build-manifest\.mjs/);
  assert.match(workflow, /zerowall-app-manifest-\$target\.json/);
  assert.match(workflow, /gh release upload "\$TAG" "\$APP_UPDATE_MANIFEST"/);
});

test("release builds require the independent environment signing channel", async () => {
  const workflow = await readFile(new URL("../.github/workflows/build.yml", import.meta.url), "utf8");
  assert.match(workflow, /ZEROWALL_ENV_UPDATE_PUBLIC_KEY/);
  assert.match(workflow, /ZEROWALL_ENV_UPDATE_PRIVATE_KEY/);
  assert.match(workflow, /scripts\/environment\/build-manifest\.mjs/);
  assert.match(workflow, /ZeroWall-Environment-\$\{target\}\.tar\.gz/);
  assert.match(workflow, /gh release upload "\$TAG" "\$ENVIRONMENT_ASSET"/);
});
