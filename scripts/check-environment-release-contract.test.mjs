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

test("environment bundles a pinned Python MCP runtime instead of installing connectors in the app", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const localPublisher = await readFile(
    new URL("./publish-local-windows-environment.ps1", import.meta.url),
    "utf8",
  );
  const requirements = await readFile(
    new URL("../runtime/mcp/requirements.txt", import.meta.url),
    "utf8",
  );
  const smokeScript = await readFile(
    new URL("./environment/smoke-mcp-stdio.mjs", import.meta.url),
    "utf8",
  );
  assert.match(workflow, /mcp-python/);
  assert.match(localPublisher, /mcp-python/);
  assert.match(workflow, /runtime\/mcp\/requirements\.txt/);
  assert.match(localPublisher, /runtime\\mcp\\requirements\.txt/);
  assert.match(localPublisher, /build-mcp-proxy\.mjs/);
  assert.match(workflow, /--break-system-packages/);
  assert.match(localPublisher, /--break-system-packages/);
  assert.match(localPublisher, /qiniu-release\.mjs"\) verify "\$env:QINIU_DOMAIN\/environment\/\$version\/\$target\/ZeroWall-Environment-\$target\.tar\.gz\.json"/);
  assert.match(localPublisher, /qiniu-release\.mjs"\) promote-target/);
  assert.match(workflow, /importlib\.metadata/);
  assert.match(localPublisher, /importlib\.metadata/);
  assert.doesNotMatch(workflow, /import jupyterlab, jupyter_mcp_server/);
  assert.doesNotMatch(localPublisher, /import jupyterlab, jupyter_mcp_server/);
  assert.match(smokeScript, /MP_API_KEY:\s*"test"/);
  for (const dependency of [
    "paper-search-mcp==",
    "biomcp-python==",
    "spaceweather-mcp==",
    "mcp-weather-server==",
    "usgs-mcp==",
    "uniprot-mcp-server==",
    "wikipedia-mcp==",
    "jupyter-mcp-server==",
  ]) {
    assert.match(requirements, new RegExp(`^${dependency}`, "m"));
  }
});

test("local environment publishing fetches and validates both ACP CLI runtimes", async () => {
  const localPublisher = await readFile(
    new URL("./publish-local-windows-environment.ps1", import.meta.url),
    "utf8",
  );
  const runtimeFetcher = await readFile(
    new URL("./dev/fetch-acp-runtimes.sh", import.meta.url),
    "utf8",
  );
  assert.match(localPublisher, /fetch-acp-runtimes\.sh/);
  assert.match(localPublisher, /runtime\\acp\\codex\\node\\node\.exe/);
  assert.match(localPublisher, /runtime\\acp\\claude-code\\node\\node\.exe/);
  assert.match(localPublisher, /runtime\\acp\\codex\\bin\\codex\.cmd/);
  assert.match(localPublisher, /runtime\\acp\\claude-code\\bin\\claude\.cmd/);
  assert.match(localPublisher, /archived Codex runtime health check failed/);
  assert.match(localPublisher, /archived Claude Code runtime health check failed/);
  assert.match(runtimeFetcher, /--connect-timeout\s+20/);
  assert.match(runtimeFetcher, /--speed-limit\s+1024/);
  assert.match(runtimeFetcher, /--speed-time\s+30/);
  assert.match(runtimeFetcher, /--max-time\s+600/);
  assert.match(runtimeFetcher, /--retry-all-errors/);
  assert.match(runtimeFetcher, /--continue-at\s+-/);
  assert.match(runtimeFetcher, /node_runtime_is_ready/);
  assert.match(runtimeFetcher, /process\.version.*process\.arch/);
  assert.match(runtimeFetcher, /Reusing the prepared Node runtime/);
});

test("real OpenCode transport smoke is optional but gates configured environment releases", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const localPublisher = await readFile(
    new URL("./publish-local-windows-environment.ps1", import.meta.url),
    "utf8",
  );

  for (const source of [workflow, localPublisher]) {
    assert.match(source, /smoke-opencode-driver\.mjs/);
    for (const name of [
      "ZEROWALL_SMOKE_API_KEY",
      "ZEROWALL_SMOKE_BASE_URL",
      "ZEROWALL_SMOKE_PROVIDER_ID",
      "ZEROWALL_SMOKE_MODEL_ID",
    ]) {
      assert.match(source, new RegExp(name));
    }
    assert.match(source, /Skipping OpenCode transport smoke: no model credentials configured/);
    assert.match(source, /OpenCode smoke configuration is incomplete/);
  }
});

test("environment build and MCP smoke steps do not receive release credentials", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const smokeScript = await readFile(
    new URL("./environment/smoke-mcp-stdio.mjs", import.meta.url),
    "utf8",
  );
  const buildStep = workflow.match(
    /- name: Build and smoke versioned environment[\s\S]*?(?=\n\s*- name: Sign and upload versioned environment)/,
  )?.[0];
  const uploadStep = workflow.match(
    /- name: Sign and upload versioned environment[\s\S]*?(?=\n\s*- uses: actions\/upload-artifact@v4)/,
  )?.[0];

  assert.ok(buildStep, "build/smoke must be a separate workflow step");
  assert.ok(uploadStep, "sign/upload must be a separate workflow step");
  for (const secretName of [
    "QINIU_ACCESS_KEY",
    "QINIU_SECRET_KEY",
    "ZEROWALL_ENV_UPDATE_PRIVATE_KEY",
  ]) {
    assert.doesNotMatch(buildStep, new RegExp(secretName));
    assert.match(uploadStep, new RegExp(secretName));
  }
  assert.match(smokeScript, /buildChildEnv\(process\.env/);
  assert.doesNotMatch(smokeScript, /\.\.\.process\.env/);
  assert.match(smokeScript, /await terminateChild\(child, 2_000\)/);
  assert.match(smokeScript, /finishPromise/);
});
