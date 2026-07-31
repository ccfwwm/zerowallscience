// AcpRuntime: the AgentRuntime implementation that drives an external ACP agent
// (Codex, Claude Code) as a switchable second runtime beside OpenCode (Part C,
// Phase 5). It sits on top of the `lib/acp.ts` Tauri bridge and the stateless
// `acp-normalize.ts` translator, turning the agent's `acp:*` event stream into
// the same `OpenCodeEvent`s the app's fold/render layer already consumes.
//
// One agent = one conversation. ACP runs a single live agent at a time (like
// the Jupyter integration), so this runtime exposes exactly one session, whose
// id is the launched profile's id. There is no history API on the ACP side, so
// `getMessages` is empty on reload — the live thread is rebuilt from events.
//
// Deliberately OUT of scope here (each has no clean AgentRuntime target):
//  - permission / exec-approval — ACP wants a specific option id chosen from the
//    request's own options, which the fixed once/always/reject `PermissionReply`
//    cannot express. Those events keep flowing on the dedicated `subscribeAcp`
//    path to purpose-built ACP approval UI, NOT through `replyPermission`.
//  - usage (context-window occupancy) and plan (task checklist) — see
//    acp-normalize.ts. The ACP session UI renders them directly.
//  - skills / agents / commands / model catalog — an ACP agent is configured by
//    its launch env, not discoverable over this protocol. These return empty.
//
// Testability: every Tauri touchpoint is injected via `AcpRuntimeDeps`, so the
// event-translation and lifecycle logic is unit-testable with plain fakes and
// no Tauri present.
import { BaseAgentRuntime } from "@zerowall/sdk";
import type {
  AgentInfo,
  AgentRuntime,
  CommandInfo,
  HistoryMessage,
  PermissionAskedEvent,
  PermissionReply,
  PromptAttachment,
  QuestionAskedEvent,
  SessionMeta,
  SkillInfo,
} from "@zerowall/sdk";

import {
  acpCancel,
  acpLaunch,
  acpPrompt,
  acpShutdown,
  subscribeAcp,
  type AcpEventHandlers,
  type AcpLaunchRequest,
  type AcpMessagePayload,
  type AcpStatus,
} from "./acp";
import { acpToolCallToEvent } from "./acp-normalize";

/** The Tauri touchpoints the runtime needs, injected so the logic is testable
 *  without a desktop. Defaults wire the real `lib/acp.ts` functions. */
export interface AcpRuntimeDeps {
  launch: (request: AcpLaunchRequest) => Promise<AcpStatus>;
  prompt: (text: string) => Promise<void>;
  cancel: () => Promise<void>;
  shutdown: () => Promise<AcpStatus>;
  subscribe: (handlers: AcpEventHandlers) => Promise<() => void>;
}

const REAL_DEPS: AcpRuntimeDeps = {
  launch: acpLaunch,
  prompt: acpPrompt,
  cancel: acpCancel,
  shutdown: acpShutdown,
  subscribe: subscribeAcp,
};

/** Thrown by methods an ACP agent cannot honor (revert, ad-hoc shell). Callers
 *  gate these in the UI; a thrown error is the honest answer if one slips
 *  through, never a silent no-op that looks like success. */
export class AcpUnsupportedError extends Error {
  constructor(operation: string) {
    super(`ACP runtime does not support ${operation}`);
    this.name = "AcpUnsupportedError";
  }
}

export class AcpRuntime extends BaseAgentRuntime implements AgentRuntime {
  private readonly request: AcpLaunchRequest;
  private readonly deps: AcpRuntimeDeps;
  private readonly sessionId: string;

  /** Torn down on close(); undefined until connect() subscribes. */
  private unsubscribe: (() => void) | null = null;

  /** Cumulative text per streamed message, keyed by the ACP `message_id` (or a
   *  per-turn synthetic key when the agent sends none). The app's text.updated
   *  carries the FULL current value, not deltas, so we accumulate here. */
  private readonly messageText = new Map<string, string>();
  private readonly thoughtText = new Map<string, string>();
  /** Distinguishes null-`message_id` chunks across turns so two turns' worth of
   *  unlabeled text never merge into one bubble. Bumped on each turn-ended. */
  private turnSeq = 0;

  constructor(request: AcpLaunchRequest, deps: AcpRuntimeDeps = REAL_DEPS) {
    super();
    this.request = request;
    this.deps = deps;
    // One agent, one conversation: the session id IS the profile id.
    this.sessionId = request.id;
  }

  // ---- lifecycle ----

  async connect(): Promise<void> {
    this.setStatus("connecting");
    try {
      // Subscribe BEFORE launch so no early event is missed.
      this.unsubscribe = await this.deps.subscribe(this.handlers());
      await this.deps.launch(this.request);
      this.setStatus("ready");
    } catch (err) {
      this.teardown();
      this.setStatus("error");
      throw err;
    }
  }

  close(): void {
    this.teardown();
    // Best-effort agent shutdown; ignore failures (may already be gone).
    void this.deps.shutdown().catch(() => {});
    this.setStatus("offline");
  }

  private teardown(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.messageText.clear();
    this.thoughtText.clear();
  }

  /** The `acp:*` handlers this runtime consumes: conversation content and
   *  lifecycle only. Permission/exec/usage/plan/file-written are intentionally
   *  left for other subscribers (see the module header). */
  private handlers(): AcpEventHandlers {
    return {
      onMessage: (p) => this.onTextChunk(this.messageText, p, "text"),
      onThought: (p) => this.onTextChunk(this.thoughtText, p, "reasoning"),
      onToolCall: (payload) => {
        const event = acpToolCallToEvent(this.sessionId, payload);
        if (event) this.emit(event);
      },
      onTurnEnded: () => {
        // A turn boundary: unlabeled chunks of the next turn must not extend
        // this turn's bubbles, and the composer must unlock.
        this.turnSeq += 1;
        this.emit({ type: "session.idle", sessionId: this.sessionId });
      },
      onExited: (error) => {
        if (error) {
          this.emit({ type: "error", sessionId: this.sessionId, message: error });
        }
        this.teardown();
        this.setStatus("offline");
      },
    };
  }

  /** Accumulate one streamed chunk and emit the full current value as a
   *  text.updated / reasoning.updated. The part id is stable per message so the
   *  fold layer upserts the same block instead of appending. */
  private onTextChunk(
    store: Map<string, string>,
    payload: AcpMessagePayload,
    kind: "text" | "reasoning",
  ): void {
    const key = payload.message_id ?? `turn-${this.turnSeq}`;
    const next = (store.get(key) ?? "") + payload.text;
    store.set(key, next);
    if (kind === "text") {
      this.emit({ type: "text.updated", sessionId: this.sessionId, partId: key, text: next });
    } else {
      this.emit({ type: "reasoning.updated", sessionId: this.sessionId, partId: key, text: next });
    }
  }

  // ---- sessions (a single conversation) ----

  async createSession(): Promise<string> {
    return this.sessionId;
  }

  async listSessions(): Promise<SessionMeta[]> {
    return [{ id: this.sessionId, title: this.request.label }];
  }

  async deleteSession(): Promise<void> {
    // Nothing to delete server-side; the agent is torn down via close().
  }

  async getMessages(): Promise<HistoryMessage[]> {
    // ACP exposes no history API; the live thread is built from events.
    return [];
  }

  async sendPrompt(
    _sessionId: string,
    text: string,
    _agent?: string,
    _model?: string | null,
    _variant?: string | null,
    _attachments?: PromptAttachment[],
  ): Promise<void> {
    // ACP's prompt is plain text; per-turn agent/model/variant and inline
    // attachments have no protocol slot here and are ignored (the model is
    // fixed by the launch env). The UI hides those affordances for ACP.
    await this.deps.prompt(text);
  }

  async abortSession(_sessionId: string): Promise<void> {
    await this.deps.cancel();
  }

  async revert(_sessionId: string, _messageID: string, _partID?: string): Promise<void> {
    throw new AcpUnsupportedError("reverting a message");
  }

  async unrevert(_sessionId: string): Promise<void> {
    throw new AcpUnsupportedError("un-reverting");
  }

  // ---- capability discovery (an ACP agent advertises none over this seam) ----

  async listSkills(): Promise<SkillInfo[]> {
    return [];
  }

  async listAgents(): Promise<AgentInfo[]> {
    return [];
  }

  async listCommands(): Promise<CommandInfo[]> {
    return [];
  }

  // ---- model selection (fixed by launch env) ----

  async getDefaultModel(): Promise<string | null> {
    return null;
  }

  async setDefaultModel(): Promise<void> {
    // The model is chosen by the launch environment, not switchable per turn.
  }

  // ---- agent-driven execution (no ad-hoc shell / command over ACP) ----

  async runShell(_sessionId: string, _command: string, _agent?: string): Promise<void> {
    throw new AcpUnsupportedError("running a shell command directly");
  }

  async runCommand(_sessionId: string, _command: string, _args?: string): Promise<void> {
    throw new AcpUnsupportedError("running a slash command");
  }

  // ---- interactive requests ----
  // ACP permission / exec-approval flow through the dedicated subscribeAcp path
  // to purpose-built approval UI, NOT through this fixed-vocabulary seam.

  async listQuestions(): Promise<QuestionAskedEvent[]> {
    return [];
  }

  async listPermissions(): Promise<PermissionAskedEvent[]> {
    return [];
  }

  async answerQuestion(): Promise<void> {
    // No ACP question concept; nothing to answer here.
  }

  async rejectQuestion(): Promise<void> {}

  async replyPermission(_requestId: string, _reply: PermissionReply): Promise<void> {
    // ACP approvals are answered via acpReplyPermission / acpReplyExec from the
    // ACP UI (they need an option id, not once/always/reject). No-op here.
  }
}
