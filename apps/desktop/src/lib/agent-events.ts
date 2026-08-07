import type {
  AgentEvent,
  OpenCodeEvent,
  PermissionAskedEvent,
  QuestionAskedEvent,
  ToolUpdatedEvent,
} from "@zerowall/sdk";
import type { ToolCallStatus } from "@zerowall/shared";

/**
 * The desktop Store consumes this one event envelope. ACP Host events are the
 * canonical path; the legacy member is used only by the Gateway Web
 * compatibility transport and is converted immediately at this boundary.
 */
export type DesktopAgentEvent =
  | AgentEvent
  | { type: "permission.resolved"; sessionId: string; requestId: string }
  | { type: "question.resolved"; sessionId: string; requestId: string }
  | { type: "legacy"; event: OpenCodeEvent };

export interface CanonicalEventState {
  textTurn: Map<string, number>;
  text: Map<string, string>;
  thought: Map<string, string>;
}

export function createCanonicalEventState(): CanonicalEventState {
  return {
    textTurn: new Map(),
    text: new Map(),
    thought: new Map(),
  };
}

function resetSession(state: CanonicalEventState, sessionId: string): void {
  state.textTurn.delete(sessionId);
  const prefix = `${sessionId}:`;
  for (const map of [state.text, state.thought]) {
    for (const key of map.keys()) {
      if (key.startsWith(prefix)) map.delete(key);
    }
  }
}

function status(value: string): ToolCallStatus {
  switch (value) {
    case "running":
    case "in_progress":
      return "running";
    case "success":
    case "completed":
      return "success";
    case "failed":
      return "failed";
    default:
      return "pending";
  }
}

function toolEvent(event: Extract<AgentEvent, { type: "tool.updated" }>): ToolUpdatedEvent {
  return {
    type: "tool.updated",
    sessionId: event.sessionId,
    callId: event.toolCallId,
    tool: event.tool ?? "tool",
    status: status(event.status),
    ...(event.title ? { title: event.title } : {}),
    ...(event.input ? { input: event.input } : {}),
    ...(event.output ? { output: event.output } : {}),
    ...(event.partialOutput ? { partialOutput: event.partialOutput } : {}),
    ...(event.diff ? { diff: event.diff } : {}),
    ...(event.startedAt !== undefined ? { startedAt: event.startedAt } : {}),
    ...(event.endedAt !== undefined ? { endedAt: event.endedAt } : {}),
    ...(event.childSessionId ? { childSessionId: event.childSessionId } : {}),
  };
}

function textEvent(
  state: CanonicalEventState,
  event: Extract<AgentEvent, { type: "text.delta" | "thought.delta" }>,
): OpenCodeEvent {
  const turn = state.textTurn.get(event.sessionId) ?? 0;
  const key = `${event.sessionId}:${turn}`;
  const map = event.type === "text.delta" ? state.text : state.thought;
  const text = `${map.get(key) ?? ""}${event.delta}`;
  map.set(key, text);
  return event.type === "text.delta"
    ? { type: "text.updated", sessionId: event.sessionId, partId: key, text }
    : { type: "reasoning.updated", sessionId: event.sessionId, partId: key, text };
}

/** Convert one canonical Host event for the existing pure transcript reducer. */
export function canonicalEventToLegacy(
  state: CanonicalEventState,
  event: DesktopAgentEvent,
): OpenCodeEvent | null {
  if (event.type === "legacy") return event.event;
  if (event.type === "session.started" || event.type === "session.closed") {
    resetSession(state, event.sessionId);
    return null;
  }
  if (event.type === "text.delta" || event.type === "thought.delta") {
    return textEvent(state, event);
  }
  if (event.type === "tool.updated") return toolEvent(event);
  if (event.type === "permission.requested") {
    const legacy: PermissionAskedEvent = {
      type: "permission.asked",
      sessionId: event.sessionId,
      requestId: event.requestId,
      action: event.action,
      resources: event.resources,
    };
    return legacy;
  }
  if (event.type === "question.requested") {
    const legacy: QuestionAskedEvent = {
      type: "question.asked",
      sessionId: event.sessionId,
      requestId: event.requestId,
      questions: event.questions,
    };
    return legacy;
  }
  if (event.type === "usage.updated") {
    return {
      type: "usage",
      sessionId: event.sessionId,
      messageID: `${event.sessionId}:usage`,
      input: event.inputTokens,
      output: event.outputTokens,
      reasoning: 0,
      cacheRead: 0,
      cacheWrite: 0,
    };
  }
  if (event.type === "artifact.created") {
    return { type: "artifact.created", sessionId: event.sessionId, artifactId: event.artifactId };
  }
  if (event.type === "session.idle") {
    state.textTurn.set(event.sessionId, (state.textTurn.get(event.sessionId) ?? 0) + 1);
    return { type: "session.idle", sessionId: event.sessionId };
  }
  if (event.type === "error") {
    if (event.sessionId) resetSession(state, event.sessionId);
    return { type: "error", sessionId: event.sessionId ?? undefined, message: event.message };
  }
  if (event.type === "permission.resolved" || event.type === "question.resolved") {
    return {
      type: event.type,
      sessionId: event.sessionId,
      requestId: event.requestId,
    };
  }
  // Plans are retained in the Host/workflow event stream. The legacy
  // transcript reducer has no plan block, so dropping it here avoids
  // fabricating a text or tool event.
  return null;
}
