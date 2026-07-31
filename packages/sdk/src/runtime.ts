import type {
  AgentInfo,
  CommandInfo,
  HistoryMessage,
  OpenCodeEvent,
  PermissionAskedEvent,
  PermissionReply,
  QuestionAskedEvent,
  RuntimeStatus,
  SessionMeta,
  SkillInfo,
} from "./types";

/**
 * The runtime-agnostic boundary between the app UI and the agent runtime.
 *
 * `AGENTS.md` mandates that the UI never calls OpenCode directly — it goes
 * through `packages/sdk`. This interface makes that seam explicit: it covers
 * ONLY the surface a generic agent runtime must expose (lifecycle, sessions,
 * capability discovery, model selection, and interactive requests).
 *
 * Provider / MCP / OAuth configuration is deliberately OUT of scope — those are
 * configuration of a specific runtime (OpenCode today), not of "an agent
 * runtime" in general. Callers that need them go through the concrete
 * `OpenCodeClient` (e.g. `getClient()`), which `implements AgentRuntime`.
 *
 * See `docs/rfc/agent-runtime.md` for the rationale. `OpenCodeClient` is the
 * default implementation (HTTP/SSE); `AcpRuntime` is the second, bridging
 * external ACP agents (Codex, Claude Code) over the Tauri host. Both implement
 * this interface so the app UI is agnostic to which runtime is active.
 */
/**
 * An inline file attached to a prompt turn, carried to the model as a real
 * `file` part rather than a text mention. `base64` is the raw bytes with no
 * data-URI prefix; the runtime wraps it as `data:<mime>;base64,…`.
 *
 * Two roles:
 * - Images (raster) — the runtime's `read` tool cannot surface image bytes to
 *   the model, so an attached image must ride along with the prompt this way
 *   to be analyzable.
 * - Documents (pdf / docx / txt / md / csv) — the desktop extracts UTF-8 text
 *   locally and puts it in `extractedText`; the runtime sends the bytes as a
 *   `file` part AND the extracted text as an extra `text` part, so the model
 *   sees the content without waiting on a skill kernel.
 */
export interface PromptAttachment {
  filename: string;
  mime: string;
  base64: string;
  /** Locally-extracted UTF-8 text for text-bearing documents (pdf/docx/txt/md/
   *  csv). Omitted for images and for bytes we can't cheaply read on-device. */
  extractedText?: string;
}

export interface AgentRuntime {
  // ---- lifecycle ----
  connect(): Promise<void>;
  close(): void;
  getStatus(): RuntimeStatus;
  onStatus(listener: (status: RuntimeStatus) => void): () => void;
  onEvent(listener: (event: OpenCodeEvent) => void): () => void;

  // ---- sessions (a conversation) ----
  createSession(): Promise<string>;
  listSessions(): Promise<SessionMeta[]>;
  deleteSession(sessionId: string): Promise<void>;
  getMessages(sessionId: string): Promise<HistoryMessage[]>;
  /** `agent` pins a specific agent for the turn (e.g. the read-only "plan"
   *  agent); omit for the runtime default. `model` ("provider/model") pins the
   *  turn to the current default, overriding a session's stale creation-time
   *  binding; omit to use the session/runtime default. `variant` picks a
   *  per-turn reasoning-effort level (a name from the model's `variants`); omit
   *  for the model's default effort. `attachments` are inline files (images)
   *  sent as real image parts alongside the text. See lib/runtime.ts. */
  sendPrompt(
    sessionId: string,
    text: string,
    agent?: string,
    model?: string | null,
    variant?: string | null,
    attachments?: PromptAttachment[],
  ): Promise<void>;
  abortSession(sessionId: string): Promise<void>;
  /** Revert the session to (and including) `messageID`, dropping it and every
   *  message after it (and rolling back any files they changed). Used to edit a
   *  past user message: revert to it, then `sendPrompt` the corrected text.
   *  The session must be idle first (abort a running turn before calling). */
  revert(sessionId: string, messageID: string, partID?: string): Promise<void>;
  /** Undo the last revert (restore the dropped messages and files). */
  unrevert(sessionId: string): Promise<void>;

  // ---- capability discovery (what this runtime can do) ----
  listSkills(): Promise<SkillInfo[]>;
  listAgents(): Promise<AgentInfo[]>;
  listCommands(): Promise<CommandInfo[]>;

  // ---- model selection ----
  getDefaultModel(): Promise<string | null>;
  setDefaultModel(model: string): Promise<void>;

  // ---- agent-driven execution (a full turn, not a single prompt) ----
  /** Run a shell command in the session's workspace; no model turn. */
  runShell(sessionId: string, command: string, agent?: string): Promise<void>;
  /** Run a slash command (config command / skill / MCP prompt) as a full turn. */
  runCommand(sessionId: string, command: string, args?: string): Promise<void>;

  // ---- interactive requests (the agent asks; the user must answer) ----
  /** Pending questions in the workspace (recovery on open). */
  listQuestions(sessionId?: string): Promise<QuestionAskedEvent[]>;
  /** Pending permission requests in the workspace (recovery on open). */
  listPermissions(sessionId?: string): Promise<PermissionAskedEvent[]>;
  answerQuestion(requestId: string, answers: string[][]): Promise<void>;
  rejectQuestion(requestId: string): Promise<void>;
  /** Reply to a permission request: allow once, allow always, or reject. */
  replyPermission(requestId: string, reply: PermissionReply): Promise<void>;
}
