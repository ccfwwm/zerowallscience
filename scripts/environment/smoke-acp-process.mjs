import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

const [engine, adapter, runtime, workspace, model] = process.argv.slice(2);
if (!engine || !adapter || !runtime || !workspace || !model) {
  throw new Error("usage: smoke-acp-process.mjs <codex|claude-code> <adapter> <runtime> <workspace> <model>");
}
if (!new Set(["codex", "claude-code"]).has(engine)) throw new Error(`unsupported engine: ${engine}`);

const apiKey = process.env.ZEROWALL_SMOKE_API_KEY?.trim();
const baseUrl = process.env.ZEROWALL_SMOKE_BASE_URL?.trim().replace(/\/$/, "");
if (!apiKey) throw new Error("ZEROWALL_SMOKE_API_KEY is required");
if (!baseUrl || !/^https?:\/\//.test(baseUrl)) throw new Error("ZEROWALL_SMOKE_BASE_URL is required");

const runtimeHome = await mkdtemp(join(tmpdir(), `zerowall-${engine}-smoke-`));
const childEnv = { ...process.env };
for (const name of [
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "CODEX_API_KEY",
  "CODEX_CONFIG",
  "CODEX_HOME",
  "CODEX_PATH",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_MODEL",
  "CLAUDE_CONFIG_DIR",
  "CLAUDE_CODE_EXECUTABLE",
]) {
  delete childEnv[name];
}
childEnv.ZERO_WALL_MODEL = model;

let adapterModel = model;
if (engine === "codex") {
  const config = [
    `model = ${JSON.stringify(model)}`,
    'model_provider = "zerowall-ai-cloud"',
    "",
    "[model_providers.zerowall-ai-cloud]",
    'name = "ZeroWall AI Cloud"',
    `base_url = ${JSON.stringify(baseUrl)}`,
    'wire_api = "responses"',
    'env_key = "CODEX_API_KEY"',
    "requires_openai_auth = false",
    "",
  ].join("\n");
  await writeFile(join(runtimeHome, "config.toml"), config, "utf8");
  childEnv.OPENAI_API_KEY = apiKey;
  childEnv.OPENAI_BASE_URL = baseUrl;
  childEnv.CODEX_API_KEY = apiKey;
  childEnv.CODEX_HOME = runtimeHome;
  childEnv.CODEX_PATH = runtime;
  childEnv.MODEL_PROVIDER = "zerowall-ai-cloud";
  childEnv.CODEX_CONFIG = JSON.stringify({
    model,
    model_provider: "zerowall-ai-cloud",
    model_providers: {
      "zerowall-ai-cloud": {
        name: "ZeroWall AI Cloud",
        base_url: baseUrl,
        wire_api: "responses",
        env_key: "CODEX_API_KEY",
        requires_openai_auth: false,
      },
    },
  });
  adapterModel = `${model}[medium]`;
} else {
  await mkdir(runtimeHome, { recursive: true });
  childEnv.ANTHROPIC_API_KEY = apiKey;
  childEnv.ANTHROPIC_AUTH_TOKEN = apiKey;
  childEnv.ANTHROPIC_BASE_URL = baseUrl.replace(/\/v1$/, "");
  childEnv.ANTHROPIC_MODEL = model;
  childEnv.CLAUDE_CONFIG_DIR = runtimeHome;
  childEnv.CLAUDE_CODE_EXECUTABLE = runtime;
}
delete childEnv.ZEROWALL_SMOKE_API_KEY;

const child = spawn(adapter, [], {
  cwd: workspace,
  env: childEnv,
  stdio: ["pipe", "pipe", "pipe"],
  windowsHide: true,
});
const output = createInterface({ input: child.stdout, crlfDelay: Infinity });
let stderr = "";
let sessionId = null;
let sawMessage = false;
let turnEnded = false;
let settled = false;

function redact(value) {
  return value.replaceAll(apiKey, "[REDACTED]").slice(-4_000);
}

function send(message) {
  child.stdin.write(`${JSON.stringify(message)}\n`);
}

function finish(error) {
  if (settled) return;
  settled = true;
  clearTimeout(timer);
  output.close();
  child.stdin.end();
  child.kill();
  void rm(runtimeHome, { recursive: true, force: true }).catch(() => {});
  if (error) {
    const detail = redact(stderr.trim());
    process.stderr.write(`${error.message}${detail ? `\n${detail}` : ""}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`${engine}: acp:message=yes acp:turn-ended=yes\n`);
  }
}

function respondToClientRequest(message) {
  if (message.method === "session/request_permission") {
    const options = Array.isArray(message.params?.options) ? message.params.options : [];
    const option = options.find((entry) => /allow|once/i.test(entry?.optionId ?? entry?.name ?? ""));
    if (option?.optionId) {
      send({ jsonrpc: "2.0", id: message.id, result: { outcome: { outcome: "selected", optionId: option.optionId } } });
    } else {
      send({ jsonrpc: "2.0", id: message.id, result: { outcome: { outcome: "cancelled" } } });
    }
    return true;
  }
  if (message.id !== undefined && typeof message.method === "string") {
    send({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "unsupported by release smoke host" } });
    return true;
  }
  return false;
}

child.stderr.on("data", (chunk) => {
  stderr = `${stderr}${chunk.toString("utf8")}`.slice(-8_000);
});
child.once("error", (error) => finish(new Error(`${engine}: failed to start adapter: ${error.message}`)));
child.once("exit", (code) => {
  if (!settled) finish(new Error(`${engine}: adapter exited before prompt completion (code ${code ?? "unknown"})`));
});
output.on("line", (line) => {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }
  if (respondToClientRequest(message)) return;
  if (message.method === "session/update") {
    const update = message.params?.update;
    const kind = update?.sessionUpdate;
    if (kind === "agent_message_chunk" && typeof update?.content?.text === "string" && update.content.text.length > 0) {
      sawMessage = true;
    }
    return;
  }
  if (message.id === 1) {
    if (message.error) return finish(new Error(`${engine}: initialize failed`));
    send({ jsonrpc: "2.0", id: 2, method: "session/new", params: { cwd: workspace, mcpServers: [] } });
  } else if (message.id === 2) {
    if (message.error || !message.result?.sessionId) return finish(new Error(`${engine}: session/new failed`));
    sessionId = message.result.sessionId;
    send({ jsonrpc: "2.0", id: 3, method: "session/set_model", params: { sessionId, modelId: adapterModel } });
  } else if (message.id === 3) {
    if (message.error) return finish(new Error(`${engine}: session/set_model failed`));
    send({
      jsonrpc: "2.0",
      id: 4,
      method: "session/prompt",
      params: { sessionId, prompt: [{ type: "text", text: "Reply with exactly OK." }] },
    });
  } else if (message.id === 4) {
    if (message.error) return finish(new Error(`${engine}: session/prompt failed`));
    turnEnded = true;
    if (!sawMessage) return finish(new Error(`${engine}: prompt ended without an agent message`));
    if (turnEnded) finish();
  }
});

const timer = setTimeout(() => finish(new Error(`${engine}: prompt timed out`)), 180_000);
send({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: 1,
    clientCapabilities: {
      fs: { readTextFile: true, writeTextFile: true },
      terminal: true,
    },
  },
});
