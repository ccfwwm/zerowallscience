// Thin bridge to the Tauri Rust side. In a plain browser these are no-ops so the
// app still runs in `pnpm dev`; in the packaged desktop app they invoke Rust commands.

import { isGatewayWeb, gatewayGet } from "./webMode";

export const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Start the bundled OpenCode sidecar (desktop only). Returns its base URL. */
export async function startRuntime(): Promise<string | null> {
  if (!isTauri) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string>("start_runtime");
}

/**
 * Per-run password the sidecar requires on every request (desktop only —
 * browser dev talks to a user-run, passwordless `opencode serve`). Held in
 * memory on both sides; never persisted.
 */
export async function runtimePassword(): Promise<string | null> {
  if (!isTauri) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string>("runtime_password");
}

export interface ProbedModel {
  id: string;
  /** Context window in tokens, when the endpoint reports one. */
  context?: number | null;
}

/**
 * Ask a custom endpoint which models it serves, with context windows where
 * the server reports them (desktop only — the probe runs in Rust because
 * local model servers rarely send CORS headers). `kind` is "openai" or
 * "anthropic", matching the form's compatibility select.
 */
export async function probeEndpointModels(
  baseUrl: string,
  apiKey: string | undefined,
  kind: "openai" | "anthropic",
): Promise<ProbedModel[]> {
  if (!isTauri) return [];
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<ProbedModel[]>("probe_endpoint_models", { baseUrl, apiKey, kind });
}

/**
 * Pick local files via the native dialog and copy them into the agent
 * workspace (desktop only). Returns the workspace file names; [] on cancel.
 */
export async function addFilesToWorkspace(): Promise<string[]> {
  if (!isTauri) return [];
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string[]>("add_files_to_workspace");
}

/**
 * Write text into the workspace as a file (desktop only), deduplicating the
 * name on collision. Returns the actual file name written.
 */
export async function addTextToWorkspace(filename: string, content: string): Promise<string> {
  if (!isTauri) throw new Error("not running in the desktop app");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string>("add_text_to_workspace", { filename, content });
}

/** Write binary content (base64) into the workspace as `filename` (deduplicated).
 *  Used for pasted images. Returns the actual name written. */
export async function addBinaryToWorkspace(filename: string, base64: string): Promise<string> {
  if (!isTauri) throw new Error("not running in the desktop app");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string>("add_binary_to_workspace", { filename, base64 });
}

/** Copy explicit local file paths into the workspace (deduplicated). Used by
 *  drag-and-drop. Returns the names written. */
export async function addPathsToWorkspace(paths: string[]): Promise<string[]> {
  if (!isTauri) return [];
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string[]>("add_paths_to_workspace", { paths });
}

/** A workspace file's bytes as base64 plus its detected MIME type. */
export interface WorkspaceFileBytes {
  mime: string;
  base64: string;
}

/** Read a workspace file (by workspace-relative name) as base64 + MIME. Used to
 *  attach a workspace image to a prompt as an inline image part — the runtime's
 *  `read` tool treats an image as an opaque binary, so the model can only see it
 *  when the bytes ride along with the prompt. */
export async function readWorkspaceFileBase64(name: string): Promise<WorkspaceFileBytes> {
  if (!isTauri) throw new Error("not running in the desktop app");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<WorkspaceFileBytes>("read_workspace_file_base64", { name });
}

/** Read an absolute local file as base64 + MIME. Unlike
 *  `readWorkspaceFileBase64`, this touches paths outside the workspace — used
 *  for drag-dropped images so the composer can compress + attach them without
 *  copying them into the workspace first. */
export async function readLocalFileBase64(path: string): Promise<WorkspaceFileBytes> {
  if (!isTauri) throw new Error("not running in the desktop app");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<WorkspaceFileBytes>("read_local_file_base64", { path });
}

/**
 * Explicitly import the user's OpenCode CLI login into the app's private
 * runtime (desktop only). Returns false when no CLI login exists; the sidecar
 * is restarted on success.
 */
export async function importOpenCodeLogin(): Promise<boolean> {
  if (!isTauri) return false;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<boolean>("import_opencode_login");
}

/** Store provider credentials in the OS credential manager and restart the sidecar. */
export async function setProviderSecret(providerId: string, value: string): Promise<void> {
  if (!isTauri) throw new Error("not running in the desktop app");
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("set_provider_secret", { providerId, value });
}

/** Remove provider credentials from the OS credential manager. */
export async function removeProviderSecret(providerId: string): Promise<boolean> {
  if (!isTauri) return false;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<boolean>("remove_provider_secret", { providerId });
}

/** Migration state of the active workspace's science database. */
export interface ScienceDbStatus {
  version: number;
  appliedMigrationIds: string[];
  tableCount: number;
}

/** Read the active workspace's science database state. Null off the desktop. */
export async function workspaceScienceDb(): Promise<ScienceDbStatus | null> {
  if (!isTauri) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<ScienceDbStatus>("workspace_science_db");
}

/** The signed-in Sub2API account, identity only — the token stays in the Rust
 *  process and is never exposed here. */
export interface Sub2ApiAccount {
  email: string;
  baseUrl: string;
}

/** Result of fetching groups and existing key info. No API key — only metadata. */
export interface Sub2ApiGroupsAndKeys {
  groups: Array<{ id: number; name: string }>;
  existingKeyGroupIds: number[];
}

/** Result of provisioning a specific group. Deliberately carries no API key:
 *  the key went from the gateway's reply straight into the OS credential
 *  manager. */
export interface Sub2ApiProvisioned {
  providerId: string;
  baseUrl: string;
  models: string[];
  groups: Array<{ id: number; name: string }>;
}

/** One group to provision in a batch: which gateway group, and which provider id
 *  its key should be stored under. */
export interface Sub2ApiProvisionRequest {
  groupId: number;
  providerId: string;
}

/** Outcome of provisioning one group in a batch. No API key — the secret went
 *  straight into the OS credential manager. */
export interface Sub2ApiProvisionedGroup {
  providerId: string;
  groupId: number;
  baseUrl: string;
  models: string[];
}

/** Email the verification code that registration requires. The gateway host is
 *  compiled into the Rust side — there is no base URL to pass. */
export async function sub2apiSendCode(email: string): Promise<void> {
  if (!isTauri) throw new Error("not running in the desktop app");
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("sub2api_send_code", { email });
}

/** Create a Sub2API account. */
export async function sub2apiRegister(opts: {
  email: string;
  password: string;
  code?: string;
}): Promise<void> {
  if (!isTauri) throw new Error("not running in the desktop app");
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("sub2api_register", {
    email: opts.email,
    password: opts.password,
    code: opts.code,
  });
}

/** Sign in. The access token is held in the Rust process for this app run only. */
export async function sub2apiLogin(opts: {
  email: string;
  password: string;
  code?: string;
}): Promise<Sub2ApiAccount> {
  if (!isTauri) throw new Error("not running in the desktop app");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<Sub2ApiAccount>("sub2api_login", {
    email: opts.email,
    password: opts.password,
    code: opts.code,
  });
}

/** On launch, silently restore a session from keychain-saved credentials.
 *  Returns the account when a stored login still works, or null otherwise. */
export async function sub2apiRestoreSession(): Promise<Sub2ApiAccount | null> {
  if (!isTauri) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<Sub2ApiAccount | null>("sub2api_restore_session");
}

/** The account signed in during this app run, or null. */
export async function sub2apiAccount(): Promise<Sub2ApiAccount | null> {
  if (!isTauri) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<Sub2ApiAccount | null>("sub2api_account");
}

/** Forget the in-memory session. An already-provisioned key keeps working. */
export async function sub2apiLogout(): Promise<void> {
  if (!isTauri) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("sub2api_logout");
}

/** Fetch the account's groups and which groups already have keys. No key is
 *  stored or sidecar restarted — this is the read-only first step. */
export async function sub2apiFetchGroups(): Promise<Sub2ApiGroupsAndKeys> {
  if (!isTauri) throw new Error("not running in the desktop app");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<Sub2ApiGroupsAndKeys>("sub2api_fetch_groups");
}

/** Provision a specific group: find or create a key, list models, store the
 *  key in the OS credential manager, and restart the sidecar. */
export async function sub2apiProvisionGroup(groupId: number): Promise<Sub2ApiProvisioned> {
  if (!isTauri) throw new Error("not running in the desktop app");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<Sub2ApiProvisioned>("sub2api_provision_group", { groupId });
}

/** Provision several groups at once: one key per group, each stored under its own
 *  provider id, sidecar restarted once. Lets models from different gateway groups
 *  be reached without a manual per-group setup. */
export async function sub2apiProvisionGroups(
  requests: Sub2ApiProvisionRequest[],
): Promise<Sub2ApiProvisionedGroup[]> {
  if (!isTauri) throw new Error("not running in the desktop app");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<Sub2ApiProvisionedGroup[]>("sub2api_provision_groups", { requests });
}

/** The signed-in account's balance, as a display string (kept as a string to
 *  avoid float rounding — the UI formats it). */
export interface Sub2ApiBalance {
  balance: string;
}

/** One payment channel offered at checkout. */
export interface Sub2ApiPaymentMethod {
  code: string;
  label: string;
  available: boolean;
  minAmount: string | null;
  maxAmount: string | null;
}

/** Checkout parameters for the recharge dialog. */
export interface Sub2ApiCheckoutInfo {
  methods: Sub2ApiPaymentMethod[];
  globalMin: string | null;
  globalMax: string | null;
  helpText: string | null;
}

/** A recharge order. `qrCode` and `payUrl` are payment pointers, not secrets. */
export interface Sub2ApiPaymentOrder {
  id: string;
  paymentType: string | null;
  status: string;
  amount: string | null;
  payAmount: string | null;
  payUrl: string | null;
  qrCode: string | null;
  createdAt: string | null;
  expiresAt: string | null;
}

/** The signed-in account's balance. */
export async function sub2apiBalance(): Promise<Sub2ApiBalance> {
  if (!isTauri) throw new Error("not running in the desktop app");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<Sub2ApiBalance>("sub2api_balance");
}

/** Checkout parameters: available methods + amount bounds. */
export async function sub2apiCheckoutInfo(): Promise<Sub2ApiCheckoutInfo> {
  if (!isTauri) throw new Error("not running in the desktop app");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<Sub2ApiCheckoutInfo>("sub2api_checkout_info");
}

/** Create a balance-recharge order. Returns the QR payload and pay URL. */
export async function sub2apiCreateOrder(
  paymentType: string,
  amount: number,
): Promise<Sub2ApiPaymentOrder> {
  if (!isTauri) throw new Error("not running in the desktop app");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<Sub2ApiPaymentOrder>("sub2api_create_order", { paymentType, amount });
}

/** Poll a recharge order's status. */
export async function sub2apiOrderStatus(orderId: string): Promise<Sub2ApiPaymentOrder> {
  if (!isTauri) throw new Error("not running in the desktop app");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<Sub2ApiPaymentOrder>("sub2api_order_status", { orderId });
}

/** Recent recharge orders — used to recover a still-unpaid order's QR. */
export async function sub2apiListOrders(): Promise<Sub2ApiPaymentOrder[]> {
  if (!isTauri) throw new Error("not running in the desktop app");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<Sub2ApiPaymentOrder[]>("sub2api_list_orders");
}

/** Whether the OS credential manager has credentials for a provider. */
export async function providerSecretExists(providerId: string): Promise<boolean> {
  if (!isTauri) return false;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<boolean>("provider_secret_exists", { providerId });
}

/** Store one connector environment secret in the OS credential manager. */
export async function setConnectorSecret(
  connectorId: string,
  environment: string,
  value: string,
): Promise<void> {
  if (!isTauri) throw new Error("not running in the desktop app");
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("set_connector_secret", { connectorId, environment, value });
}

/** Remove one connector environment secret from the OS credential manager. */
export async function removeConnectorSecret(
  connectorId: string,
  environment: string,
): Promise<boolean> {
  if (!isTauri) return false;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<boolean>("remove_connector_secret", { connectorId, environment });
}

/** How agent actions get approved — the composer's Codex-style switch.
 *  "approve": dangerous shell commands (delete / install / remote / privilege)
 *  and web fetches prompt first. "full": everything in-workspace just runs. */
export type ApprovalMode = "approve" | "full";

/** The safe approval mode. Legacy "full" responses are normalized to approve. */
export async function getApprovalMode(): Promise<ApprovalMode> {
  if (!isTauri) return "approve";
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke<string>("get_approval_mode");
  return "approve";
}

/** Switch the approval mode; the sidecar restarts — the caller must reconnect. */
export async function setApprovalMode(mode: ApprovalMode): Promise<void> {
  if (!isTauri) return;
  if (mode !== "approve") throw new Error("full approval mode is disabled for safety");
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("set_approval_mode", { mode });
}

/** Network proxy for the sidecar: follow the OS, a fixed URL, or direct. */
export type ProxyMode = "system" | "custom" | "none";
export interface ProxySetting {
  mode: ProxyMode;
  /** The custom URL (empty unless mode is "custom"). */
  url: string;
  /** The proxy the sidecar would use right now; null ⇒ direct. */
  effective: string | null;
}

/** The persisted proxy setting (desktop only; null in browser). */
export async function getProxySetting(): Promise<ProxySetting | null> {
  if (!isTauri) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return await invoke<ProxySetting>("get_proxy_setting");
}

/** Persist the proxy setting; the sidecar restarts — the caller must reconnect. */
export async function setProxySetting(mode: ProxyMode, url: string): Promise<void> {
  if (!isTauri) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("set_proxy_setting", { mode, url });
}

/** Remote Access gateway — one authenticated API for CLI / LAN web / tunnel.
 *  See docs/rfc/remote-access-gateway.md. */
export type GatewayMode = "full" | "read-only";
export interface GatewayStatus {
  enabled: boolean;
  /** false = loopback only (127.0.0.1); true = bound to the LAN (0.0.0.0). */
  lan: boolean;
  mode: GatewayMode;
  running: boolean;
  port: number | null;
  loopbackUrl: string | null;
  /** The LAN URL (with the detected local IP) when `lan` is on and reachable. */
  lanUrl: string | null;
  /** The bearer token clients authenticate with (blank until first enabled). */
  token: string;
}

/** Current gateway status (desktop only; null in browser). */
export async function getGatewayStatus(): Promise<GatewayStatus | null> {
  if (!isTauri) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return await invoke<GatewayStatus>("gateway_status");
}

/** Enable/disable + set binding and access mode; (re)binds the server. */
export async function setGatewayConfig(
  enabled: boolean,
  lan: boolean,
  mode: GatewayMode,
): Promise<GatewayStatus | null> {
  if (!isTauri) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return await invoke<GatewayStatus>("set_gateway_config", { enabled, lan, mode });
}

/** Rotate the bearer token (old clients must re-enter the new one). */
export async function regenerateGatewayToken(): Promise<GatewayStatus | null> {
  if (!isTauri) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return await invoke<GatewayStatus>("regenerate_gateway_token");
}

/** uv download mirrors used only when provisioning Python tools (empty ⇒ default). */
export interface MirrorSetting {
  /** PyPI index URL (UV_DEFAULT_INDEX). */
  pypi: string;
  /** Python-download mirror (UV_PYTHON_INSTALL_MIRROR). */
  python: string;
}

/** The persisted uv mirrors (desktop only; null in browser). */
export async function getMirrorSetting(): Promise<MirrorSetting | null> {
  if (!isTauri) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return await invoke<MirrorSetting>("get_mirror_setting");
}

/** Persist the uv mirrors; blank fields clear. No sidecar restart. */
export async function setMirrorSetting(pypi: string, python: string): Promise<void> {
  if (!isTauri) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("set_mirror_setting", { pypi, python });
}

/** Per-session goal-mode state, as the bundled goal plugin records it.
 *  Passed through verbatim from goals.json — the plugin owns the schema. */
export interface GoalState {
  objective: string;
  /** The plugin's status enum (its schema owns the literals). */
  status: "active" | "paused" | "budgetLimited" | "usageLimited" | "complete" | "unmet" | string;
  autoTurns?: number | null;
  blocker?: string | null;
  completionEvidence?: string | null;
  lastStatus?: string | null;
}

/** The session's current goal (null when none / in browser dev). Reads the
 *  plugin's state file directly — a status pill must not cost a model turn. */
export async function goalState(sessionId: string): Promise<GoalState | null> {
  if (!isTauri) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  try {
    return await invoke<GoalState | null>("goal_state", { sessionId });
  } catch {
    return null;
  }
}

/** Pause / resume / clear the session's goal from the UI (no model turn).
 *  Continuation only fires while status is "active", so pause stops the loop
 *  at the next idle. Returns the new state (null after clear). */
export async function goalUpdate(
  sessionId: string,
  action: "pause" | "resume" | "clear",
): Promise<GoalState | null> {
  if (!isTauri) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<GoalState | null>("goal_update", { sessionId, action });
}

/** Remove a provider/mcp entry from the global OpenCode config (restarts the sidecar). */
export async function removeConfigEntry(section: "provider" | "mcp", key: string): Promise<void> {
  if (!isTauri) throw new Error("not running in the desktop app");
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("remove_config_entry", { section, key });
}

export interface JupyterStatus {
  installed: boolean;
  running: boolean;
  url: string | null;
  mcp_command: string | null;
}

/** State of the app-managed Jupyter environment (desktop only). */
export async function jupyterStatus(): Promise<JupyterStatus | null> {
  if (!isTauri) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<JupyterStatus>("jupyter_status");
}

/** Provision the isolated Jupyter env via bundled uv (first run: minutes, ~hundreds of MB). */
export async function setupJupyter(): Promise<void> {
  if (!isTauri) throw new Error("not running in the desktop app");
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("setup_jupyter");
}

/** Start the managed headless jupyter-lab (idempotent). */
export async function startJupyter(): Promise<JupyterStatus> {
  if (!isTauri) throw new Error("not running in the desktop app");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<JupyterStatus>("start_jupyter");
}

/** Register Jupyter MCP inside Rust; its token never enters the renderer. */
export async function registerJupyterMcp(): Promise<void> {
  if (!isTauri) throw new Error("not running in the desktop app");
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("acp_host_register_jupyter_mcp");
}

/** Open the app-managed JupyterLab in the system browser, starting the server
 *  if needed. Returns false when Jupyter has not been set up yet (the caller
 *  should point the user at Settings). Same env the agent drives, same files.
 *
 *  `notebook` is a path RELATIVE TO THE LAB ROOT (the active workspace) — pass
 *  it to open that file directly (`/lab/tree/<path>`); omit to land on the lab
 *  home. Only pass a path you know is under the workspace root. */
export async function openJupyterLab(notebook?: string): Promise<boolean> {
  if (!isTauri) return false;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<boolean>("open_jupyter_lab", { notebook: notebook ?? null });
}

/** The interpreter local Python kernels resolve to, and where it came from. */
export interface PythonInterpreter {
  /** The manual override, if one is set (even when it no longer runs). */
  configured: string | null;
  /** What cells would actually run on right now. */
  resolved: string | null;
  source: "manual" | "system" | "jupyter-env" | null;
  error: string | null;
}

export async function pythonInterpreter(): Promise<PythonInterpreter | null> {
  if (!isTauri) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<PythonInterpreter>("python_interpreter");
}

/** Set (empty clears) the manual Python interpreter override. Validated on save. */
export async function setPythonPath(path: string): Promise<void> {
  if (!isTauri) throw new Error("not running in the desktop app");
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("set_python_path", { path });
}

/** One live output line from a provisioning run (jupyter / science MCP env, or
 *  an agent-browser Chrome download). */
export interface SetupProgress {
  task: "jupyter" | "science" | "browser";
  line: string;
}

/** Subscribe to setup progress lines; returns the unlisten function. */
export async function watchSetupProgress(
  cb: (p: SetupProgress) => void,
): Promise<() => void> {
  if (!isTauri) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  return listen<SetupProgress>("setup-progress", (e) => cb(e.payload));
}

/** Managed interpreter path for the shared science-MCP env, or null if not yet
 *  provisioned (desktop only). */
export async function scienceMcpPython(): Promise<string | null> {
  if (!isTauri) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string | null>("science_mcp_python");
}

/** Provision one open-source MCP pip package into the shared isolated env and
 *  return the managed Python path to launch it with (desktop only). */
export async function setupScienceMcp(pkg: string): Promise<string> {
  if (!isTauri) throw new Error("not running in the desktop app");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string>("setup_science_mcp", { package: pkg });
}

// ---- Browser control (bundled agent-browser sidecar) ----

/** A Chrome profile agent-browser can reuse. `directory` is passed as
 *  AGENT_BROWSER_PROFILE ("Default", "Profile 4"); `name` is the account label. */
export interface BrowserProfile {
  directory: string;
  name: string;
}

/** An installed Chromium-family browser we can reuse instead of downloading. */
export interface ChromeInfo {
  path: string;
  kind: "chrome" | "chromium" | "edge" | "brave" | string;
}

/** Absolute path to the bundled agent-browser sidecar (for the MCP command).
 *  Throws in browser dev; the caller only needs it inside the desktop app. */
export async function agentBrowserBin(): Promise<string> {
  if (!isTauri) throw new Error("not running in the desktop app");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string>("agent_browser_bin");
}

/** The user's Chrome profiles (empty when no Chrome / not desktop). */
export async function agentBrowserProfiles(): Promise<BrowserProfile[]> {
  if (!isTauri) return [];
  const { invoke } = await import("@tauri-apps/api/core");
  try {
    return await invoke<BrowserProfile[]>("agent_browser_profiles");
  } catch {
    return [];
  }
}

/** First installed Chrome/Chromium/Edge/Brave, or null. Setting its path as the
 *  browser executable avoids a Chrome-for-Testing download and (on macOS) lets
 *  the real profile's cookies decrypt without a Keychain prompt. */
export async function detectChrome(): Promise<ChromeInfo | null> {
  if (!isTauri) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  try {
    return await invoke<ChromeInfo | null>("detect_chrome");
  } catch {
    return null;
  }
}

/** Download a browser (Chrome for Testing) when none is installed. Streams
 *  progress as `setup-progress` (task "browser") and honors the proxy setting. */
export async function setupBrowserChrome(): Promise<void> {
  if (!isTauri) throw new Error("not running in the desktop app");
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("setup_browser_chrome");
}

/** Auto-start Jupyter on launch when it was enabled before. Silent no-op otherwise. */
export async function ensureJupyter(): Promise<void> {
  try {
    const s = await jupyterStatus();
    if (s?.installed && !s.running) await startJupyter();
  } catch {
    /* Jupyter is optional — never block the app on it */
  }
}

/** Open an http(s) URL in the system browser (never navigates the webview). */
export async function openExternal(url: string): Promise<void> {
  if (!/^https?:\/\//i.test(url)) return;
  if (isTauri) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("open_url", { url });
    } catch {
      /* opening a link must never break the app */
    }
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export interface LatestRelease {
  version: string;
  url: string;
  name: string | null;
  publishedAt: string | null;
  assetUrl?: string | null;
  assetName?: string | null;
  assetSha256?: string | null;
}

export async function latestRelease(): Promise<LatestRelease | null> {
  if (!isTauri) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<LatestRelease>("latest_release");
}

export type SaveResult =
  | { kind: "saved"; path: string }
  | { kind: "canceled" }
  | { kind: "not-desktop" };

/** Save text via the native "Save As" dialog (desktop only). Throws on write failure. */
export async function saveTextFile(filename: string, content: string): Promise<SaveResult> {
  if (!isTauri) return { kind: "not-desktop" };
  const { invoke } = await import("@tauri-apps/api/core");
  const path = await invoke<string | null>("save_text_file", { filename, content });
  return path ? { kind: "saved", path } : { kind: "canceled" };
}

/** The active workspace directory (desktop only; null in browser). */
export async function workspacePath(): Promise<string | null> {
  if (!isTauri) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<string>("workspace_path");
  } catch {
    return null;
  }
}

/** The base folder new dated workspaces are created under (desktop only). */
export async function workspaceBase(): Promise<string | null> {
  if (!isTauri) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<string>("workspace_base");
  } catch {
    return null;
  }
}

/** Choose the base folder new session workspaces are created under.
 *  Returns the canonical path. Throws in the browser. */
export async function setWorkspaceBase(path: string): Promise<string> {
  if (!isTauri) throw new Error("not running in the desktop app");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string>("set_workspace_base", { path });
}

/** Reveal the base workspace folder in the OS file manager. */
export async function openWorkspaceBase(): Promise<void> {
  if (!isTauri) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("open_workspace_base");
}

/** Switch the active workspace folder (creates it if needed; the runtime
 *  rescopes via `?directory=` — no restart). Returns the canonical path.
 *  Throws in the browser. */
export async function setWorkspace(path: string): Promise<string> {
  if (!isTauri) throw new Error("not running in the desktop app");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string>("set_workspace", { path });
}

/** Record which session owns the active workspace (written to
 *  `.zerowall/session.txt`) so skill helpers can attribute remote runs. */
export async function markSession(sessionId: string): Promise<void> {
  if (!isTauri) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("mark_session", { sessionId });
}

/** Best-effort local git checkpoint for the active workspace. Returns false
 *  when there were no changes. Never configures a remote or pushes. */
export async function commitWorkspaceSnapshot(message: string): Promise<boolean> {
  if (!isTauri) return false;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<boolean>("commit_workspace_snapshot", { message });
}

/** The current workspace snapshot tip, recorded at turn start as the baseline
 *  for a later turn undo. `null` when nothing has been snapshotted yet, or off
 *  the desktop (turn undo is desktop-only). */
export async function workspaceSnapshotTip(): Promise<string | null> {
  if (!isTauri) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string | null>("workspace_snapshot_tip", {});
}

/** What undo of the turn would change to each file: revert an in-place edit,
 *  delete a file the turn created, or bring back one the turn deleted. */
export type TurnUndoStatus = "restore" | "remove" | "recreate";
export interface TurnUndoEntry {
  path: string;
  status: TurnUndoStatus;
}
export interface TurnUndoPreview {
  entries: TurnUndoEntry[];
}

/** Preview which files an undo back to `baseline` would change (read-only). */
export async function previewTurnUndo(baseline: string): Promise<TurnUndoPreview> {
  if (!isTauri) return { entries: [] };
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<TurnUndoPreview>("preview_turn_undo_cmd", { baseline });
}

/** Roll the workspace's files back to `baseline` for exactly the files the turn
 *  touched (takes a safety snapshot first). Returns the count of files changed. */
export async function undoTurn(baseline: string): Promise<number> {
  if (!isTauri) throw new Error("not running in the desktop app");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<number>("undo_turn_cmd", { baseline });
}

/** Create a new dated folder under the base workspace and switch to it. */
export async function newDatedWorkspace(name: string): Promise<string> {
  if (!isTauri) throw new Error("not running in the desktop app");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string>("new_dated_workspace", { name });
}

/** A project: a named workspace folder under the base dir, marked by its
 *  `.zerowall/project.json`. Sessions group under it by `directory`. */
export interface ProjectInfo {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  /** Absolute workspace folder (canonical, matches session `directory`). For a
   *  copy-import this is the local copy under the base dir. */
  path: string;
  /** True when this project was brought in from elsewhere (a copy-import, or a
   *  legacy in-place import) — drives the "imported" badge. */
  imported: boolean;
  /** Where an imported project was brought in from (shown as a hint). Absent for
   *  app-created projects. */
  importedFrom?: string;
  /** Whether this project is pinned to the sidebar. */
  pinned: boolean;
}

/** Create a project folder (with metadata, harness and an initial git
 *  snapshot). Does not switch the active workspace. */
export async function createProject(name: string): Promise<ProjectInfo> {
  if (!isTauri) throw new Error("not running in the desktop app");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<ProjectInfo>("create_project", { name });
}

/** Import an existing repo/folder as a project, referenced in place: the repo
 *  is not moved, not scaffolded, and never auto-committed into. */
export async function importProject(path: string): Promise<ProjectInfo> {
  if (!isTauri) throw new Error("not running in the desktop app");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<ProjectInfo>("import_project", { path });
}

/** Every project under the base dir, sorted by name. */
export async function listProjects(): Promise<ProjectInfo[]> {
  if (isGatewayWeb) return (await gatewayGet<ProjectInfo[]>("/v1/projects")) ?? [];
  if (!isTauri) return [];
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<ProjectInfo[]>("list_projects");
}

/** Rename a project's display name (keyed by id; the folder never moves). */
export async function renameProject(id: string, name: string): Promise<void> {
  if (!isTauri) throw new Error("not running in the desktop app");
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("rename_project", { id, name });
}

/** Open a project's workspace folder in the OS file manager (Finder / Explorer /
 *  Linux file manager). Resolved server-side from the project id. */
export async function openProjectFolder(id: string): Promise<void> {
  if (!isTauri) throw new Error("not running in the desktop app");
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("open_project_folder", { id });
}

/** Pin/unpin a project to the sidebar. */
export async function setProjectPinned(id: string, pinned: boolean): Promise<void> {
  if (!isTauri) throw new Error("not running in the desktop app");
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("set_project_pinned", { id, pinned });
}

/** Remove a project from the index. Files on disk are NOT deleted (an imported
 *  project's external repo is untouched; an app-created project's folder stays,
 *  demoted to a plain folder). */
export async function deleteProject(id: string): Promise<void> {
  if (!isTauri) throw new Error("not running in the desktop app");
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("delete_project", { id });
}

/** Native folder picker; null on cancel or in the browser. */
export async function pickFolder(): Promise<string | null> {
  if (!isTauri) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string | null>("pick_folder");
}

export interface ToolStatus {
  name: string;
  found: boolean;
  version?: string | null;
}

/** Detect scientific/runtime tools on the user's system (desktop only). */
export async function detectTools(): Promise<ToolStatus[]> {
  if (!isTauri) return [];
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<ToolStatus[]>("detect_tools");
}

/** Host aliases from the user's ~/.ssh/config (desktop only). */
export async function listSshHosts(): Promise<string[]> {
  if (!isTauri) return [];
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string[]>("list_ssh_hosts");
}

/**
 * Installed WSL distribution names (Windows desktop only; empty elsewhere or
 * when WSL isn't installed). Each becomes a `wsl:<distro>` compute machine.
 */
export async function listWslDistros(): Promise<string[]> {
  if (!isTauri) return [];
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string[]>("list_wsl_distros_cmd");
}

export interface GpuInfo {
  name: string;
  mem_total_mib: number;
  mem_used_mib: number;
  util_pct: number;
}

/** One live SSH probe of a remote machine (capabilities + usage snapshot). */
export interface ComputeProbe {
  reachable: boolean;
  message: string | null;
  os: string | null;
  cores: number | null;
  load1: number | null;
  mem_total_bytes: number | null;
  mem_avail_bytes: number | null;
  disk_total_bytes: number | null;
  disk_free_bytes: number | null;
  gpus: GpuInfo[];
  slurm: string | null;
}

/** Static capability cache the agent reads to pick a machine. */
export interface MachineCaps {
  cores: number | null;
  mem_total_bytes: number | null;
  gpus: string[];
  slurm: string | null;
}

export interface Machine {
  host: string;
  label: string | null;
  caps: MachineCaps | null;
}

/** A Slurm queue entry. */
export interface ComputeJob {
  id: string;
  state: string;
  time: string;
  partition: string;
  name: string;
}

/** Saved remote machines (migrates a legacy hpc.json on first read). */
export async function computeMachines(): Promise<Machine[]> {
  if (!isTauri) return [];
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<Machine[]>("compute_machines");
}

/** Save (or update the label of) a remote machine. */
export async function addComputeMachine(host: string, label?: string): Promise<void> {
  if (!isTauri) throw new Error("not running in the desktop app");
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("add_compute_machine", { host, label: label ?? null });
}

export async function removeComputeMachine(host: string): Promise<void> {
  if (!isTauri) throw new Error("not running in the desktop app");
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("remove_compute_machine", { host });
}

/** Probe a machine over SSH; also caches its static caps for the agent. */
export async function computeProbe(host: string): Promise<ComputeProbe> {
  if (!isTauri) throw new Error("not running in the desktop app");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<ComputeProbe>("compute_probe", { host });
}

/** A Slurm host's queue. */
export async function computeJobs(host: string): Promise<ComputeJob[]> {
  if (!isTauri) return [];
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<ComputeJob[]>("compute_jobs", { host });
}

export async function computeCancel(host: string, jobId: string): Promise<void> {
  if (!isTauri) throw new Error("not running in the desktop app");
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("compute_cancel", { host, jobId });
}

export interface ModalStatus {
  installed: boolean;
  version: string | null;
  authenticated: boolean;
  hint: string | null;
}

/** Detect whether the user's Modal CLI is installed and authenticated. */
export async function modalStatus(): Promise<ModalStatus | null> {
  if (!isTauri) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<ModalStatus>("modal_status");
}

/** Append a diagnostic line to <app-data>/debug.log (desktop only; no-op in browser). */
export async function logDebug(message: string): Promise<void> {
  if (!isTauri) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("log_debug", { message });
  } catch {
    /* never let diagnostics break the app */
  }
}

/** Download a release asset into app-data staging. The caller decides when to
 * open the installer, so an update never interrupts an active turn. */
export async function downloadUpdate(url: string, filename: string, sha256?: string | null): Promise<string> {
  if (!isTauri) throw new Error("updates are available in the desktop app only");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string>("download_update", { url, filename, sha256: sha256 ?? null });
}

export type AppUpdatePhase = "idle" | "downloading" | "verifying" | "ready" | "restart-required" | "failed";

export interface AppUpdateSnapshot {
  phase: AppUpdatePhase;
  message: string | null;
  downloadedBytes: number;
  totalBytes: number | null;
  targetPath: string | null;
}

export async function appUpdateStatus(): Promise<AppUpdateSnapshot | null> {
  if (!isTauri) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<AppUpdateSnapshot>("app_update_status");
}

export async function appUpdateCancel(): Promise<AppUpdateSnapshot> {
  if (!isTauri) throw new Error("updates are available in the desktop app only");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<AppUpdateSnapshot>("app_update_cancel");
}

export async function openDownloadedUpdate(path: string): Promise<void> {
  if (!isTauri) throw new Error("updates are available in the desktop app only");
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("open_downloaded_update", { path });
}

export type EnvironmentUpdatePhase =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "verifying"
  | "installing"
  | "restart-required"
  | "failed"
  | "rolled-back";

export interface EnvironmentUpdateSnapshot {
  phase: EnvironmentUpdatePhase;
  currentVersion: string | null;
  previousVersion: string | null;
  targetVersion: string | null;
  message: string | null;
  downloadedBytes: number;
  totalBytes: number | null;
  currentComponent: string | null;
}

export async function environmentUpdateManifest(): Promise<string> {
  if (!isTauri) throw new Error("environment updates are available in the desktop app only");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string>("environment_update_manifest");
}

export async function environmentUpdateStatus(): Promise<EnvironmentUpdateSnapshot | null> {
  if (!isTauri) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<EnvironmentUpdateSnapshot>("environment_update_status");
}

export async function environmentUpdateCheck(envelopeJson: string): Promise<EnvironmentUpdateSnapshot> {
  if (!isTauri) throw new Error("environment updates are available in the desktop app only");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<EnvironmentUpdateSnapshot>("environment_update_check", { envelopeJson });
}

export async function environmentUpdateInstall(envelopeJson: string): Promise<EnvironmentUpdateSnapshot> {
  if (!isTauri) throw new Error("environment updates are available in the desktop app only");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<EnvironmentUpdateSnapshot>("environment_update_install", { envelopeJson });
}

export async function environmentUpdateCancel(): Promise<EnvironmentUpdateSnapshot> {
  if (!isTauri) throw new Error("environment updates are available in the desktop app only");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<EnvironmentUpdateSnapshot>("environment_update_cancel");
}

export async function environmentUpdateRollback(): Promise<EnvironmentUpdateSnapshot> {
  if (!isTauri) throw new Error("environment updates are available in the desktop app only");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<EnvironmentUpdateSnapshot>("environment_update_rollback");
}

/** Durable Workflow run storage. The Rust side writes a single app-data JSON
 * file with a temporary-file + rename commit; browser mode keeps no durable
 * native state and callers should supply an in-memory fallback. */
export async function saveWorkflowRun(runId: string, run: unknown): Promise<void> {
  if (!isTauri) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("workflow_run_save", { runId, run });
}

export async function loadWorkflowRun<T>(runId: string): Promise<T | null> {
  if (!isTauri) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T | null>("workflow_run_load", { runId });
}

export async function listIncompleteWorkflowRuns<T>(): Promise<T[]> {
  if (!isTauri) return [];
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T[]>("workflow_runs_incomplete");
}

/** Sync the native window appearance with the in-app theme so the macOS
 *  vibrancy material behind the translucent sidebar matches (warm and light
 *  are both light appearances). */
export async function setWindowTheme(dark: boolean): Promise<void> {
  if (!isTauri) return;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().setTheme(dark ? "dark" : "light");
  } catch (e) {
    // Best-effort — without it the material follows the system appearance.
    // Loud in the console: a denied capability here looks like a CSS bug.
    console.warn("setWindowTheme failed:", e);
  }
}

/** Set the webview page zoom (desktop only). We own zoom ourselves rather than
 *  Tauri's `zoomHotkeysEnabled` so the titlebar strips can counter-scale by the
 *  same factor — the native traffic lights don't zoom (see ZoomProvider). */
export async function setWebviewZoom(factor: number): Promise<void> {
  if (!isTauri) return;
  try {
    const { getCurrentWebview } = await import("@tauri-apps/api/webview");
    await getCurrentWebview().setZoom(factor);
  } catch (e) {
    // Best-effort — a denied capability just leaves the page at 100%.
    console.warn("setWebviewZoom failed:", e);
  }
}

/** True when the current UA is macOS (traffic lights live in the window chrome). */
export function isMacUA(): boolean {
  return typeof navigator !== "undefined" && navigator.userAgent.includes("Mac");
}

/** Whether the macOS traffic lights overlap our content and need a left inset.
 *  Only in the packaged macOS webview (overlay titlebar) AND when not fullscreen
 *  — native fullscreen slides the lights away, so the inset would be an empty
 *  gap (the sidebar/expand buttons floated oddly indented in fullscreen). */
export function trafficLightsPresent(tauri: boolean, mac: boolean, fullscreen: boolean): boolean {
  return tauri && mac && !fullscreen;
}

/** Watch the window's fullscreen state (desktop only). Reports the current
 *  value immediately and on every enter/leave — fullscreen resizes the window,
 *  so a resize listener catches it. Returns an unlisten fn; in a plain browser
 *  it reports `false` once and unlisten is a no-op. */
export async function watchFullscreen(cb: (fullscreen: boolean) => void): Promise<() => void> {
  if (!isTauri) {
    cb(false);
    return () => {};
  }
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const win = getCurrentWindow();
  const sync = async () => {
    try {
      cb(await win.isFullscreen());
    } catch {
      // Window gone or API unavailable — keep the last known value.
    }
  };
  await sync();
  return win.onResized(() => void sync());
}
