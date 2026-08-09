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
// Secrets NEVER cross this seam. `launch` sends a provider id, gateway URL, and
// model; Rust resolves the key and every executable/environment detail.
import { isTauri, logDebug } from "./tauri";
import type { McpToolGrantSnapshot, SkillScope, SkillSnapshot } from "@zerowall/sdk";

/** Media attached to an ACP turn. The Rust host turns images into protocol
 * content blocks and documents into explicit text context without logging data. */
export interface AcpPromptAttachment {
  filename: string;
  mime: string;
  base64: string;
  extractedText?: string;
}

/** Live status of the single ACP session (one agent at a time, like Jupyter). */
export interface AcpStatus {
  phase: "idle" | "starting" | "ready" | "busy" | "stopping" | "error";
  profile_id: string | null;
  runtime_info: AcpRuntimeInfo | null;
  last_error: AcpRuntimeError | null;
}

export interface AcpRuntimeError {
  stage: string;
  code: string;
  message: string;
}

export interface AcpRuntimeInfo {
  profile_id: string;
  availability: "available" | "cli_not_found" | "cli_unverified" | "adapter_not_found";
  executable_path: string | null;
  cli_version: string | null;
  adapter_version: string;
  error: AcpRuntimeError | null;
}

/** A host-vetted MCP server linked to an ACP session. No environment values or
 * credentials cross this read-only diagnostic boundary. */
export interface AcpMcpServerInfo {
  name: string;
  status: string;
  command: string;
  args: string[];
}

/** A bundled skill copied into an ACP runtime's isolated skills directory. */
export interface AcpSkillInfo {
  name: string;
  description: string;
  location: string;
  sha256: string;
}

export function createSkillSnapshots(
  skills: readonly AcpSkillInfo[],
  scope: SkillScope,
): SkillSnapshot[] {
  const unique = new Map<string, SkillSnapshot>();
  for (const skill of skills) {
    const snapshot: SkillSnapshot = {
      id: skill.name.trim(),
      version: "installed",
      scope,
      sha256: skill.sha256.trim(),
    };
    if (!snapshot.id || !snapshot.sha256) continue;
    const key = [snapshot.id, snapshot.version, snapshot.scope, snapshot.sha256].join("\u0000");
    unique.set(key, snapshot);
  }
  return [...unique.values()].sort((left, right) =>
    [left.id, left.version, left.scope, left.sha256].join("\u0000")
      .localeCompare([right.id, right.version, right.scope, right.sha256].join("\u0000")),
  );
}

export interface AcpLaunchRequest {
  profileId: string;
  /** Stable product conversation id. The Host execution id may change when
   *  the user switches engine/model, but this id stays visible in React. */
  logicalConversationId?: string;
  /** Superseded immutable Host executions belonging to the same logical
   *  conversation. They remain persisted but never render as extra chats. */
  hiddenExecutionIds?: string[];
  conversationId?: string;
  projectRoot: string;
  mcpAllowList?: string[];
  mcpToolGrants?: McpToolGrantSnapshot[];
  skillsSnapshot?: SkillSnapshot[];
  gateway: {
    providerId: string;
    baseUrl: string;
    model: string;
    platform?: string;
  };
}

async function invoker() {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke;
}

const IDLE: AcpStatus = {
  phase: "idle",
  profile_id: null,
  runtime_info: null,
  last_error: null,
};

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
      profile_id: request.profileId,
      ...(request.conversationId ? { conversation_id: request.conversationId } : {}),
      project_root: request.projectRoot,
      gateway: {
        provider_id: request.gateway.providerId,
        base_url: request.gateway.baseUrl,
        model: request.gateway.model,
        ...(request.gateway.platform ? { platform: request.gateway.platform } : {}),
      },
      ...(request.mcpAllowList !== undefined ? { mcp_allow_list: [...request.mcpAllowList] } : {}),
      ...(request.mcpToolGrants !== undefined ? { mcp_tool_grants: [...request.mcpToolGrants] } : {}),
      ...(request.skillsSnapshot !== undefined ? { skills_snapshot: [...request.skillsSnapshot] } : {}),
    },
  });
}

export async function acpProbeRuntime(profileId: string): Promise<AcpRuntimeInfo> {
  if (!isTauri) throw new Error("ACP agents run only in the desktop app");
  const invoke = await invoker();
  return invoke<AcpRuntimeInfo>("acp_probe_runtime", { profileId });
}

/** Prepare the native ACP runtime's app-owned skills and vetted MCP descriptors.
 * This is intentionally a runtime-switch operation, never a model-switch one. */
export async function acpPrepareEnvironment(profileId: string): Promise<void> {
  if (!isTauri) throw new Error("ACP agents run only in the desktop app");
  const invoke = await invoker();
  await invoke("acp_prepare_environment", { profileId });
}

export async function acpListMcpServers(): Promise<AcpMcpServerInfo[]> {
  if (!isTauri) return [];
  const invoke = await invoker();
  return invoke<AcpMcpServerInfo[]>("acp_list_mcp_servers");
}

export async function acpListSkills(profileId: string): Promise<AcpSkillInfo[]> {
  if (!isTauri) return [];
  const invoke = await invoker();
  return invoke<AcpSkillInfo[]>("acp_list_skills", { profileId });
}

/** Send one user turn to the active agent, including any image or document
 * context selected in the composer. */
export async function acpPrompt(
  text: string,
  attachments: AcpPromptAttachment[] = [],
): Promise<void> {
  if (!isTauri) return;
  const invoke = await invoker();
  await invoke("acp_prompt", { text, attachments });
}

/** Switch the model in the current ACP session without restarting its runtime. */
export async function acpSetModel(model: string): Promise<void> {
  if (!isTauri) throw new Error("ACP agents run only in the desktop app");
  const invoke = await invoker();
  await invoke("acp_set_model", { model });
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

/** `acp:usage` — cumulative context-window occupancy for the turn. ACP 1.4
 * does not include exact input/output token counts; consumers must not treat
 * `used` as billed input. */
export interface AcpUsagePayload {
  used: number;
  size: number;
  /** Exact provider counters carried by an adapter extension, when present. */
  token_usage?: AcpTokenUsagePayload;
}

/** Cumulative token counters returned by ACP at prompt completion. */
export interface AcpTokenUsagePayload {
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  thought_tokens: number;
  cached_read_tokens: number;
  cached_write_tokens: number;
}

/** `acp:permission` — the agent asks to do something; the user picks an option
 *  (by `option_id`) or rejects. `request` is the raw ACP request JSON. */
export interface AcpPermissionPayload {
  permission_id: number;
  request: unknown;
  options: { option_id: string; name: string }[];
}

export interface AcpHostPermissionPayload {
  request_id: string;
  action: string;
  resources: string[];
  options: { option_id: string; name: string | null }[];
}

export interface AcpHostQuestionPayload {
  request_id: string;
  questions: {
    question: string;
    header: string;
    options: { label: string; description?: string }[];
    multiple?: boolean;
    custom?: boolean;
  }[];
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
  onState?: (status: AcpStatus) => void;
  onDiagnostic?: (payload: AcpDiagnosticPayload) => void;
  onMessage?: (payload: AcpMessagePayload) => void;
  onThought?: (payload: AcpMessagePayload) => void;
  onToolCall?: (payload: unknown) => void;
  onPlan?: (payload: unknown) => void;
  onUsage?: (payload: AcpUsagePayload) => void;
  onFileWritten?: (path: string) => void;
  onPermission?: (payload: AcpPermissionPayload) => void;
  onHostPermission?: (payload: AcpHostPermissionPayload) => void;
  onHostQuestion?: (payload: AcpHostQuestionPayload) => void;
  onExecApproval?: (payload: AcpExecApprovalPayload) => void;
  /** A turn finished; usage is cumulative across the ACP session. */
  onTurnEnded?: (stopReason: string, usage?: AcpTokenUsagePayload) => void;
  /** The agent process exited; `error` is set on an abnormal exit. */
  onExited?: (error: string | null) => void;
}

export interface AcpDiagnosticPayload {
  stage: string;
  elapsed_ms: number;
  outcome: string;
  code: string | null;
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
    ["acp:state", handlers.onState],
    ["acp:diagnostic", handlers.onDiagnostic],
    ["acp:message", handlers.onMessage],
    ["acp:thought", handlers.onThought],
    ["acp:tool-call", handlers.onToolCall],
    ["acp:plan", handlers.onPlan],
    ["acp:usage", handlers.onUsage],
    ["acp:file-written", handlers.onFileWritten],
    ["acp:permission", handlers.onPermission],
    ["acp:exec-approval", handlers.onExecApproval],
    [
      "acp:turn-ended",
      handlers.onTurnEnded
        ? ((payload: never) => {
            const value = payload as unknown;
            // Older desktop builds emitted the stop reason as a plain string;
            // accepting it keeps an upgraded renderer compatible with an
            // already-running host during hot reload.
            if (typeof value === "string") {
              handlers.onTurnEnded!(value);
              return;
            }
            const ended = value as {
              stop_reason?: unknown;
              usage?: AcpTokenUsagePayload | null;
            };
            if (typeof ended.stop_reason === "string") {
              handlers.onTurnEnded!(ended.stop_reason, ended.usage ?? undefined);
            }
          })
        : undefined,
    ],
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
