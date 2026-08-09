import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { buildChildEnv, terminateChild } from "./smoke-opencode-support.mjs";

const python = process.argv[2];
if (!python) throw new Error("usage: smoke-mcp-stdio.mjs <python executable>");
await access(python);

const connectors = [
  ["paper-search", ["-m", "paper_search_mcp.server"]],
  ["biomcp", ["-m", "biomcp", "run"]],
  ["materials-project", ["-c", "from mcp_materials import main; main()"]],
  ["fred", ["-c", "from fred_mcp.main import main; main()"]],
  ["spaceweather", ["-m", "spaceweather_mcp.server"]],
  ["open-meteo", ["-m", "mcp_weather_server"]],
  ["usgs-water", ["-c", "from usgs_mcp.server import main; main()"]],
  ["uniprot", ["-m", "uniprot_mcp.server"]],
  ["wikipedia", ["-m", "wikipedia_mcp"]],
];

function writeMessage(child, message) {
  child.stdin.write(`${JSON.stringify(message)}\n`);
}

async function smokeConnector(name, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(python, ["-s", ...args], {
      env: buildChildEnv(process.env, {
        FASTMCP_SHOW_SERVER_BANNER: "false",
        FRED_API_KEY: "test",
        MP_API_KEY: "test",
        PYTHONUNBUFFERED: "1",
      }),
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let settled = false;
    let finishPromise;
    let stderr = "";
    const timer = setTimeout(() => finish(new Error(`${name}: MCP handshake timed out`)), 30_000);
    const output = createInterface({ input: child.stdout, crlfDelay: Infinity });

    function finish(error) {
      if (settled) return finishPromise;
      settled = true;
      clearTimeout(timer);
      output.close();
      child.stdin.end();
      finishPromise = (async () => {
        await terminateChild(child, 2_000);
        if (error) {
          const diagnostic = stderr.trim().slice(-2_000);
          reject(new Error(diagnostic ? `${error.message}\n${diagnostic}` : error.message));
        } else {
          resolve();
        }
      })();
      return finishPromise;
    }

    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${chunk.toString("utf8")}`.slice(-4_000);
    });
    child.once("error", (error) => finish(new Error(`${name}: failed to start: ${error.message}`)));
    child.once("exit", (code) => {
      if (!settled) finish(new Error(`${name}: exited before tools/list (code ${code ?? "unknown"})`));
    });
    output.on("line", (line) => {
      if (!line.trim()) return;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        return;
      }
      if (message.id === 1) {
        if (message.error) {
          finish(new Error(`${name}: initialize failed: ${JSON.stringify(message.error)}`));
          return;
        }
        writeMessage(child, { jsonrpc: "2.0", method: "notifications/initialized" });
        writeMessage(child, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
      } else if (message.id === 2) {
        if (message.error) {
          finish(new Error(`${name}: tools/list failed: ${JSON.stringify(message.error)}`));
          return;
        }
        if (!Array.isArray(message.result?.tools)) {
          finish(new Error(`${name}: tools/list returned no tool catalog`));
          return;
        }
        console.log(`${name}: ${message.result.tools.length} tools`);
        finish();
      }
    });

    writeMessage(child, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "zerowall-environment-smoke", version: "1.0.0" },
      },
    });
  });
}

for (const [name, args] of connectors) {
  await smokeConnector(name, args);
}

console.log(`Validated ${connectors.length} integrated MCP servers`);
