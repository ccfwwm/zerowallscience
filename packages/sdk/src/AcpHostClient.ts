import type { PromptAttachment } from "./runtime";
import type { HistoryMessage, ProviderInfo } from "./types";

export type AgentEngine = "codex" | "claude-code" | "opencode";

export interface AgentBinding {
  engineId: AgentEngine;
  profileId: string;
  modelId: string | null;
  providerId: string | null;
  variant: string | null;
  projectRoot: string;
  profileFingerprint: string;
  resolvedAt: string;
}

export interface AgentSession {
  id: string;
  acpSessionId: string | null;
  binding: AgentBinding;
  state: "new" | "ready" | "busy" | "waiting" | "error" | "closed";
  resumable: boolean;
  title?: string | null;
  directory?: string | null;
  parentId?: string | null;
  created?: number | null;
  created_at?: number | null;
  updated?: number | null;
  updated_at?: number | null;
}

export interface PermissionOption {
  id: string;
  label: string | null;
}

export interface QuestionOption {
  label: string;
  description?: string;
}

export interface QuestionItem {
  question: string;
  header: string;
  options: QuestionOption[];
  multiple?: boolean;
  custom?: boolean;
}

export type AgentEvent =
  | { type: "session.started"; sessionId: string }
  | { type: "session.idle"; sessionId: string }
  | { type: "session.closed"; sessionId: string }
  | { type: "text.delta"; sessionId: string; delta: string }
  | { type: "thought.delta"; sessionId: string; delta: string }
  | {
      type: "tool.updated";
      sessionId: string;
      toolCallId: string;
      status: string;
      title: string | null;
      tool?: string;
      input?: Record<string, unknown>;
      output?: string;
      partialOutput?: string;
      diff?: string;
      startedAt?: number;
      endedAt?: number;
      childSessionId?: string;
    }
  | { type: "plan.updated"; sessionId: string; plan: unknown }
  | {
      type: "permission.requested";
      sessionId: string;
      requestId: string;
      action: string;
      resources: string[];
      options: PermissionOption[];
    }
  | {
      type: "question.requested";
      sessionId: string;
      requestId: string;
      questions: QuestionItem[];
    }
  | {
      type: "usage.updated";
      sessionId: string;
      inputTokens: number;
      outputTokens: number;
    }
  | { type: "artifact.created"; sessionId: string; artifactId: string }
  | { type: "error"; sessionId: string | null; message: string };

export interface AcpHostLaunchRequest {
  engine: AgentEngine;
  profileId: string;
  sessionId: string;
  model: string;
  providerId: string;
  baseUrl: string;
  projectRoot: string;
  variant?: string;
  profileFingerprint: string;
  credentialRef: string;
  /** Optional session-scoped MCP server allow-list. */
  mcpAllowList?: string[];
}

export interface AcpHostEngineInfo {
  engine: AgentEngine;
  available: boolean;
  reason: string | null;
}

export interface AcpHostInitializeResponse {
  capabilities: Record<string, boolean>;
}

export type AcpHostInvoke = <T = unknown>(
  command: string,
  args?: Record<string, unknown>,
) => Promise<T>;

export interface AcpHostClientOptions {
  invoke: AcpHostInvoke;
  pollIntervalMs?: number;
}

export interface AcpHostCustomProviderOptions {
  name: string;
  npm: string;
  baseURL: string;
  models: string[];
  contexts?: Record<string, number>;
}

interface RawBinding {
  engine: AgentEngine;
  profile: string;
  model: string | null;
  provider: string | null;
  variant: string | null;
  projectRoot?: string;
  project_root?: string;
  profileFingerprint?: string;
  profile_fingerprint?: string;
  resolvedAt?: string;
  resolved_at?: string;
}

interface RawSession {
  id: string;
  binding: RawBinding;
  state?: AgentSession["state"];
  resumable: boolean;
  title?: string | null;
  directory?: string | null;
  parentId?: string | null;
  parent_id?: string | null;
  created?: number | null;
  created_at?: number | null;
  updated?: number | null;
  updated_at?: number | null;
}

interface RawEvent {
  type: AgentEvent["type"];
  data: Record<string, unknown>;
}

export class AcpHostClient {
  private readonly invoke: AcpHostInvoke;
  private readonly pollIntervalMs: number;
  private readonly requestedBindings = new Map<string, AgentBinding>();
  private readonly sessions = new Map<string, AgentSession>();
  private readonly loadedSessions = new Set<string>();
  private readonly startedSessions = new Set<string>();

  constructor(options: AcpHostClientOptions) {
    this.invoke = options.invoke;
    this.pollIntervalMs = options.pollIntervalMs ?? 50;
  }

  async listProviders(): Promise<ProviderInfo[]> {
    return this.invoke<ProviderInfo[]>("acp_host_list_providers");
  }

  async getDefaultModel(): Promise<string | null> {
    return this.invoke<string | null>("acp_host_get_default_model");
  }

  async setDefaultModel(model: string): Promise<void> {
    await this.invoke("acp_host_set_default_model", { model });
  }

  async addCustomProvider(id: string, options: AcpHostCustomProviderOptions): Promise<void> {
    await this.invoke("acp_host_add_custom_provider", {
      request: {
        id,
        name: options.name,
        npm: options.npm,
        baseUrl: options.baseURL,
        models: [...options.models],
        contexts: { ...(options.contexts ?? {}) },
      },
    });
  }

  async removeCustomProvider(providerId: string): Promise<void> {
    await this.invoke("acp_host_remove_custom_provider", { providerId });
  }

  async listEngines(): Promise<AcpHostEngineInfo[]> {
    return this.invoke<AcpHostEngineInfo[]>("acp_host_engines");
  }

  async initialize(engine: AgentEngine): Promise<AcpHostInitializeResponse> {
    return this.invoke<AcpHostInitializeResponse>("acp_host_initialize", { engine });
  }

  async launch(request: AcpHostLaunchRequest): Promise<AgentSession> {
    const requested = requestBinding(request);
    const existing = this.requestedBindings.get(request.sessionId);
    if (existing) ensureCompatible(existing, requested);

    const raw = await this.invoke<RawSession>("acp_host_launch", {
      request: serializeLaunchRequest(request),
    });
    const session = normalizeSession(raw);
    ensureCompatible(requested, session.binding);
    this.requestedBindings.set(request.sessionId, requested);
    this.sessions.set(session.id, session);
    this.loadedSessions.add(session.id);
    return session;
  }

  /** Create a new ACP session without replacing any other engine session. */
  async newSession(request: AcpHostLaunchRequest): Promise<AgentSession> {
    const requested = requestBinding(request);
    const raw = await this.invoke<RawSession>("acp_host_new", {
      request: serializeLaunchRequest(request),
    });
    const session = normalizeSession(raw);
    ensureCompatible(requested, session.binding);
    this.requestedBindings.set(request.sessionId, requested);
    this.sessions.set(session.id, session);
    this.loadedSessions.add(session.id);
    return session;
  }

  /** Return Host-owned sessions without exposing vendor-specific DTOs. */
  async listSessions(): Promise<AgentSession[]> {
    const raw = await this.invoke<RawSession[]>("acp_host_sessions");
    const sessions = raw.map(normalizeSession);
    return sessions.map((session) => {
      const existing = this.sessions.get(session.id);
      if (!existing) {
        this.sessions.set(session.id, session);
        return session;
      }
      const merged = { ...session, binding: existing.binding };
      this.sessions.set(session.id, merged);
      return merged;
    });
  }

  /** Import sessions discovered by an internal Driver into the Host catalog. */
  async discoverSessions(request: AcpHostLaunchRequest): Promise<AgentSession[]> {
    const raw = await this.invoke<RawSession[]>("acp_host_discover", {
      request: serializeLaunchRequest(request),
    });
    const sessions = raw.map(normalizeSession);
    return sessions.map((session) => {
      const existing = this.sessions.get(session.id);
      if (!existing) {
        this.sessions.set(session.id, session);
        return session;
      }
      const merged = { ...session, binding: existing.binding };
      this.sessions.set(session.id, merged);
      return merged;
    });
  }

  /** Load a persisted session while preserving its immutable binding. */
  async loadSession(
    sessionId: string,
    request?: AcpHostLaunchRequest,
  ): Promise<AgentSession> {
    const raw = await this.invoke<RawSession>("acp_host_load", {
      sessionId,
      ...(request ? { request: serializeLaunchRequest(request) } : {}),
    });
    const session = normalizeSession(raw);
    if (request) ensureCompatible(requestBinding(request), session.binding);
    const current = this.sessions.get(sessionId);
    if (current) ensureCompatible(current.binding, session.binding);
    this.sessions.set(session.id, session);
    this.loadedSessions.add(session.id);
    return session;
  }

  /** Read normalized history through the Host control plane. */
  async getHistory(sessionId: string): Promise<HistoryMessage[]> {
    this.requireSession(sessionId);
    return this.invoke<HistoryMessage[]>("acp_host_history", { sessionId });
  }

  getSession(sessionId: string): AgentSession | null {
    return this.sessions.get(sessionId) ?? null;
  }

  hasLoadedSession(sessionId: string): boolean {
    return this.loadedSessions.has(sessionId);
  }

  async prompt(sessionId: string, prompt: string, attachments: PromptAttachment[] = []): Promise<void> {
    const session = this.requireSession(sessionId);
    session.state = "busy";
    try {
      await this.invoke("acp_host_prompt", {
        sessionId,
        prompt,
        ...(attachments.length > 0 ? { attachments } : {}),
      });
      this.startedSessions.add(sessionId);
    } catch (error) {
      session.state = "error";
      throw error;
    }
  }

  async drainEvents(sessionId: string): Promise<AgentEvent[]> {
    this.requireSession(sessionId);
    const raw = await this.invoke<RawEvent[]>("acp_host_events", { sessionId });
    const events = raw.map(normalizeEvent);
    const session = this.sessions.get(sessionId);
    if (session) {
      for (const event of events) {
        if (event.type === "session.idle") session.state = "ready";
        if (event.type === "permission.requested" || event.type === "question.requested") {
          session.state = "waiting";
        }
        if (event.type === "session.closed") {
          session.state = "closed";
          this.loadedSessions.delete(sessionId);
          this.startedSessions.delete(sessionId);
        }
        if (event.type === "error") session.state = "error";
      }
    }
    return events;
  }

  subscribe(sessionId: string, listener: (event: AgentEvent) => void): () => void {
    const session = this.requireSession(sessionId);
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      if (!active || isTerminalSessionState(session.state)) {
        active = false;
        return;
      }
      try {
        for (const event of await this.drainEvents(sessionId)) listener(event);
        if (isTerminalSessionState(session.state)) active = false;
      } catch (error) {
        session.state = "error";
        listener({
          type: "error",
          sessionId,
          message: error instanceof Error ? error.message : String(error),
        });
        active = false;
      } finally {
        if (active) timer = setTimeout(poll, this.pollIntervalMs);
      }
    };
    void poll();
    return () => {
      active = false;
      if (timer !== null) clearTimeout(timer);
    };
  }

  async respondPermission(
    sessionId: string,
    requestId: string,
    optionId: string | null,
  ): Promise<void> {
    this.requireSession(sessionId);
    await this.invoke("acp_host_permission", { sessionId, requestId, optionId });
  }

  async respondQuestion(
    sessionId: string,
    requestId: string,
    answers: string[][] | null,
  ): Promise<void> {
    this.requireSession(sessionId);
    await this.invoke("acp_host_question", { sessionId, requestId, answers });
  }

  async setConfig(sessionId: string, config: Record<string, unknown>): Promise<AgentSession> {
    const current = this.requireSession(sessionId);
    const raw = await this.invoke<RawSession>("acp_host_config", { sessionId, config });
    const session: AgentSession = {
      ...current,
      binding: normalizeBinding(raw.binding),
      state: "ready",
      resumable: raw.resumable,
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  async cancel(sessionId: string): Promise<void> {
    this.requireSession(sessionId);
    await this.invoke("acp_host_cancel", { sessionId });
  }

  async close(sessionId: string): Promise<void> {
    const session = this.requireSession(sessionId);
    await this.invoke("acp_host_close", { sessionId });
    session.state = "closed";
    this.sessions.delete(sessionId);
    this.loadedSessions.delete(sessionId);
    this.startedSessions.delete(sessionId);
  }

  private requireSession(sessionId: string): AgentSession {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`session ${sessionId} is not registered`);
    return session;
  }
}

function normalizeSession(raw: RawSession): AgentSession {
  return {
    id: raw.id,
    acpSessionId: raw.id,
    binding: normalizeBinding(raw.binding),
    state: raw.state ?? "ready",
    resumable: raw.resumable,
    title: raw.title ?? null,
    directory: raw.directory ?? null,
    parentId: raw.parentId ?? raw.parent_id ?? null,
    created: raw.created ?? raw.created_at ?? null,
    updated: raw.updated ?? raw.updated_at ?? null,
  };
}

function serializeLaunchRequest(request: AcpHostLaunchRequest): Record<string, unknown> {
  return {
    engine: request.engine,
    profileId: request.profileId,
    sessionId: request.sessionId,
    model: request.model,
    providerId: request.providerId,
    baseUrl: request.baseUrl,
    projectRoot: request.projectRoot,
    variant: request.variant,
    profileFingerprint: request.profileFingerprint,
    credential: { keychainId: request.credentialRef },
    ...(request.mcpAllowList ? { mcpAllowList: [...request.mcpAllowList] } : {}),
  };
}

function requestBinding(request: AcpHostLaunchRequest): AgentBinding {
  return {
    engineId: request.engine,
    profileId: request.profileId,
    modelId: request.model,
    providerId: request.providerId,
    variant: request.variant ?? null,
    projectRoot: request.projectRoot,
    profileFingerprint: request.profileFingerprint,
    resolvedAt: "",
  };
}

function normalizeBinding(raw: RawBinding): AgentBinding {
  return {
    engineId: raw.engine,
    profileId: raw.profile,
    modelId: raw.model,
    providerId: raw.provider,
    variant: raw.variant,
    projectRoot: raw.projectRoot ?? raw.project_root ?? "",
    profileFingerprint: raw.profileFingerprint ?? raw.profile_fingerprint ?? "",
    resolvedAt: raw.resolvedAt ?? raw.resolved_at ?? "",
  };
}

function ensureCompatible(existing: AgentBinding, requested: AgentBinding): void {
  const fields: [keyof AgentBinding, string][] = [
    ["engineId", "engineId"],
    ["profileId", "profileId"],
    ["modelId", "modelId"],
    ["providerId", "providerId"],
    ["variant", "variant"],
    ["projectRoot", "projectRoot"],
    ["profileFingerprint", "profileFingerprint"],
  ];
  for (const [field, label] of fields) {
    if (existing[field] !== requested[field]) {
      throw new Error(`session binding conflicts on ${label}`);
    }
  }
}

function isTerminalSessionState(state: AgentSession["state"]): boolean {
  return state === "closed" || state === "error";
}

function normalizeEvent(raw: RawEvent): AgentEvent {
  const data = raw.data;
  const sessionId = stringValue(data, "session_id", "sessionId");
  switch (raw.type) {
    case "session.started":
    case "session.idle":
    case "session.closed":
      return { type: raw.type, sessionId };
    case "text.delta":
    case "thought.delta":
      return { type: raw.type, sessionId, delta: stringValue(data, "delta") };
    case "tool.updated":
      return {
        type: raw.type,
        sessionId,
        toolCallId: stringValue(data, "tool_call_id", "toolCallId"),
        status: stringValue(data, "status"),
        title: nullableString(data, "title"),
        ...optionalStringField(data, "tool"),
        ...optionalRecordField(data, "input"),
        ...optionalStringField(data, "output"),
        ...optionalStringField(data, "partial_output", "partialOutput"),
        ...optionalStringField(data, "diff"),
        ...optionalNumberField(data, "started_at", "startedAt"),
        ...optionalNumberField(data, "ended_at", "endedAt"),
        ...optionalStringField(data, "child_session_id", "childSessionId"),
      };
    case "plan.updated":
      return { type: raw.type, sessionId, plan: data.plan };
    case "permission.requested":
      return {
        type: raw.type,
        sessionId,
        requestId: stringValue(data, "request_id", "requestId"),
        action: nullableString(data, "action") ?? "agent",
        resources: Array.isArray(data.resources)
          ? data.resources.filter((value): value is string => typeof value === "string")
          : [],
        options: Array.isArray(data.options)
          ? data.options.map((option) => {
              const value = option as Record<string, unknown>;
              return { id: stringValue(value, "id"), label: nullableString(value, "label") };
            })
          : [],
      };
    case "question.requested":
      return {
        type: raw.type,
        sessionId,
        requestId: stringValue(data, "request_id", "requestId"),
        questions: Array.isArray(data.questions)
          ? data.questions.map(normalizeQuestion)
          : [],
      };
    case "usage.updated":
      return {
        type: raw.type,
        sessionId,
        inputTokens: numberValue(data, "input_tokens", "inputTokens"),
        outputTokens: numberValue(data, "output_tokens", "outputTokens"),
      };
    case "artifact.created":
      return {
        type: raw.type,
        sessionId,
        artifactId: stringValue(data, "artifact_id", "artifactId"),
      };
    case "error":
      return {
        type: raw.type,
        sessionId: nullableString(data, "session_id", "sessionId"),
        message: stringValue(data, "message"),
      };
    default:
      throw new Error(`unsupported ACP host event: ${String(raw.type)}`);
  }
}

function normalizeQuestion(value: unknown): QuestionItem {
  const question = value as Record<string, unknown>;
  return {
    question: stringValue(question, "question"),
    header: stringValue(question, "header"),
    options: Array.isArray(question.options)
      ? question.options.map((rawOption) => {
          const option = rawOption as Record<string, unknown>;
          const description = nullableString(option, "description");
          return {
            label: stringValue(option, "label"),
            ...(description === null ? {} : { description }),
          };
        })
      : [],
    ...(typeof question.multiple === "boolean" ? { multiple: question.multiple } : {}),
    ...(typeof question.custom === "boolean" ? { custom: question.custom } : {}),
  };
}

function stringValue(value: Record<string, unknown>, ...keys: string[]): string {
  const result = keys.map((key) => value[key]).find((item) => typeof item === "string");
  if (typeof result !== "string") throw new Error(`missing string field ${keys[0]}`);
  return result;
}

function nullableString(value: Record<string, unknown>, ...keys: string[]): string | null {
  const result = keys.map((key) => value[key]).find((item) => item === null || typeof item === "string");
  return typeof result === "string" ? result : null;
}

function numberValue(value: Record<string, unknown>, ...keys: string[]): number {
  const result = keys.map((key) => value[key]).find((item) => typeof item === "number");
  if (typeof result !== "number") throw new Error(`missing number field ${keys[0]}`);
  return result;
}

function optionalStringField(
  value: Record<string, unknown>,
  ...keys: string[]
): Record<string, string> {
  const result = keys.map((key) => value[key]).find((item) => typeof item === "string");
  return typeof result === "string" ? { [keys[keys.length - 1]]: result } : {};
}

function optionalNumberField(
  value: Record<string, unknown>,
  ...keys: string[]
): Record<string, number> {
  const result = keys.map((key) => value[key]).find((item) => typeof item === "number");
  return typeof result === "number" ? { [keys[keys.length - 1]]: result } : {};
}

function optionalRecordField(
  value: Record<string, unknown>,
  key: string,
): Record<string, Record<string, unknown>> {
  const result = value[key];
  return result && typeof result === "object" && !Array.isArray(result)
    ? { [key]: result as Record<string, unknown> }
    : {};
}
