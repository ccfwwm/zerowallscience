// MCP server lifecycle for the 23 life-science domains (P3).
//
// The desktop frontend runs in a WebView and cannot spawn processes: local MCP
// servers are launched by the OpenCode sidecar from its config (see
// runtime.rs / opencode_config.rs). So here:
//   start   = register the server enabled, then wait until OpenCode reports it up
//   stop    = register it disabled (OpenCode tears the child down)
//   restart = stop, then start, keeping the attempt counter
//
// This class never touches secret values. It only ever handles secret NAMES,
// and only in counts when logging — see keychain-integration.ts for why.

import {
  MCP_DEFAULTS,
  toMcpConfig,
  type LocalMcpConfig,
  type MCPServerConfig,
  type MCPServerHealth,
  type MCPServerStatus,
  type SecretRequirement,
} from "../../packages/shared/src/mcp-config";
import { requiredSecrets, secretSummary } from "./keychain-integration";

/** One MCP server as OpenCode reports it (`OpenCodeClient.listMcpServers`). */
export interface McpServerReport {
  name: string;
  /** e.g. "connected" | "failed" | "disabled" | "pending" */
  status: string;
}

/** The slice of OpenCodeClient the manager needs — injected, so tests stay offline. */
export interface McpRuntime {
  listMcpServers(): Promise<McpServerReport[]>;
  addMcpServer(name: string, config: LocalMcpConfig): Promise<void>;
}

export type McpLogLevel = "info" | "error";
/** Log sink. Receives server ids and counts — never secret names or values. */
export type McpLogger = (serverId: string, level: McpLogLevel, message: string) => void;

export interface MCPServerManagerOptions {
  /** Absolute path of the managed interpreter (`science_mcp_python`). */
  python: string;
  logger?: McpLogger;
  /** Emit `{env:NAME}` references for declared secrets in the MCP config. */
  secretPlaceholders?: boolean;
  /** Injectable clock/timers so tests need no real waiting. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/** OpenCode status strings that mean the server is up. */
const HEALTHY = new Set(["connected", "ready", "running"]);
/** Terminal failure — no point waiting out the startup timeout. */
const TERMINAL = new Set(["failed", "error"]);

export class McpTimeoutError extends Error {
  constructor(ms: number) {
    super(`timed out after ${ms}ms`);
    this.name = "McpTimeoutError";
  }
}

export class MCPServerManager {
  private readonly configs = new Map<string, MCPServerConfig>();
  private readonly statuses = new Map<string, MCPServerStatus>();
  private readonly monitors = new Map<string, ReturnType<typeof setInterval>>();

  private readonly python: string;
  private readonly logger?: McpLogger;
  private readonly placeholders: boolean;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly runtime: McpRuntime,
    options: MCPServerManagerOptions,
  ) {
    this.python = options.python;
    this.logger = options.logger;
    this.placeholders = options.secretPlaceholders ?? false;
    this.now = options.now ?? (() => Date.now());
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  private log(id: string, level: McpLogLevel, message: string): void {
    this.logger?.(id, level, message);
  }

  private status(id: string): MCPServerStatus {
    let status = this.statuses.get(id);
    if (!status) {
      status = { id, state: "stopped", restartCount: 0 };
      this.statuses.set(id, status);
    }
    return status;
  }

  private entry(config: MCPServerConfig, enabled: boolean): LocalMcpConfig {
    return toMcpConfig(config, this.python, enabled, { placeholders: this.placeholders });
  }

  /** Register the server enabled and wait until OpenCode reports it healthy. */
  async startMCPServer(config: MCPServerConfig): Promise<void> {
    const { id } = config;
    if (this.status(id).state === "running") {
      throw new Error(`MCP server ${id} is already running`);
    }

    this.configs.set(id, config);
    const status = this.status(id);
    status.state = "starting";
    status.lastError = undefined;

    // Counts only — never the names or values of the credentials themselves.
    this.log(id, "info", `starting (${secretSummary(config)})`);

    try {
      await this.runtime.addMcpServer(id, this.entry(config, true));
      await this.waitUntilHealthy(config);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      status.state = "failed";
      status.lastError = message;
      this.stopMonitor(id);
      this.log(id, "error", `failed to start: ${message}`);
      throw error;
    }

    status.state = "running";
    status.startedAt = this.now();
    this.log(id, "info", "running");
    this.startMonitor(config);
  }

  /** Register the server disabled; OpenCode stops the child process. */
  async stopMCPServer(id: string): Promise<void> {
    const config = this.configs.get(id);
    if (!config) throw new Error(`MCP server ${id} is not registered`);

    this.stopMonitor(id);
    await this.runtime.addMcpServer(id, this.entry(config, false));

    const status = this.status(id);
    status.state = "stopped";
    status.reported = undefined;
    status.startedAt = undefined;
    this.log(id, "info", "stopped");
  }

  /** Stop then start, incrementing the restart counter. */
  async restartMCPServer(id: string): Promise<void> {
    const config = this.configs.get(id);
    if (!config) throw new Error(`MCP server ${id} is not registered`);

    this.log(id, "info", "restarting");
    await this.stopMCPServer(id);
    this.status(id).restartCount += 1;
    await this.startMCPServer(config);
  }

  /**
   * Probe one server's live status. Sets `timedOut` when the runtime did not
   * answer within the server's startup timeout.
   */
  async healthCheckMCPServer(id: string): Promise<MCPServerHealth> {
    const config = this.configs.get(id);
    const started = this.now();
    if (!config) {
      return { id, healthy: false, lastCheck: started, error: "not registered" };
    }

    const deadline = config.startupTimeout ?? MCP_DEFAULTS.startupTimeout;
    let servers: McpServerReport[];
    try {
      servers = await this.withTimeout(this.runtime.listMcpServers(), deadline);
    } catch (error) {
      const timedOut = error instanceof McpTimeoutError;
      const lastCheck = this.now();
      this.status(id).lastHealthCheck = lastCheck;
      return {
        id,
        healthy: false,
        lastCheck,
        ...(timedOut ? { timedOut: true } : {}),
        error: timedOut
          ? `health check timed out after ${deadline}ms`
          : error instanceof Error
            ? error.message
            : String(error),
      };
    }

    const lastCheck = this.now();
    const report = servers.find((s) => s.name === id);
    const status = this.status(id);
    status.lastHealthCheck = lastCheck;
    status.reported = report?.status;

    if (!report) {
      return { id, healthy: false, lastCheck, error: "not reported by the runtime" };
    }
    const healthy = HEALTHY.has(report.status);
    return {
      id,
      healthy,
      latency: lastCheck - started,
      lastCheck,
      ...(healthy ? {} : { error: `status: ${report.status}` }),
    };
  }

  getServerStatus(id: string): MCPServerStatus | undefined {
    return this.statuses.get(id);
  }

  getAllServerStatuses(): MCPServerStatus[] {
    return [...this.statuses.values()];
  }

  isServerRunning(id: string): boolean {
    return this.statuses.get(id)?.state === "running";
  }

  /** Keychain entries the settings UI must populate for a server (names only). */
  secretRequirements(id: string): SecretRequirement[] {
    const config = this.configs.get(id);
    return config ? requiredSecrets(config) : [];
  }

  /** Disable every registered server and stop all monitors. */
  async shutdownAll(): Promise<void> {
    for (const id of [...this.configs.keys()]) {
      try {
        if (this.status(id).state === "stopped") this.stopMonitor(id);
        else await this.stopMCPServer(id);
      } catch (error) {
        this.log(id, "error", `shutdown failed: ${error}`);
      }
    }
  }

  /**
   * One monitor tick: probe, then apply the restart policy when unhealthy.
   * Exposed so tests (and callers wanting a manual sweep) can drive it directly.
   */
  async onHealthTick(config: MCPServerConfig): Promise<void> {
    const { id } = config;
    const status = this.status(id);
    if (status.state !== "running" && status.state !== "unhealthy") return;

    const health = await this.healthCheckMCPServer(id);
    if (health.healthy) {
      if (status.state === "unhealthy") this.log(id, "info", "recovered");
      status.state = "running";
      return;
    }

    status.state = "unhealthy";
    status.lastError = health.error;
    this.log(id, "error", `unhealthy: ${health.error ?? "unknown"}`);

    const policy = config.restartPolicy ?? MCP_DEFAULTS.restartPolicy;
    if (policy === "never") return;

    const max = config.maxRestartAttempts ?? MCP_DEFAULTS.maxRestartAttempts;
    if (status.restartCount >= max) {
      status.state = "failed";
      this.stopMonitor(id);
      this.log(id, "error", `giving up after ${max} restart attempts`);
      return;
    }

    this.log(id, "info", `restarting (${status.restartCount + 1}/${max})`);
    try {
      await this.restartMCPServer(id);
    } catch (error) {
      this.log(id, "error", `restart failed: ${error}`);
    }
  }

  // ---- internals ----

  private async waitUntilHealthy(config: MCPServerConfig): Promise<void> {
    const timeout = config.startupTimeout ?? MCP_DEFAULTS.startupTimeout;
    const deadline = this.now() + timeout;

    for (;;) {
      const health = await this.healthCheckMCPServer(config.id);
      if (health.healthy) return;

      const reported = this.status(config.id).reported;
      if (reported && TERMINAL.has(reported)) {
        throw new Error(`${config.id} failed to start (status: ${reported})`);
      }
      if (this.now() >= deadline) {
        const detail = reported ?? health.error ?? "pending";
        throw new Error(`${config.id} did not become healthy within ${timeout}ms (${detail})`);
      }
      await this.sleep(Math.min(500, timeout));
    }
  }

  private startMonitor(config: MCPServerConfig): void {
    const interval = config.healthCheckInterval ?? MCP_DEFAULTS.healthCheckInterval;
    this.stopMonitor(config.id);
    const timer = setInterval(() => {
      void this.onHealthTick(config);
    }, interval);
    // Never hold the process open for a background poll.
    (timer as unknown as { unref?: () => void }).unref?.();
    this.monitors.set(config.id, timer);
  }

  private stopMonitor(id: string): void {
    const timer = this.monitors.get(id);
    if (timer) {
      clearInterval(timer);
      this.monitors.delete(id);
    }
  }

  private async withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new McpTimeoutError(ms)), ms);
          (timer as unknown as { unref?: () => void }).unref?.();
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
