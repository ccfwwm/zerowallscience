// Connector-secret plumbing for MCP servers (P3), built on P1B's keychain.
//
// SECURITY MODEL — read this before changing anything here.
//
// The OS keychain is WRITE-ONLY from the renderer's point of view. P1B
// (commit 00e2f1a) deliberately ships no getter: the registered Tauri commands
// are exactly `set_provider_secret`, `remove_provider_secret`,
// `provider_secret_exists`, `set_connector_secret`, `remove_connector_secret`
// (apps/desktop/src-tauri/src/lib.rs). There is no `get_connector_secret`, and
// none must be added — a read-back path would let credentials re-enter the
// webview and, from there, logs, provenance, crash reports and exports.
//
// Secret VALUES reach an MCP server without ever crossing into JS:
//   1. Rust materializes them from the keychain (`secret_store::sidecar_secrets`)
//      and turns them into env vars (`secret_store::sidecar_environment`).
//   2. Those are set on the OpenCode sidecar `Command` before spawn
//      (runtime.rs).
//   3. Local (stdio) MCP servers are spawned by OpenCode as children of the
//      sidecar, so they inherit the variables from `process.env`.
//   4. MCP config only ever references them as `{env:NAME}` placeholders.
//
// This module therefore exposes the WRITE path and name-only helpers. Nothing
// here returns a secret value.

import type { MCPServerConfig, SecretRequirement } from "../../packages/shared/src/mcp-config";
import { secretRequirements } from "../../packages/shared/src/mcp-config";

/** Tauri `invoke`, injected so this module stays testable and web-safe. */
export type Invoke = <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

/** The write half of P1B's connector-secret store. No getter exists by design. */
export interface ConnectorSecretWriter {
  /** Store one connector environment secret in the OS credential manager. */
  set(connectorId: string, environment: string, value: string): Promise<void>;
  /** Remove one connector environment secret. Returns whether one was removed. */
  remove(connectorId: string, environment: string): Promise<boolean>;
}

/** Write-only connector-secret store backed by the registered Tauri commands. */
export class TauriConnectorSecrets implements ConnectorSecretWriter {
  constructor(private readonly invoke: Invoke) {}

  async set(connectorId: string, environment: string, value: string): Promise<void> {
    await this.invoke("set_connector_secret", { connectorId, environment, value });
  }

  async remove(connectorId: string, environment: string): Promise<boolean> {
    return this.invoke<boolean>("remove_connector_secret", { connectorId, environment });
  }
}

/** In-memory writer for tests. Records that a secret was written, not its value. */
export class InMemoryConnectorSecrets implements ConnectorSecretWriter {
  private readonly written = new Set<string>();

  async set(connectorId: string, environment: string, _value: string): Promise<void> {
    this.written.add(`${connectorId}:${environment}`);
  }

  async remove(connectorId: string, environment: string): Promise<boolean> {
    return this.written.delete(`${connectorId}:${environment}`);
  }

  /** Keys written so far, in `connectorId:ENV_NAME` form — names only. */
  keys(): string[] {
    return [...this.written].sort();
  }

  has(connectorId: string, environment: string): boolean {
    return this.written.has(`${connectorId}:${environment}`);
  }
}

/**
 * The inherited environment, or `{}` in the webview where there is no `process`.
 * Reached through `globalThis` so this module needs no Node types and is safe to
 * import from the renderer bundle.
 */
function ambientEnv(): Record<string, string | undefined> {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return proc?.env ?? {};
}

/**
 * Which secrets a server still needs, judged from the ambient environment.
 *
 * Only meaningful inside a process that inherited the sidecar environment (the
 * MCP server itself, or a Node-side harness). In the renderer every name comes
 * back as missing, because the webview is never given the values — that is the
 * point of the design, not a bug. Returns NAMES only; values are never read.
 */
export function missingSecretNames(
  config: MCPServerConfig,
  env: Record<string, string | undefined> = ambientEnv(),
): string[] {
  return (config.secrets ?? []).filter((name) => {
    const value = env[name];
    return value === undefined || value.trim() === "";
  });
}

/** The keychain entries a server needs, in P1B's connector layout. */
export function requiredSecrets(config: MCPServerConfig): SecretRequirement[] {
  return secretRequirements(config);
}

/**
 * A log-safe summary of a server's secret state: counts only.
 *
 * Secret names are not logged either — a name identifies which credential a
 * user holds, and these lines can land in debug.log and support bundles.
 */
export function secretSummary(
  config: MCPServerConfig,
  env?: Record<string, string | undefined>,
): string {
  const total = (config.secrets ?? []).length;
  if (total === 0) return "no secrets required";
  const missing = missingSecretNames(config, env).length;
  return `${total - missing}/${total} secrets present`;
}
