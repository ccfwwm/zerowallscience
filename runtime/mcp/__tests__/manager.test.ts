import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MCPServerManager,
  type McpRuntime,
  type McpServerReport,
} from "../manager";
import {
  getMCPServerConfig,
  type LocalMcpConfig,
  type MCPServerConfig,
} from "../../../packages/shared/src/mcp-config";

/** Stand-in for the OpenCode sidecar: records config writes, reports status. */
class FakeRuntime implements McpRuntime {
  readonly registered = new Map<string, LocalMcpConfig>();
  readonly writes: Array<{ name: string; enabled: boolean }> = [];
  /** Live status per server, as OpenCode would report it. */
  statuses = new Map<string, string>();
  /** Status a server lands in when enabled — set to "failed" to simulate a
   *  server that cannot come up at all. */
  statusOnEnable = "connected";
  listDelay = 0;
  listError?: Error;

  async addMcpServer(name: string, config: LocalMcpConfig): Promise<void> {
    this.registered.set(name, config);
    this.writes.push({ name, enabled: config.enabled });
    this.statuses.set(name, config.enabled ? this.statusOnEnable : "disabled");
  }

  async listMcpServers(): Promise<McpServerReport[]> {
    if (this.listDelay > 0) await new Promise((r) => setTimeout(r, this.listDelay));
    if (this.listError) throw this.listError;
    return [...this.statuses].map(([name, status]) => ({ name, status }));
  }
}

const PYTHON = "C:\\env\\Scripts\\python.exe";

function makeManager(runtime: McpRuntime, overrides: Record<string, unknown> = {}) {
  const logs: Array<{ id: string; level: string; message: string }> = [];
  const manager = new MCPServerManager(runtime, {
    python: PYTHON,
    logger: (id, level, message) => logs.push({ id, level, message }),
    // No real waiting: the retry loop yields instead of sleeping.
    sleep: async () => {},
    ...overrides,
  });
  return { manager, logs };
}

let runtime: FakeRuntime;
let literature: MCPServerConfig;

beforeEach(() => {
  runtime = new FakeRuntime();
  literature = { ...getMCPServerConfig("literature")!, startupTimeout: 1_000 };
});

describe("startMCPServer", () => {
  it("registers the server enabled and waits until it reports connected", async () => {
    const { manager } = makeManager(runtime);
    await manager.startMCPServer(literature);

    expect(runtime.registered.get("literature")).toEqual({
      type: "local",
      command: [PYTHON, "-m", "mcp_literature.server"],
      enabled: true,
    });
    expect(manager.getServerStatus("literature")).toMatchObject({
      state: "running",
      reported: "connected",
      restartCount: 0,
    });
    expect(manager.isServerRunning("literature")).toBe(true);
  });

  it("refuses to start a server that is already running", async () => {
    const { manager } = makeManager(runtime);
    await manager.startMCPServer(literature);
    await expect(manager.startMCPServer(literature)).rejects.toThrow(
      "MCP server literature is already running",
    );
  });

  it("fails fast when the runtime reports a terminal failure", async () => {
    const { manager } = makeManager(runtime);
    runtime.statusOnEnable = "failed";

    await expect(manager.startMCPServer(literature)).rejects.toThrow(/failed to start/);
    expect(manager.getServerStatus("literature")).toMatchObject({ state: "failed" });
  });

  it("times out when the server never becomes healthy", async () => {
    const { manager } = makeManager(runtime, { now: fakeClock() });
    runtime.statusOnEnable = "pending";

    await expect(manager.startMCPServer(literature)).rejects.toThrow(/did not become healthy/);
    expect(manager.getServerStatus("literature")?.state).toBe("failed");
  });

  it("surfaces a config write failure", async () => {
    const failing: McpRuntime = {
      addMcpServer: vi.fn().mockRejectedValue(new Error("PATCH refused")),
      listMcpServers: vi.fn().mockResolvedValue([]),
    };
    const { manager, logs } = makeManager(failing);

    await expect(manager.startMCPServer(literature)).rejects.toThrow("PATCH refused");
    expect(logs.some((l) => l.level === "error" && l.message.includes("PATCH refused"))).toBe(true);
  });

  it("logs secret counts, never secret names or values", async () => {
    const { manager, logs } = makeManager(runtime);
    await manager.startMCPServer(literature);

    const text = logs.map((l) => l.message).join("\n");
    expect(text).toMatch(/secrets present|no secrets required/);
    expect(text).not.toContain("NCBI_API_KEY");
    expect(text).not.toContain("SEMANTIC_SCHOLAR_API_KEY");
  });

  it("never writes a secret value into the MCP config", async () => {
    const { manager } = makeManager(runtime);
    await manager.startMCPServer(literature);
    const serialized = JSON.stringify([...runtime.registered.values()]);
    expect(serialized).not.toContain("NCBI_API_KEY");
  });

  it("emits {env:NAME} references when placeholders are enabled", async () => {
    const { manager } = makeManager(runtime, { secretPlaceholders: true });
    await manager.startMCPServer(literature);
    expect(runtime.registered.get("literature")?.environment).toEqual({
      NCBI_API_KEY: "{env:NCBI_API_KEY}",
      SEMANTIC_SCHOLAR_API_KEY: "{env:SEMANTIC_SCHOLAR_API_KEY}",
    });
  });
});

describe("stopMCPServer", () => {
  it("registers the server disabled", async () => {
    const { manager } = makeManager(runtime);
    await manager.startMCPServer(literature);
    await manager.stopMCPServer("literature");

    expect(runtime.registered.get("literature")?.enabled).toBe(false);
    expect(manager.getServerStatus("literature")).toMatchObject({ state: "stopped" });
    expect(manager.isServerRunning("literature")).toBe(false);
  });

  it("rejects an unregistered server", async () => {
    const { manager } = makeManager(runtime);
    await expect(manager.stopMCPServer("ghost")).rejects.toThrow("not registered");
  });
});

describe("restartMCPServer", () => {
  it("disables then re-enables the server and counts the attempt", async () => {
    const { manager } = makeManager(runtime);
    await manager.startMCPServer(literature);
    await manager.restartMCPServer("literature");

    expect(runtime.writes.map((w) => w.enabled)).toEqual([true, false, true]);
    expect(manager.getServerStatus("literature")).toMatchObject({
      state: "running",
      restartCount: 1,
    });
  });

  it("rejects an unregistered server", async () => {
    const { manager } = makeManager(runtime);
    await expect(manager.restartMCPServer("ghost")).rejects.toThrow("not registered");
  });
});

describe("healthCheckMCPServer", () => {
  it("reports healthy with a latency for a connected server", async () => {
    const { manager } = makeManager(runtime);
    await manager.startMCPServer(literature);

    const health = await manager.healthCheckMCPServer("literature");
    expect(health.healthy).toBe(true);
    expect(health.latency).toBeGreaterThanOrEqual(0);
  });

  it("reports unhealthy with the runtime's status string", async () => {
    const { manager } = makeManager(runtime);
    await manager.startMCPServer(literature);
    runtime.statuses.set("literature", "failed");

    const health = await manager.healthCheckMCPServer("literature");
    expect(health.healthy).toBe(false);
    expect(health.error).toBe("status: failed");
  });

  it("reports unhealthy when the runtime does not know the server", async () => {
    const { manager } = makeManager(runtime);
    await manager.startMCPServer(literature);
    runtime.statuses.delete("literature");

    const health = await manager.healthCheckMCPServer("literature");
    expect(health.healthy).toBe(false);
    expect(health.error).toBe("not reported by the runtime");
  });

  it("flags a timeout when the runtime stops answering", async () => {
    const { manager } = makeManager(runtime);
    await manager.startMCPServer({ ...literature, startupTimeout: 20 });
    runtime.listDelay = 200;

    const health = await manager.healthCheckMCPServer("literature");
    expect(health.timedOut).toBe(true);
    expect(health.error).toMatch(/timed out after 20ms/);
  });

  it("surfaces a runtime error without throwing", async () => {
    const { manager } = makeManager(runtime);
    await manager.startMCPServer(literature);
    runtime.listError = new Error("socket closed");

    const health = await manager.healthCheckMCPServer("literature");
    expect(health.healthy).toBe(false);
    expect(health.error).toBe("socket closed");
  });

  it("reports an unregistered server as unhealthy", async () => {
    const { manager } = makeManager(runtime);
    const health = await manager.healthCheckMCPServer("ghost");
    expect(health).toMatchObject({ healthy: false, error: "not registered" });
  });
});

describe("health monitor and restart policy", () => {
  it("restarts an unhealthy server under on-failure", async () => {
    const { manager } = makeManager(runtime);
    await manager.startMCPServer(literature);
    runtime.statuses.set("literature", "failed");

    // The failed status is cleared by the disable/enable cycle of the restart.
    await manager.onHealthTick(literature);

    expect(manager.getServerStatus("literature")).toMatchObject({
      state: "running",
      restartCount: 1,
    });
  });

  it("leaves an unhealthy server alone under never", async () => {
    const config: MCPServerConfig = { ...literature, restartPolicy: "never" };
    const { manager } = makeManager(runtime);
    await manager.startMCPServer(config);
    runtime.statuses.set("literature", "failed");

    await manager.onHealthTick(config);

    expect(manager.getServerStatus("literature")).toMatchObject({
      state: "unhealthy",
      restartCount: 0,
    });
  });

  it("gives up after maxRestartAttempts", async () => {
    const config: MCPServerConfig = { ...literature, maxRestartAttempts: 2 };
    const { manager, logs } = makeManager(runtime);
    await manager.startMCPServer(config);

    // A flapping server: each restart brings it back up, then it degrades again
    // before the next tick, so the policy keeps firing until the budget is spent.
    for (let i = 0; i < 4; i++) {
      runtime.statuses.set("literature", "failed");
      await manager.onHealthTick(config);
    }

    expect(manager.getServerStatus("literature")).toMatchObject({
      state: "failed",
      restartCount: 2,
    });
    expect(logs.some((l) => l.message.includes("giving up after 2 restart attempts"))).toBe(true);
  });

  it("marks a recovered server running again", async () => {
    const { manager, logs } = makeManager(runtime);
    const config: MCPServerConfig = { ...literature, restartPolicy: "never" };
    await manager.startMCPServer(config);

    runtime.statuses.set("literature", "pending");
    await manager.onHealthTick(config);
    expect(manager.getServerStatus("literature")?.state).toBe("unhealthy");

    runtime.statuses.set("literature", "connected");
    await manager.onHealthTick(config);
    expect(manager.getServerStatus("literature")?.state).toBe("running");
    expect(logs.some((l) => l.message === "recovered")).toBe(true);
  });

  it("ignores ticks for a stopped server", async () => {
    const { manager } = makeManager(runtime);
    await manager.startMCPServer(literature);
    await manager.stopMCPServer("literature");

    await manager.onHealthTick(literature);
    expect(manager.getServerStatus("literature")?.state).toBe("stopped");
  });
});

describe("fleet operations", () => {
  it("tracks several servers independently", async () => {
    const { manager } = makeManager(runtime);
    const genomics = { ...getMCPServerConfig("genomics")!, startupTimeout: 1_000 };
    await manager.startMCPServer(literature);
    await manager.startMCPServer(genomics);

    expect(manager.getAllServerStatuses().map((s) => s.id).sort()).toEqual([
      "genomics",
      "literature",
    ]);
  });

  it("disables every registered server on shutdown", async () => {
    const { manager } = makeManager(runtime);
    const genomics = { ...getMCPServerConfig("genomics")!, startupTimeout: 1_000 };
    await manager.startMCPServer(literature);
    await manager.startMCPServer(genomics);

    await manager.shutdownAll();

    expect(runtime.registered.get("literature")?.enabled).toBe(false);
    expect(runtime.registered.get("genomics")?.enabled).toBe(false);
    expect(manager.getAllServerStatuses().every((s) => s.state === "stopped")).toBe(true);
  });

  it("exposes the keychain entries a server needs, names only", async () => {
    const { manager } = makeManager(runtime);
    await manager.startMCPServer(literature);

    expect(manager.secretRequirements("literature")).toEqual([
      { connectorId: "literature", environment: "NCBI_API_KEY" },
      { connectorId: "literature", environment: "SEMANTIC_SCHOLAR_API_KEY" },
    ]);
    expect(manager.secretRequirements("ghost")).toEqual([]);
  });
});

/** Monotonic clock that jumps far enough to blow any startup deadline. */
function fakeClock() {
  let t = 0;
  return () => {
    t += 400;
    return t;
  };
}
