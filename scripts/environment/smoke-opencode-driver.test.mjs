import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import test from "node:test";
import {
  buildChildEnv,
  createAbortableRequest,
  eventBelongsToSession,
  extractSseFrames,
  remainingTimeout,
  settleWithin,
  terminateChild,
} from "./smoke-opencode-support.mjs";

test("bounded cleanup stops waiting when an aborted SSE task never settles", async () => {
  const startedAt = Date.now();
  const settled = await settleWithin(new Promise(() => {}), 50);

  assert.equal(settled, false);
  assert.ok(Date.now() - startedAt < 1_000, "SSE cleanup wait must be bounded");
});

test("a pending control request cannot outlive the global smoke deadline", async () => {
  const deadline = Date.now() + 75;
  const request = createAbortableRequest(
    (_input, { signal }) => new Promise((_, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }),
    () => remainingTimeout(deadline, 5_000),
    new Set(),
    "control request timed out",
  );

  const startedAt = Date.now();
  await assert.rejects(request("/provider"), /control request timed out/);
  assert.ok(Date.now() - startedAt < 1_000, "control request must honor the global deadline");
});

test("control request timeout also covers a response body that never finishes", async () => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.flushHeaders();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/session`;
  const request = createAbortableRequest(
    (input, init) => fetch(input, init),
    100,
    new Set(),
    "response body timed out",
    (response) => response.json(),
  );

  try {
    await assert.rejects(request(url), /response body timed out/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("prompt_async aborts a permanently pending request and cleanup terminates the smoke child", async () => {
  const server = createServer(() => {
    // Keep the prompt request pending until the client aborts it.
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/session/prompt_async`;
  const activeControllers = new Set();
  const request = createAbortableRequest((input, init) => fetch(input, init), 100, activeControllers);
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  const requestStartedAt = Date.now();
  let requestElapsedMs;

  try {
    await assert.rejects(request(url, { method: "POST" }), /timed out/i);
    requestElapsedMs = Date.now() - requestStartedAt;
  } finally {
    for (const controller of activeControllers) controller.abort();
    await terminateChild(child, 2_000);
    await new Promise((resolve) => server.close(resolve));
  }

  assert.ok(requestElapsedMs < 1_000, "pending prompt must fail within the request timeout");
  assert.notEqual(child.exitCode ?? child.signalCode, null, "smoke child must be terminated in cleanup");
});

test("OpenCode smoke always aborts its SSE stream during cleanup", async () => {
  const source = await readFile(
    new URL("./smoke-opencode-driver.mjs", import.meta.url),
    "utf8",
  );

  assert.match(source, /let eventController;/);
  assert.match(source, /createAbortableRequest\(\s*request,\s*\(\) => remainingTimeout\(smokeDeadline, 30_000\),/);
  assert.match(source, /await terminateChild\(child,[^)]+\);[\s\S]*eventController\?\.abort\(\);[\s\S]*await settleWithin\(eventTask,/);
});

test("every OpenCode control request is bounded by the smoke deadline", async () => {
  const source = await readFile(
    new URL("./smoke-opencode-driver.mjs", import.meta.url),
    "utf8",
  );

  assert.match(source, /const smokeDeadline = Date\.now\(\) \+ 40_000;/);
  assert.match(source, /controlRequest\(`\/provider\?directory=/);
  assert.match(source, /sessionRequest\(`\/session\?directory=/);
  assert.match(source, /eventRequest\([\s\S]*\/event\?sessionID=/);
  assert.match(source, /promptRequest\(`\/session\/\$\{encodeURIComponent\(session\.id\)\}\/prompt_async/);
});

test("OpenCode smoke isolates release credentials and performs bounded cleanup", async () => {
  const source = await readFile(
    new URL("./smoke-opencode-driver.mjs", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(source, /\.\.\.process\.env/);
  assert.match(source, /clearTimeout\(eventTimer\)/);
  assert.match(source, /await terminateChild\(child, 2_000\)/);
  assert.match(source, /stdio:\s*\["ignore",\s*"ignore",\s*"pipe"\]/);
});

test("OpenCode smoke uses the shared strict SSE parser", async () => {
  const source = await readFile(
    new URL("./smoke-opencode-driver.mjs", import.meta.url),
    "utf8",
  );

  assert.match(source, /extractSseFrames/);
  assert.match(source, /eventBelongsToSession\(payload, session\.id\)/);
  assert.doesNotMatch(source, /acp:message=yes/);
});

test("child environment excludes unrelated release credentials", () => {
  const result = buildChildEnv(
    {
      PATH: "C:/bin",
      SYSTEMROOT: "C:/Windows",
      QINIU_ACCESS_KEY: "must-not-leak",
      ZEROWALL_ENV_UPDATE_PRIVATE_KEY: "must-not-leak",
    },
    { OPENCODE_SERVER_PASSWORD: "local", OPENCODE_AUTH_CONTENT: "{}" },
  );

  assert.equal(result.PATH, "C:/bin");
  assert.equal(result.SYSTEMROOT, "C:/Windows");
  assert.equal(result.OPENCODE_SERVER_PASSWORD, "local");
  assert.equal(result.QINIU_ACCESS_KEY, undefined);
  assert.equal(result.ZEROWALL_ENV_UPDATE_PRIVATE_KEY, undefined);
});

test("SSE parser accepts LF and CRLF frames and preserves a partial frame", () => {
  const parsed = extractSseFrames("data: one\r\n\r\ndata: two\n\ndata: partial");
  assert.deepEqual(parsed.frames, ["data: one", "data: two"]);
  assert.equal(parsed.remaining, "data: partial");
});

test("events must identify the active session", () => {
  assert.equal(eventBelongsToSession({ properties: {} }, "session-1"), false);
  assert.equal(eventBelongsToSession({ properties: { sessionID: "session-2" } }, "session-1"), false);
  assert.equal(eventBelongsToSession({ properties: { part: { sessionID: "session-1" } } }, "session-1"), true);
});

test("child termination waits for the process to exit", async () => {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    stdio: "ignore",
  });
  await terminateChild(child, 2_000);
  assert.notEqual(child.exitCode ?? child.signalCode, null);
});
