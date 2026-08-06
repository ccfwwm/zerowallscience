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
  //  - plan (task checklist) — see acp-normalize.ts. The ACP session UI renders
  //    it directly.
//  - agents / commands / model catalog — the native adapters do not expose a
//    portable catalog request. Model selection itself is supported through the
//    adapter session/set_model extension. Skills are the exception:
//    ZeroWall owns the isolated ACP skills directory and lists it natively.
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
  acpListSkills,
  type AcpEventHandlers,
  type AcpLaunchRequest,
  type AcpMessagePayload,
  type AcpPromptAttachment,
  type AcpStatus,
  type AcpTokenUsagePayload,
  type AcpUsagePayload,
} from "./acp";
import { createAcpHostRuntimeDeps } from "./acp-host-runtime";
import { acpToolCallToEvent } from "./acp-normalize";

/** The Tauri touchpoints the runtime needs, injected so the logic is testable
 *  without a desktop. Defaults wire the real `lib/acp.ts` functions. */
export interface AcpRuntimeDeps {
  launch: (request: AcpLaunchRequest) => Promise<AcpStatus>;
  prompt: (text: string, attachments?: AcpPromptAttachment[]) => Promise<void>;
  setModel: (model: string) => Promise<void>;
  cancel: () => Promise<void>;
  shutdown: () => Promise<AcpStatus>;
  subscribe: (handlers: AcpEventHandlers) => Promise<() => void>;
  listSkills?: (profileId: string) => Promise<SkillInfo[]>;
}

const REAL_DEPS: AcpRuntimeDeps = {
  ...createAcpHostRuntimeDeps(),
  listSkills: acpListSkills,
};

/** One UI update every 40 ms keeps streamed prose visually continuous without
 * rebuilding the live thread and Markdown tree for every protocol token. */
const STREAM_REFRESH_MS = 40;

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
  /** The latest whole-value update for each part waiting for the next display
   * refresh. Protocol chunks still accumulate losslessly in the maps above. */
  private readonly pendingText = new Map<string, { kind: "text" | "reasoning"; key: string; text: string }>();
  private streamFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private lastTextFlushAt: number | null = null;
  /** ACP UsageUpdate has no message id; track the visible reply it belongs to. */
  private currentMessageId: string | null = null;
  /** Usage updates have no reply id and some adapters send one immediately
   * before their first text chunk. Hold it until it can render beneath the
   * reply instead of creating an orphaned usage row above it. */
  private pendingUsage: AcpUsagePayload | null = null;
  /** Retained after the first display update so turn-ended can restamp its
   * duration onto the same usage row. */
  private turnUsage: AcpUsagePayload | null = null;
  /** Claude Code sends context usage after `turn-ended`. Retain only the just
   * completed reply so that late terminal update can replace its provisional
   * unavailable-input row without leaking into the next prompt. */
  private completedMessageId: string | null = null;
  private completedTurnDurationMs: number | undefined;
  /** Last cumulative ACP prompt usage observed. ACP reports session totals,
   * so every persisted row must contain the delta from this baseline. */
  private previousTokenUsage: AcpTokenUsagePayload | null = null;
  /** Avoid replacing an exact usage row with an unavailable terminal stamp. */
  private exactUsageEmittedForTurn = false;
  /** Wall-clock timing starts when the prompt is accepted by the ACP bridge. */
  private turnStartedAt: number | null = null;
  /** Distinguishes null-`message_id` chunks across turns so two turns' worth of
   *  unlabeled text never merge into one bubble. Bumped on each turn-ended. */
  private turnSeq = 0;

  constructor(request: AcpLaunchRequest, deps: AcpRuntimeDeps = REAL_DEPS) {
    super();
    this.request = request;
    this.deps = deps;
    // One agent, one conversation: the session id IS the profile id.
    this.sessionId = request.conversationId?.trim() || request.profileId;
  }

  // ---- lifecycle ----

  async connect(): Promise<void> {
    this.setStatus("connecting");
    try {
      // Subscribe BEFORE launch so no early event is missed.
      this.unsubscribe = await this.deps.subscribe(this.handlers());
      const status = await this.deps.launch(this.request);
      if (status.phase !== "ready") {
        throw new Error(status.last_error?.message ?? "ACP runtime did not become ready");
      }
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
    this.pendingText.clear();
    if (this.streamFlushTimer !== null) clearTimeout(this.streamFlushTimer);
    this.streamFlushTimer = null;
    this.lastTextFlushAt = null;
    this.currentMessageId = null;
    this.pendingUsage = null;
    this.turnUsage = null;
    this.completedMessageId = null;
    this.completedTurnDurationMs = undefined;
    this.previousTokenUsage = null;
    this.exactUsageEmittedForTurn = false;
  }

  /** The `acp:*` handlers this runtime consumes: conversation content and
   *  lifecycle only. Permission/exec/plan/file-written are intentionally
   *  left for other subscribers (see the module header). */
  private handlers(): AcpEventHandlers {
    return {
      onState: (status) => {
        switch (status.phase) {
          case "starting":
          case "stopping":
            this.setStatus("connecting");
            break;
          case "ready":
            this.setStatus("ready");
            break;
          case "busy":
            this.setStatus("ready");
            break;
          case "error":
            this.setStatus("error");
            if (status.last_error) {
              this.emit({
                type: "error",
                sessionId: this.sessionId,
                message: status.last_error.message,
              });
            }
            break;
          case "idle":
            this.setStatus("offline");
            break;
        }
      },
      onMessage: (p) => this.onTextChunk(this.messageText, p, "text"),
      onThought: (p) => this.onTextChunk(this.thoughtText, p, "reasoning"),
      onToolCall: (payload) => {
        const event = acpToolCallToEvent(this.sessionId, payload);
        if (event) this.emit(event);
      },
      onUsage: (payload) => this.onUsage(payload),
      onTurnEnded: (_stopReason, tokenUsage) => {
        // A turn boundary: unlabeled chunks of the next turn must not extend
        // this turn's bubbles, and the composer must unlock.
        this.flushTextUpdates();
        this.emitTurnUsage(tokenUsage);
        this.pendingUsage = null;
        this.turnUsage = null;
        this.completedMessageId = this.currentMessageId;
        this.completedTurnDurationMs = this.turnStartedAt === null
          ? undefined
          : Math.max(0, Date.now() - this.turnStartedAt);
        // A fresh turn must paint its first visible chunk immediately.  Keeping
        // the previous turn's throttle timestamp would delay it unnecessarily.
        this.lastTextFlushAt = null;
        this.turnSeq += 1;
        this.currentMessageId = null;
        this.turnStartedAt = null;
        this.emit({ type: "session.idle", sessionId: this.sessionId });
      },
      onExited: (error) => {
        if (error) {
          this.emit({ type: "error", sessionId: this.sessionId, message: error });
        }
        this.teardown();
        this.setStatus(error ? "error" : "offline");
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
    if (kind === "text") this.currentMessageId = key;
    const next = (store.get(key) ?? "") + payload.text;
    store.set(key, next);
    this.queueTextUpdate(kind, key, next);
    // A usage update received before the first visible text must appear after
    // it. Flush this one frame immediately so the ordering is deterministic.
    if (kind === "text" && this.pendingUsage) {
      this.flushTextUpdates();
      this.emitPendingUsage();
    }
  }

  private queueTextUpdate(kind: "text" | "reasoning", key: string, text: string): void {
    const mapKey = `${kind}:${key}`;
    const now = Date.now();
    if (this.lastTextFlushAt === null || now - this.lastTextFlushAt >= STREAM_REFRESH_MS) {
      this.emitTextUpdate(kind, key, text);
      this.lastTextFlushAt = now;
      return;
    }
    this.pendingText.set(mapKey, { kind, key, text });
    if (this.streamFlushTimer === null) {
      this.streamFlushTimer = setTimeout(() => this.flushTextUpdates(), STREAM_REFRESH_MS);
    }
  }

  private flushTextUpdates(): void {
    if (this.streamFlushTimer !== null) clearTimeout(this.streamFlushTimer);
    this.streamFlushTimer = null;
    if (this.pendingText.size === 0) return;
    const updates = [...this.pendingText.values()];
    this.pendingText.clear();
    this.lastTextFlushAt = Date.now();
    for (const update of updates) this.emitTextUpdate(update.kind, update.key, update.text);
  }

  private emitTextUpdate(kind: "text" | "reasoning", key: string, text: string): void {
    if (kind === "text") {
      this.emit({ type: "text.updated", sessionId: this.sessionId, partId: key, text });
    } else {
      this.emit({ type: "reasoning.updated", sessionId: this.sessionId, partId: key, text });
    }
  }

  /** ACP reports context occupancy, not completion tokens. Keep it separate;
   * ACP 1.4 does not expose exact prompt/completion token counts. */
  private onUsage(payload: AcpUsagePayload): void {
    this.turnUsage = payload;
    this.pendingUsage = payload;
    if (!this.currentMessageId) {
      if (this.completedMessageId) {
        this.pendingUsage = null;
        this.emitUsage(this.completedMessageId, payload, this.completedTurnDurationMs);
      }
      return;
    }
    this.flushTextUpdates();
    this.emitPendingUsage();
  }

  private emitPendingUsage(): void {
    const payload = this.pendingUsage;
    const messageID = this.currentMessageId;
    if (!payload || !messageID) return;
    this.pendingUsage = null;
    this.emitUsage(messageID, payload);
  }

  private emitTurnUsage(tokenUsage?: AcpTokenUsagePayload): void {
    const payload = this.turnUsage;
    if (!tokenUsage && payload?.token_usage && this.exactUsageEmittedForTurn) return;
    const messageID = this.currentMessageId ?? `acp-turn-${this.turnSeq}`;
    this.emitUsage(messageID, payload, undefined, tokenUsage);
  }

  private emitUsage(
    messageID: string,
    payload: AcpUsagePayload | null,
    durationMs = this.turnStartedAt === null ? undefined : Math.max(0, Date.now() - this.turnStartedAt),
    tokenUsage?: AcpTokenUsagePayload,
  ): void {
    const rawExact = tokenUsage ?? payload?.token_usage;
    const exact = rawExact ? this.tokenUsageDelta(rawExact) : null;
    if (exact) this.exactUsageEmittedForTurn = true;
    this.emit({
      type: "usage",
      sessionId: this.sessionId,
      messageID,
      input: exact?.input_tokens ?? 0,
      ...(exact ? {} : { inputUnavailable: true }),
      output: exact?.output_tokens ?? 0,
      ...(exact ? {} : { outputUnavailable: true }),
      ...(payload ? { contextUsed: payload.used, contextSize: payload.size } : {}),
      ...(durationMs === undefined ? {} : { durationMs }),
      reasoning: exact?.thought_tokens ?? 0,
      cacheRead: exact?.cached_read_tokens ?? 0,
      cacheWrite: exact?.cached_write_tokens ?? 0,
    });
  }

  private tokenUsageDelta(current: AcpTokenUsagePayload): AcpTokenUsagePayload {
    const previous = this.previousTokenUsage;
    this.previousTokenUsage = current;
    if (!previous) return current;
    const reset =
      current.total_tokens < previous.total_tokens ||
      current.input_tokens < previous.input_tokens ||
      current.output_tokens < previous.output_tokens ||
      current.thought_tokens < previous.thought_tokens ||
      current.cached_read_tokens < previous.cached_read_tokens ||
      current.cached_write_tokens < previous.cached_write_tokens;
    if (reset) return current;
    return {
      total_tokens: current.total_tokens - previous.total_tokens,
      input_tokens: current.input_tokens - previous.input_tokens,
      output_tokens: current.output_tokens - previous.output_tokens,
      thought_tokens: current.thought_tokens - previous.thought_tokens,
      cached_read_tokens: current.cached_read_tokens - previous.cached_read_tokens,
      cached_write_tokens: current.cached_write_tokens - previous.cached_write_tokens,
    };
  }

  // ---- sessions (a single conversation) ----

  async createSession(): Promise<string> {
    return this.sessionId;
  }

  async listSessions(): Promise<SessionMeta[]> {
    const title = this.request.profileId === "claude-code" ? "Claude Code" : "Codex";
    return [{ id: this.sessionId, title }];
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
    attachments?: PromptAttachment[],
  ): Promise<void> {
    // Agent/model/variant are selected by the ACP session. Attachments are
    // different: ACP v1 has native image and text content blocks, so they
    // must cross this bridge instead of becoming a UI-only thumbnail.
    // A later usage update can only belong to the previous reply until the
    // next prompt is accepted. Clear that association at this turn boundary.
    this.completedMessageId = null;
    this.completedTurnDurationMs = undefined;
    this.exactUsageEmittedForTurn = false;
    this.turnStartedAt = Date.now();
    if (attachments && attachments.length > 0) {
      await this.deps.prompt(text, attachments);
    } else {
      await this.deps.prompt(text);
    }
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

  // ---- capability discovery ----

  async listSkills(): Promise<SkillInfo[]> {
    return this.deps.listSkills?.(this.request.profileId) ?? [];
  }

  async listAgents(): Promise<AgentInfo[]> {
    return [];
  }

  async listCommands(): Promise<CommandInfo[]> {
    return [];
  }

  // ---- model selection ----

  async getDefaultModel(): Promise<string | null> {
    return null;
  }

  async setDefaultModel(model: string): Promise<void> {
    const slash = model.indexOf("/");
    const modelId = slash >= 0 ? model.slice(slash + 1) : model;
    if (!modelId) throw new Error("ACP model id is required");
    await this.deps.setModel(modelId);
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
