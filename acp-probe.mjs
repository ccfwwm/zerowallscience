// Drive claude-code-acp through the exact handshake the app uses, logging every
// line, to find where a prompt hangs. No anthropic key (mimics the user's env).
import { spawn } from "node:child_process";

const CWD = "C:/Users/ccf/Documents/ZeroWallScience";
const env = { ...process.env };
delete env.ANTHROPIC_API_KEY; // mimic the app: no key injected

const child = spawn("npx", ["--yes", "@zed-industries/claude-code-acp"], {
  env,
  stdio: ["pipe", "pipe", "pipe"],
  shell: true,
});

let buf = "";
let sid = null;
const t0 = Date.now();
const log = (...a) => console.log(`[+${Date.now() - t0}ms]`, ...a);

function send(obj) {
  const s = JSON.stringify(obj);
  log("SEND", s.slice(0, 120));
  child.stdin.write(s + "\n");
}

child.stdout.on("data", (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i);
    buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { log("RAW", line.slice(0, 200)); continue; }
    // Skip the giant commands list.
    const upd = msg?.params?.update?.sessionUpdate;
    if (upd === "available_commands_update") { log("EVENT available_commands_update (skipped)"); continue; }
    log("RECV", JSON.stringify(msg).slice(0, 300));
    if (msg.id === 1 && msg.result?.sessionId) {
      sid = msg.result.sessionId;
      log(">>> session", sid, "-> sending prompt");
      send({ jsonrpc: "2.0", id: 2, method: "session/prompt",
        params: { sessionId: sid, prompt: [{ type: "text", text: "say hi in one word" }] } });
    }
    if (msg.id === 2) { log(">>> PROMPT RESULT:", JSON.stringify(msg.result || msg.error)); }
  }
});
child.stderr.on("data", (d) => log("STDERR", d.toString().slice(0, 200)));
child.on("exit", (c) => { log("EXIT", c); process.exit(0); });

send({ jsonrpc: "2.0", id: 0, method: "initialize",
  params: { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: true } } });
setTimeout(() => send({ jsonrpc: "2.0", id: 1, method: "session/new",
  params: { cwd: CWD, mcpServers: [] } }), 2500);

setTimeout(() => { log("TIMEOUT — killing"); child.kill(); process.exit(0); }, 45000);
