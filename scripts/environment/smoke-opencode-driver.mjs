import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildChildEnv,
  createAbortableRequest,
  eventBelongsToSession,
  extractSseFrames,
  remainingTimeout,
  removeDirectoryWithRetry,
  settleWithin,
  terminateChild,
} from "./smoke-opencode-support.mjs";

const [executable, workspace, providerId, modelId] = process.argv.slice(2);
if (!executable || !workspace || !providerId || !modelId) {
  throw new Error("usage: smoke-opencode-driver.mjs <opencode> <workspace> <provider> <model>");
}
const apiKey = process.env.ZEROWALL_SMOKE_API_KEY?.trim();
const baseUrl = process.env.ZEROWALL_SMOKE_BASE_URL?.trim().replace(/\/$/, "");
if (!apiKey) throw new Error("ZEROWALL_SMOKE_API_KEY is required");
if (!baseUrl || !/^https?:\/\//.test(baseUrl)) throw new Error("ZEROWALL_SMOKE_BASE_URL is required");

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

const root = await mkdtemp(join(tmpdir(), "zerowall-opencode-smoke-"));
const smokeDeadline = Date.now() + 40_000;
let child;
let eventController;
let eventTask;
let eventTimer;
const activeRequestControllers = new Set();
let stderr = "";

try {
  const configHome = join(root, "config");
  const configDir = join(configHome, "opencode");
  await mkdir(configDir, { recursive: true });
  await mkdir(join(root, "data"), { recursive: true });
  await mkdir(join(root, "cache"), { recursive: true });
  await mkdir(join(root, "state"), { recursive: true });
  await writeFile(join(configDir, "opencode.json"), `${JSON.stringify({
    $schema: "https://opencode.ai/config.json",
    model: `${providerId}/${modelId}`,
    provider: {
      [providerId]: {
        name: "AI Cloud",
        npm: "@ai-sdk/openai-compatible",
        options: { baseURL: baseUrl },
        models: { [modelId]: { name: modelId } },
      },
    },
  }, null, 2)}\n`, "utf8");

  const port = await freePort();
  const password = `smoke-${process.pid}-${Date.now()}`;
  const auth = `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}`;
  const childEnv = buildChildEnv(process.env, {
    OPENCODE_SERVER_PASSWORD: password,
    OPENCODE_AUTH_CONTENT: JSON.stringify({ [providerId]: { type: "api", key: apiKey } }),
    XDG_CONFIG_HOME: configHome,
    XDG_DATA_HOME: join(root, "data"),
    XDG_CACHE_HOME: join(root, "cache"),
    XDG_STATE_HOME: join(root, "state"),
  });
  child = spawn(executable, ["serve", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: workspace,
    env: childEnv,
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  });
  let spawnError;
  child.once("error", (error) => {
    spawnError = error;
  });
  child.stderr.on("data", (chunk) => {
    stderr = `${stderr}${chunk.toString("utf8")}`.replaceAll(apiKey, "[REDACTED]").slice(-8_000);
  });

  const host = `http://127.0.0.1:${port}`;
  const directory = encodeURIComponent(workspace);
  const headers = { Authorization: auth, Accept: "application/json, text/event-stream" };
  const request = (path, options = {}) => fetch(`${host}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers ?? {}) },
  });
  const controlRequest = createAbortableRequest(
    request,
    () => remainingTimeout(smokeDeadline, 5_000),
    activeRequestControllers,
    "OpenCode control request timed out",
  );
  const sessionRequest = createAbortableRequest(
    request,
    () => remainingTimeout(smokeDeadline, 5_000),
    activeRequestControllers,
    "OpenCode session/new request timed out",
    async (response) => ({
      response,
      session: response.ok ? await response.json() : null,
    }),
  );
  const promptRequest = createAbortableRequest(
    request,
    () => remainingTimeout(smokeDeadline, 30_000),
    activeRequestControllers,
    "OpenCode prompt request timed out",
  );

  let ready = false;
  for (let attempt = 0; attempt < 100 && Date.now() < smokeDeadline; attempt += 1) {
    if (spawnError) throw new Error(`OpenCode failed during startup: ${spawnError.message}`);
    if (child.exitCode !== null) throw new Error(`OpenCode exited during startup (code ${child.exitCode})`);
    try {
      const response = await controlRequest(`/provider?directory=${directory}`);
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      // The port is not accepting requests yet.
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(200, remainingTimeout(smokeDeadline, 200))));
  }
  if (!ready) throw new Error("OpenCode did not become ready");

  const sessionResult = await sessionRequest(`/session?directory=${directory}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: `release-smoke-${Date.now()}` }),
  });
  const sessionResponse = sessionResult.response;
  if (!sessionResponse.ok) throw new Error(`OpenCode session/new failed (${sessionResponse.status})`);
  const session = sessionResult.session;
  if (!session?.id) throw new Error("OpenCode session/new returned no id");

  eventController = new AbortController();
  const eventRequest = createAbortableRequest(
    (input, init) => fetch(input, {
      ...init,
      signal: AbortSignal.any([eventController.signal, init.signal]),
    }),
    () => remainingTimeout(smokeDeadline, 5_000),
    activeRequestControllers,
    "OpenCode event stream request timed out",
  );
  const eventResponse = await eventRequest(
    `${host}/event?sessionID=${encodeURIComponent(session.id)}&directory=${directory}`,
    { headers },
  );
  if (!eventResponse.ok || !eventResponse.body) throw new Error(`OpenCode event stream failed (${eventResponse.status})`);

  let sawMessage = false;
  let turnEnded = false;
  eventTask = (async () => {
    const decoder = new TextDecoder();
    let buffer = "";
    for await (const chunk of eventResponse.body) {
      buffer += decoder.decode(chunk, { stream: true });
      const parsed = extractSseFrames(buffer);
      buffer = parsed.remaining;
      for (const frame of parsed.frames) {
        for (const line of frame.split(/\r?\n/)) {
          if (!line.startsWith("data:")) continue;
          let event;
          try {
            event = JSON.parse(line.slice(5).trim());
          } catch {
            continue;
          }
          const payload = event?.payload ?? event;
          if (!eventBelongsToSession(payload, session.id)) continue;
          const kind = payload?.type;
          const properties = payload?.properties ?? {};
          if (kind === "text.updated" && typeof properties.delta === "string" && properties.delta.length > 0) sawMessage = true;
          if (kind === "message.part.updated" && properties.part?.type === "text" && properties.part?.text) sawMessage = true;
          if (kind === "session.idle") {
            turnEnded = true;
            return;
          }
        }
      }
    }
  })();
  eventTask.catch(() => {});

  const promptResponse = await promptRequest(`/session/${encodeURIComponent(session.id)}/prompt_async?directory=${directory}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      parts: [{ type: "text", text: "Reply with exactly OK." }],
      model: { providerID: providerId, modelID: modelId },
    }),
  });
  if (!promptResponse.ok) throw new Error(`OpenCode session/prompt failed (${promptResponse.status})`);
  const timeoutTask = new Promise((_, reject) => {
    eventTimer = setTimeout(
      () => reject(new Error("OpenCode prompt events timed out")),
      remainingTimeout(smokeDeadline, 30_000),
    );
  });
  await Promise.race([eventTask, timeoutTask]);
  if (!sawMessage) throw new Error("OpenCode prompt ended without an agent message");
  if (!turnEnded) throw new Error("OpenCode prompt produced no session.idle event");
  process.stdout.write("opencode: message=yes turn-ended=yes\n");
} catch (error) {
  const detail = stderr.trim();
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}${detail ? `\n${detail}` : ""}\n`);
  process.exitCode = 1;
} finally {
  for (const controller of activeRequestControllers) controller.abort();
  if (eventTimer) clearTimeout(eventTimer);
  await terminateChild(child, 2_000);
  eventController?.abort();
  const eventSettled = await settleWithin(eventTask, 1_000);
  if (!eventSettled) {
    process.stderr.write("OpenCode event stream did not settle during cleanup\n");
    process.exitCode = 1;
  }
  try {
    await removeDirectoryWithRetry(root);
  } catch (error) {
    process.stderr.write(`OpenCode smoke cleanup failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
