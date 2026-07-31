// ACP client bridge (Part C, Phase 5): the frontend seam to the Rust host
// consumer (`src-tauri/src/acp_consumer.rs`), which owns an external ACP agent
// (Codex, Claude Code) as a switchable second runtime beside OpenCode.
//
// Desktop-only by construction: an ACP agent is a local child process reached
// only through Tauri commands, so every call here no-ops (or returns an idle
// status) off the desktop. A UI that offers ACP must still hide itself in web
// mode (`isGatewayWeb`) rather than present a control that does nothing.
//
// Two halves:
//  - command wrappers (launch / prompt / cancel / shutdown / reply) — Tauri
//    lowercases snake_case params to camelCase, so JS args are camelCase;
//  - a typed subscription to the ten `acp:*` events the consumer emits. Those
//    payloads are serde structs whose field names stay snake_case, so the
//    payload interfaces below are snake_case on purpose.
//
// Secrets NEVER cross this seam as values: `launch` sends only references
// (`{ envVar, providerId }`); the Rust side materializes the key from the OS
// keychain at spawn time (see AGENTS.md).
import { isTauri, logDebug } from "./tauri";

/** Live status of the single ACP session (one agent at a time, like Jupyter). */
export interface AcpStatus {
  running: boolean;
  /** Profile id of the running agent, or null when idle. */
  profile_id: string | null;
}

/** A keychain-backed environment injection: set `envVar` from `providerId`'s
 *  stored key. The value is read server-side and never travels through JS. */
export interface AcpSecretRef {
  envVar: string;
  providerId: string;
}

/** What `launch` needs to start an agent. `env` carries only NON-secret vars
 *  (model selection, base URLs, flags); secret keys go through `secrets`. */
export interface AcpLaunchRequest {
  id: string;
  label: string;
  command: string;
  args?: string[];
  /** Non-secret environment (`[name, value]` pairs). */
  env?: [string, string][];
  /** Secret references resolved from the keychain at spawn time. */
  secrets?: AcpSecretRef[];
}

async function invoker() {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke;
}

const IDLE: AcpStatus = { running: false, profile_id: null };

/** Current ACP session status (idle off-desktop). */
export async function acpStatus(): Promise<AcpStatus> {
  if (!isTauri) return IDLE;
  const invoke = await invoker();
  return invoke<AcpStatus>("acp_status");
}

/** Launch (or switch to) an ACP agent as the active session. Any running agent
 *  is shut down first. Throws off-desktop — the caller gates on `isTauri`. */
export async function acpLaunch(request: AcpLaunchRequest): Promise<AcpStatus> {
  if (!isTauri) throw new Error("ACP agents run only in the desktop app");
  const invoke = await invoker();
  return invoke<AcpStatus>("acp_launch", {
    request: {
      id: request.id,
      label: request.label,
      command: request.command,
      args: request.args ?? [],
      env: request.env ?? [],
      secrets: (request.secrets ?? []).map((s) => ({
        env_var: s.envVar,
        provider_id: s.providerId,
      })),
    },
  });
}

/** Send one user turn to the active agent. */
export async function acpPrompt(text: string): Promise<void> {
  if (!isTauri) return;
  const invoke = await invoker();
  await invoke("acp_prompt", { text });
}

/** Cancel the in-flight turn. */
export async function acpCancel(): Promise<void> {
  if (!isTauri) return;
  const invoke = await invoker();
  await invoke("acp_cancel");
}

/** Shut the active agent down (returns the now-idle status). */
export async function acpShutdown(): Promise<AcpStatus> {
  if (!isTauri) return IDLE;
  const invoke = await invoker();
  return invoke<AcpStatus>("acp_shutdown");
}

/** Answer a pending permission request. `optionId = null` rejects (fail-closed
 *  in the crate). Unknown ids are ignored server-side. */
export async function acpReplyPermission(
  permissionId: number,
  optionId: string | null,
): Promise<void> {
  if (!isTauri) return;
  const invoke = await invoker();
  await invoke("acp_reply_permission", { permissionId, optionId });
}

/** Answer a pending command-execution approval. `allow = false` rejects; the
 *  crate fails the terminal creation closed so the command never spawns. */
export async function acpReplyExec(execId: number, allow: boolean): Promise<void> {
  if (!isTauri) return;
  const invoke = await invoker();
  await invoke("acp_reply_exec", { execId, allow });
}

// ---- events (payloads are serde structs → snake_case field names) ----

/** `acp:message` / `acp:thought` — a chunk of agent text; `message_id` groups
 *  chunks of the same reply (null when the agent didn't supply one). */
export interface AcpMessagePayload {
  message_id: string | null;
  text: string;
}

/** `acp:usage` — cumulative context-window usage for the turn, plus optional
 *  cost. Mirrors Part T: a null `cost` means the provider priced nothing (shown
 *  as "—", distinct from a real $0.00). */
export interface AcpUsagePayload {
  used: number;
  size: number;
  cost: { amount: number; currency: string } | null;
}

/** `acp:permission` — the agent asks to do something; the user picks an option
 *  (by `option_id`) or rejects. `request` is the raw ACP request JSON. */
export interface AcpPermissionPayload {
  permission_id: number;
  request: unknown;
  options: { option_id: string; name: string }[];
}

/** `acp:exec-approval` — the agent wants to run a command. The host MUST approve
 *  (via `acpReplyExec`) before the process is spawned. */
export interface AcpExecApprovalPayload {
  exec_id: number;
  command: string;
  args: string[];
  cwd: string | null;
}

/** The full set of ACP events, each optional. Unset handlers are simply not
 *  subscribed. `toolCall` and `plan` carry the raw ACP JSON (shape owned by the
 *  protocol), so they are typed `unknown` — the renderer narrows them. */
export interface AcpEventHandlers {
  onMessage?: (payload: AcpMessagePayload) => void;
  onThought?: (payload: AcpMessagePayload) => void;
  onToolCall?: (payload: unknown) => void;
  onPlan?: (payload: unknown) => void;
  onUsage?: (payload: AcpUsagePayload) => void;
  onFileWritten?: (path: string) => void;
  onPermission?: (payload: AcpPermissionPayload) => void;
  onExecApproval?: (payload: AcpExecApprovalPayload) => void;
  /** A turn finished; `stopReason` is the agent's stop reason string. */
  onTurnEnded?: (stopReason: string) => void;
  /** The agent process exited; `error` is set on an abnormal exit. */
  onExited?: (error: string | null) => void;
}

/**
 * Subscribe to every ACP event whose handler is provided. Returns a single
 * unlisten function that drops all of them; call it on unmount / runtime switch.
 * Off-desktop it subscribes to nothing and unlisten is a no-op.
 */
export async function subscribeAcp(handlers: AcpEventHandlers): Promise<() => void> {
  if (!isTauri) return () => {};
  const { listen } = await import("@tauri-apps/api/event");

  // Pair each event name with its handler (skip the ones the caller omitted),
  // then subscribe them together so a single unlisten tears them all down.
  const bindings: [string, ((payload: never) => void) | undefined][] = [
    ["acp:message", handlers.onMessage],
    ["acp:thought", handlers.onThought],
    ["acp:tool-call", handlers.onToolCall],
    ["acp:plan", handlers.onPlan],
    ["acp:usage", handlers.onUsage],
    ["acp:file-written", handlers.onFileWritten],
    ["acp:permission", handlers.onPermission],
    ["acp:exec-approval", handlers.onExecApproval],
    ["acp:turn-ended", handlers.onTurnEnded],
    ["acp:exited", handlers.onExited],
  ];

  const unlistens = await Promise.all(
    bindings
      .filter(([, handler]) => handler !== undefined)
      .map(([event, handler]) =>
        listen(event, (e: { payload: never }) => {
          try {
            handler!(e.payload);
          } catch (err) {
            void logDebug(
              `ACP handler for ${event} threw: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }),
      ),
  );

  return () => {
    for (const un of unlistens) un();
  };
}
