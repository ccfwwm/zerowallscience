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

test("release bootstrapper embeds one-click environment defaults", async () => {
  const workflow = await readFile(new URL("../.github/workflows/build.yml", import.meta.url), "utf8");
  assert.match(workflow, /Require environment bootstrapper signing keys/);
  assert.match(workflow, /ZEROWALL_ENV_UPDATE_PUBLIC_KEY is required for environment releases/);
  assert.match(workflow, /ZEROWALL_ENV_UPDATE_PRIVATE_KEY is required for environment releases/);
  assert.match(workflow, /ZEROWALL_ENV_MANIFEST_URL:/);
  assert.match(
    workflow,
    /releases\/latest\/download\/ZeroWall-Environment-\$\{\{ matrix\.target \}\}\.tar\.gz\.json/,
  );
  assert.match(
    workflow,
    /Build environment bootstrapper[\s\S]*ZEROWALL_ENV_UPDATE_PUBLIC_KEY:[\s\S]*cargo build/,
  );
});
