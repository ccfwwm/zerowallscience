// AcpRuntime: the AgentRuntime implementation that drives an external ACP agent
// (Codex, Claude Code) as a switchable second runtime beside OpenCode (Part C,
// Phase 5). It sits on top of the `lib/acp.ts` Tauri bridge and the stateless
// `acp-normalize.ts` translator, turning the agent's `acp:*` event stream into
// the same `OpenCodeEvent`s the app's fold/render layer already consumes.
//
// The Host can own multiple sessions. This compatibility runtime keeps one
// foreground subscription at a time, switches it explicitly when a pane is
// opened, and reads history through the Host control plane when the Driver
// advertises that capability.
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
  AgentEvent,
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
  acpListMcpServers,
  acpListSkills,
  createSkillSnapshots,
  type AcpEventHandlers,
  type AcpHostPermissionPayload,
  type AcpLaunchRequest,
  type AcpMcpServerInfo,
  type AcpMessagePayload,
  type AcpPromptAttachment,
  type AcpStatus,
  type AcpSkillInfo,
  type AcpTokenUsagePayload,
  type AcpUsagePayload,
} from "./acp";
import { createAcpHostRuntimeDeps } from "./acp-host-runtime";
import type { DesktopAgentEvent } from "./agent-events";
import { acpToolCallToEvent } from "./acp-normalize";

/** The Tauri touchpoints the runtime needs, injected so the logic is testable
 *  without a desktop. Defaults wire the real `lib/acp.ts` functions. */
export interface AcpRuntimeDeps {
  launch: (request: AcpLaunchRequest) => Promise<AcpStatus>;
  prompt: (text: string, attachments?: AcpPromptAttachment[]) => Promise<void>;
  setModel: (model: string, provider?: string) => Promise<void>;
  cancel: () => Promise<void>;
  respondPermission: (requestId: string, optionId: string | null) => Promise<void>;
  respondQuestion: (requestId: string, answers: string[][] | null) => Promise<void>;
  shutdown: () => Promise<AcpStatus>;
  subscribe: (handlers: AcpEventHandlers) => Promise<() => void>;
  listSkills?: (profileId: string) => Promise<SkillInfo[]>;
  listMcpServers?: () => Promise<AcpMcpServerInfo[]>;
  discoverSkills?: (profileId: string) => Promise<AcpSkillInfo[]>;
  currentSessionId?: () => string | null;
  createSession?: (request: AcpLaunchRequest) => Promise<string>;
  listSessions?: () => Promise<SessionMeta[]>;
  activateSession?: (sessionId: string) => Promise<void>;
  getMessages?: (sessionId: string) => Promise<HistoryMessage[]>;
  promptSession?: (
    sessionId: string,
    text: string,
    attachments: AcpPromptAttachment[],
  ) => Promise<void>;
  cancelSession?: (sessionId: string) => Promise<void>;
  respondPermissionSession?: (
    sessionId: string,
    requestId: string,
    optionId: string | null,
  ) => Promise<void>;
  respondQuestionSession?: (
    sessionId: string,
    requestId: string,
    answers: string[][] | null,
  ) => Promise<void>;
  deleteSession?: (sessionId: string) => Promise<void>;
}

const REAL_DEPS: AcpRuntimeDeps = {
  ...createAcpHostRuntimeDeps(),
  listSkills: acpListSkills,
  listMcpServers: acpListMcpServers,
  discoverSkills: acpListSkills,
};

/** One UI update every 40 ms keeps streamed prose visually continuous without
 * rebuilding the live thread and Markdown tree for every protocol token. */
const STREAM_REFRESH_MS = 40;
/** Optional capability discovery must never hold the primary ACP session
 * hostage when a configured MCP server or Skills catalog is unavailable. */
const CAPABILITY_DISCOVERY_TIMEOUT_MS = 1_500;

/** A process-backed adapter can persist an ACP session id before the first
 * prompt creates durable history. On the next app launch `session/load` then
 * rejects that empty id. Treat only this protocol stage as recoverable: spawn a
 * fresh session and keep every other launch failure visible to the user. */
function isPersistedSessionLoadFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /(?:stage:\s*SessionLoad|ACP_SESSION_LOAD_FAILED|OpenCode session\/load returned HTTP (?:404|500))/i.test(message);
}

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
  private launchRequest: AcpLaunchRequest | null = null;
  /** Stable user-visible conversation identity. */
  private sessionId: string;
  /** Current immutable ACP Host execution backing the visible conversation. */
  private executionSessionId: string;
  private initialSessionClaimed = false;
  private sessionSequence = 0;
  private sessionStartedEmitted = false;

  /** Torn down on close(); undefined until connect() subscribes. */
  private unsubscribe: (() => void) | null = null;
  /** Canonical Host event subscribers used by the desktop Store. The legacy
   *  `onEvent` stream remains for Gateway Web compatibility and old tests. */
  private readonly agentEventListeners = new Set<(event: DesktopAgentEvent) => void>();

  /** Cumulative text per streamed message, keyed by the ACP `message_id` (or a
   *  per-turn synthetic key when the agent sends none). The app's text.updated
   *  carries the FULL current value, not deltas, so we accumulate here. */
  private readonly messageText = new Map<string, string>();
  private readonly thoughtText = new Map<string, string>();
  private readonly permissionOptions = new Map<string, AcpHostPermissionPayload["options"]>();
  private readonly pendingQuestions = new Map<string, QuestionAskedEvent>();
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
    this.sessionId = request.logicalConversationId?.trim()
      || request.conversationId?.trim()
      || request.profileId;
    this.executionSessionId = request.conversationId?.trim() || request.profileId;
    // A runtime connected to an existing conversation must create a fresh Host
    // session for the next draft; a profile-only launch starts as that draft's
    // first session and can be claimed by the first send.
    this.initialSessionClaimed = Boolean(request.conversationId?.trim());
  }

  onAgentEvent(listener: (event: DesktopAgentEvent) => void): () => void {
    this.agentEventListeners.add(listener);
    return () => this.agentEventListeners.delete(listener);
  }

  private emitSessionStarted(): void {
    if (this.sessionStartedEmitted) return;
    this.sessionStartedEmitted = true;
    this.emitAgent({ type: "session.started", sessionId: this.sessionId });
  }

  private emitAgent(event: AgentEvent | Extract<DesktopAgentEvent, { type: "permission.resolved" | "question.resolved" }>): void {
    this.agentEventListeners.forEach((listener) => listener(event));
  }

  // ---- lifecycle ----

  async connect(): Promise<void> {
    this.setStatus("connecting");
    try {
      // Subscribe BEFORE launch so no early event is missed.
      this.unsubscribe = await this.deps.subscribe(this.handlers());
      this.launchRequest = await this.resolveCapabilitySnapshot();
      let status: AcpStatus;
      try {
        status = await this.deps.launch(this.launchRequest);
      } catch (error) {
        if (!this.launchRequest.conversationId || !isPersistedSessionLoadFailure(error)) {
          throw error;
        }
        const freshRequest = { ...this.launchRequest };
        delete freshRequest.conversationId;
        this.launchRequest = freshRequest;
        this.initialSessionClaimed = false;
        status = await this.deps.launch(freshRequest);
      }
      if (status.phase !== "ready") {
        throw new Error(status.last_error?.message ?? "ACP runtime did not become ready");
      }
      this.executionSessionId = this.deps.currentSessionId?.() ?? this.executionSessionId;
      if (!this.request.logicalConversationId) this.sessionId = this.executionSessionId;
      this.setStatus("ready");
      this.emitSessionStarted();
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
    for (const requestId of this.permissionOptions.keys()) {
      this.emit({ type: "permission.resolved", sessionId: this.sessionId, requestId });
      this.emitAgent({ type: "permission.resolved", sessionId: this.sessionId, requestId });
    }
    this.permissionOptions.clear();
    for (const question of this.pendingQuestions.values()) {
      this.emit({
        type: "question.resolved",
        sessionId: question.sessionId,
        requestId: question.requestId,
      });
      this.emitAgent({
        type: "question.resolved",
        sessionId: question.sessionId,
        requestId: question.requestId,
      });
    }
    this.pendingQuestions.clear();
    this.sessionStartedEmitted = false;
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
            this.emitSessionStarted();
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
              this.emitAgent({
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
        if (event) {
          this.emit(event);
          this.emitAgent({
            type: "tool.updated",
            sessionId: event.sessionId,
            toolCallId: event.callId,
            status: event.status,
            title: event.title ?? null,
            ...(event.tool ? { tool: event.tool } : {}),
            ...(event.input ? { input: event.input } : {}),
            ...(event.output ? { output: event.output } : {}),
            ...(event.partialOutput ? { partialOutput: event.partialOutput } : {}),
            ...(event.diff ? { diff: event.diff } : {}),
            ...(event.startedAt !== undefined ? { startedAt: event.startedAt } : {}),
            ...(event.endedAt !== undefined ? { endedAt: event.endedAt } : {}),
            ...(event.childSessionId ? { childSessionId: event.childSessionId } : {}),
          });
        }
      },
      onPlan: (payload) => {
        this.emitAgent({ type: "plan.updated", sessionId: this.sessionId, plan: payload });
      },
      onFileWritten: (path) => {
        this.emit({ type: "artifact.created", sessionId: this.sessionId, artifactId: path });
        this.emitAgent({ type: "artifact.created", sessionId: this.sessionId, artifactId: path });
      },
      onUsage: (payload) => this.onUsage(payload),
      onHostPermission: (payload) => {
        this.permissionOptions.set(payload.request_id, payload.options);
        this.emit({
          type: "permission.asked",
          sessionId: this.sessionId,
          requestId: payload.request_id,
          action: payload.action,
          resources: payload.resources,
        });
        this.emitAgent({
          type: "permission.requested",
          sessionId: this.sessionId,
          requestId: payload.request_id,
          action: payload.action,
          resources: payload.resources,
          options: payload.options.map((option) => ({ id: option.option_id, label: option.name })),
        });
      },
      onHostQuestion: (payload) => {
        const event: QuestionAskedEvent = {
          type: "question.asked",
          sessionId: this.sessionId,
          requestId: payload.request_id,
          questions: payload.questions,
        };
        this.pendingQuestions.set(payload.request_id, event);
        this.emit(event);
        this.emitAgent({
          type: "question.requested",
          sessionId: this.sessionId,
          requestId: payload.request_id,
          questions: payload.questions,
        });
      },
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
        this.emitAgent({ type: "session.idle", sessionId: this.sessionId });
      },
      onExited: (error) => {
        if (error) {
          this.emit({ type: "error", sessionId: this.sessionId, message: error });
          this.emitAgent({ type: "error", sessionId: this.sessionId, message: error });
        } else {
          this.emitAgent({ type: "session.closed", sessionId: this.sessionId });
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
    this.emitAgent({
      type: kind === "text" ? "text.delta" : "thought.delta",
      sessionId: this.sessionId,
      delta: payload.text,
    });
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
    this.emitAgent({
      type: "usage.updated",
      sessionId: this.sessionId,
      inputTokens: exact?.input_tokens ?? 0,
      outputTokens: exact?.output_tokens ?? 0,
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

  // ---- sessions ----

  currentSessionId(): string {
    return this.sessionId;
  }

  currentExecutionSessionId(): string {
    return this.executionSessionId;
  }

  private async resolveCapabilitySnapshot(): Promise<AcpLaunchRequest> {
    const [mcpAllowList, skillsSnapshot] = await Promise.all([
      this.request.mcpAllowList !== undefined
        ? Promise.resolve(normalizeMcpNames(this.request.mcpAllowList))
        : this.deps.listMcpServers
          ? bestEffortCapability(
              this.deps.listMcpServers().then((servers) => normalizeMcpNames(servers.map((server) => server.name))),
              [],
            )
          : Promise.resolve([]),
      this.request.skillsSnapshot !== undefined
        ? Promise.resolve([...this.request.skillsSnapshot])
        : this.deps.discoverSkills
          ? bestEffortCapability(
              this.deps.discoverSkills(this.request.profileId).then((skills) => createSkillSnapshots(skills, "conversation")),
              [],
            )
          : Promise.resolve([]),
    ]);
    return { ...this.request, mcpAllowList, skillsSnapshot };
  }

  async createSession(options?: { model?: string | null }): Promise<string> {
    const requestedModel = options?.model?.trim() || null;
    const slash = requestedModel?.indexOf("/") ?? -1;
    const requestedBinding = requestedModel && slash > 0
      ? {
          providerId: requestedModel.slice(0, slash),
          model: requestedModel.slice(slash + 1),
        }
      : requestedModel
        ? { providerId: this.request.gateway.providerId, model: requestedModel }
        : null;
    if (!this.initialSessionClaimed) {
      if (requestedBinding) {
        await this.deps.setModel(requestedBinding.model, requestedBinding.providerId);
      }
      this.initialSessionClaimed = true;
      this.executionSessionId = this.deps.currentSessionId?.() ?? this.executionSessionId;
      return this.sessionId;
    }
    if (!this.deps.createSession) {
      if (requestedBinding) {
        throw new Error("ACP Host cannot create a new session with a model snapshot");
      }
      return this.sessionId;
    }
    this.sessionSequence += 1;
    const requestedId = `acp-${Date.now()}-${this.sessionSequence}`;
    const baseRequest = this.launchRequest ?? this.request;
    const sessionId = await this.deps.createSession({
      ...baseRequest,
      conversationId: requestedId,
      ...(requestedBinding
        ? {
            gateway: {
              ...baseRequest.gateway,
              providerId: requestedBinding.providerId,
              model: requestedBinding.model,
            },
          }
        : {}),
    });
    this.executionSessionId = sessionId;
    if (!this.request.logicalConversationId) this.sessionId = sessionId;
    await this.deps.activateSession?.(sessionId);
    return this.sessionId;
  }

  async listSessions(): Promise<SessionMeta[]> {
    if (this.deps.listSessions) {
      const sessions = await this.deps.listSessions();
      if (!this.request.logicalConversationId || this.executionSessionId === this.sessionId) {
        return sessions;
      }
      const current = sessions.find((session) => session.id === this.executionSessionId);
      const hidden = new Set(this.request.hiddenExecutionIds ?? []);
      return [
        ...sessions.filter((session) =>
          session.id !== this.executionSessionId
          && session.id !== this.sessionId
          && !hidden.has(session.id)
        ),
        ...(current ? [{ ...current, id: this.sessionId }] : []),
      ];
    }
    const title =
      this.request.profileId === "claude-code"
        ? "Claude Code"
        : this.request.profileId === "opencode"
          ? "OpenCode"
          : "Codex";
    return [{ id: this.sessionId, title }];
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.deps.deleteSession?.(sessionId);
  }

  async getMessages(sessionId = this.sessionId): Promise<HistoryMessage[]> {
    const executionId = sessionId === this.sessionId ? this.executionSessionId : sessionId;
    return this.deps.getMessages?.(executionId) ?? [];
  }

  async sendPrompt(
    sessionId: string,
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
    this.sessionId = sessionId;
    const executionId = this.request.logicalConversationId
      ? this.executionSessionId
      : sessionId;
    await this.deps.activateSession?.(executionId);
    if (this.deps.promptSession) {
      await this.deps.promptSession(executionId, text, attachments ?? []);
    } else if (attachments && attachments.length > 0) {
      await this.deps.prompt(text, attachments);
    } else {
      await this.deps.prompt(text);
    }
  }

  async abortSession(sessionId: string): Promise<void> {
    const executionId = sessionId === this.sessionId ? this.executionSessionId : sessionId;
    if (this.deps.cancelSession) await this.deps.cancelSession(executionId);
    else await this.deps.cancel();
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
    const providerId = slash >= 0 ? model.slice(0, slash) : undefined;
    const modelId = slash >= 0 ? model.slice(slash + 1) : model;
    if (!modelId) throw new Error("ACP model id is required");
    await this.deps.setModel(modelId, providerId);
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

  async listQuestions(sessionId?: string): Promise<QuestionAskedEvent[]> {
    const questions = [...this.pendingQuestions.values()];
    return sessionId ? questions.filter((question) => question.sessionId === sessionId) : questions;
  }

  async listPermissions(): Promise<PermissionAskedEvent[]> {
    return [];
  }

  async answerQuestion(requestId: string, answers: string[][]): Promise<void> {
    await this.resolveQuestion(requestId, answers);
  }

  async rejectQuestion(requestId: string): Promise<void> {
    await this.resolveQuestion(requestId, null);
  }

  private async resolveQuestion(requestId: string, answers: string[][] | null): Promise<void> {
    const question = this.pendingQuestions.get(requestId);
    const sessionId = question?.sessionId ?? this.sessionId;
    if (this.deps.respondQuestionSession) {
      await this.deps.respondQuestionSession(this.executionSessionId, requestId, answers);
    } else {
      await this.deps.respondQuestion(requestId, answers);
    }
    this.pendingQuestions.delete(requestId);
    this.emit({ type: "question.resolved", sessionId, requestId });
    this.emitAgent({ type: "question.resolved", sessionId, requestId });
  }

  async replyPermission(requestId: string, reply: PermissionReply): Promise<void> {
    const options = this.permissionOptions.get(requestId) ?? [];
    const matcher =
      reply === "always"
        ? /always|permanent/i
        : reply === "once"
          ? /once|allow|approve/i
          : /reject|deny|cancel/i;
    const optionId = options.find(
      (option) => matcher.test(option.option_id) || matcher.test(option.name ?? ""),
    )?.option_id ?? null;
    if (this.deps.respondPermissionSession) {
      await this.deps.respondPermissionSession(this.executionSessionId, requestId, optionId);
    } else {
      await this.deps.respondPermission(requestId, optionId);
    }
    this.permissionOptions.delete(requestId);
    this.emit({ type: "permission.resolved", sessionId: this.sessionId, requestId });
    this.emitAgent({ type: "permission.resolved", sessionId: this.sessionId, requestId });
  }
}

async function bestEffortCapability<T>(task: Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      task.catch(() => fallback),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), CAPABILITY_DISCOVERY_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function normalizeMcpNames(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}
