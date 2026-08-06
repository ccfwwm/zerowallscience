import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const configPath = new URL("../apps/desktop/src-tauri/tauri.conf.json", import.meta.url);

test("the application installer excludes the managed agent environment", async () => {
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const externalBin = config.bundle?.externalBin ?? [];
  const resources = Object.keys(config.bundle?.resources ?? {});

  assert.deepEqual(externalBin, []);
  assert.deepEqual(resources, []);
  assert.doesNotMatch(config.build?.beforeBuildCommand ?? "", /build-mcp-proxy/i);
});
