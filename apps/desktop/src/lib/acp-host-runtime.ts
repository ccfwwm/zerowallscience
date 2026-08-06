import {
  AcpHostClient,
  type AcpHostInvoke,
  type AgentEvent,
  type AgentEngine,
  type PromptAttachment,
} from "@zerowall/sdk";
import type {
  AcpEventHandlers,
  AcpLaunchRequest,
  AcpMessagePayload,
  AcpStatus,
  AcpPromptAttachment,
} from "./acp";
import { isTauri } from "./tauri";
import type { AcpRuntimeDeps } from "./acp-runtime";

const IDLE: AcpStatus = {
  phase: "idle",
  profile_id: null,
  runtime_info: null,
  last_error: null,
};

type HostState = {
  client: AcpHostClient;
  sessionId: string;
  unsubscribe: (() => void) | null;
};

async function defaultInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri) throw new Error("ACP Host is available only in the desktop app");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

function profileFingerprint(request: AcpLaunchRequest): string {
  return [request.profileId, request.gateway.providerId, request.gateway.baseUrl, request.gateway.model].join("|");
}

function toHostAttachment(attachment: AcpPromptAttachment): PromptAttachment {
  return {
    filename: attachment.filename,
    mime: attachment.mime,
    base64: attachment.base64,
    ...(attachment.extractedText ? { extractedText: attachment.extractedText } : {}),
  };
}

function toMessage(delta: string): AcpMessagePayload {
  return { message_id: null, text: delta };
}

function hostEngine(profileId: string): AgentEngine {
  if (profileId === "codex" || profileId === "claude-code" || profileId === "opencode") {
    return profileId;
  }
  throw new Error(`Unsupported ACP Host engine: ${profileId}`);
}

function forwardEvent(handlers: AcpEventHandlers, event: AgentEvent): void {
  switch (event.type) {
    case "text.delta":
      handlers.onMessage?.(toMessage(event.delta));
      break;
    case "thought.delta":
      handlers.onThought?.(toMessage(event.delta));
      break;
    case "tool.updated":
      handlers.onToolCall?.({
        toolCallId: event.toolCallId,
        title: event.title ?? undefined,
        status:
          event.status === "running"
            ? "in_progress"
            : event.status === "success" || event.status === "completed"
              ? "completed"
              : event.status === "failed"
                ? "failed"
                : event.status,
      });
      break;
    case "plan.updated":
      handlers.onPlan?.(event.plan);
      break;
    case "usage.updated":
      handlers.onUsage?.({
        used: 0,
        size: 0,
        token_usage: {
          total_tokens: event.inputTokens + event.outputTokens,
          input_tokens: event.inputTokens,
          output_tokens: event.outputTokens,
          thought_tokens: 0,
          cached_read_tokens: 0,
          cached_write_tokens: 0,
        },
      });
      break;
    case "session.idle":
      handlers.onTurnEnded?.("end_turn");
      break;
    case "session.closed":
      handlers.onExited?.(null);
      break;
    case "error":
      handlers.onExited?.(event.message);
      break;
    case "session.started":
      break;
    case "permission.requested":
      handlers.onHostPermission?.({
        request_id: event.requestId,
        action: event.action,
        resources: event.resources,
        options: event.options.map((option) => ({
          option_id: option.id,
          name: option.label,
        })),
      });
      break;
    case "question.requested":
    case "artifact.created":
      // These are consumed by the unified event reducer in the next migration
      // step. The compatibility reducer must not invent legacy request ids.
      break;
  }
}

export function createAcpHostRuntimeDeps(invoke: AcpHostInvoke = defaultInvoke): AcpRuntimeDeps {
  let hostState: HostState | null = null;
  let pendingHandlers: AcpEventHandlers | null = null;

  const attach = (handlers: AcpEventHandlers) => {
    if (!hostState || hostState.unsubscribe) return;
    hostState.unsubscribe = hostState.client.subscribe(hostState.sessionId, (event) => {
      forwardEvent(handlers, event);
    });
  };

  return {
    launch: async (request) => {
      if (hostState) {
        hostState.unsubscribe?.();
        await hostState.client.close(hostState.sessionId).catch(() => {});
        hostState = null;
      }
      const client = new AcpHostClient({ invoke });
      const engine = hostEngine(request.profileId);
      await client.initialize(engine);
      const session = await client.launch({
        engine,
        profileId: request.profileId,
        sessionId: request.conversationId?.trim() || request.profileId,
        model: request.gateway.model,
        providerId: request.gateway.providerId,
        baseUrl: request.gateway.baseUrl,
        profileFingerprint: profileFingerprint(request),
        credentialRef: request.gateway.providerId,
      });
      hostState = { client, sessionId: session.id, unsubscribe: null };
      if (pendingHandlers) attach(pendingHandlers);
      return {
        phase: "ready",
        profile_id: request.profileId,
        runtime_info: null,
        last_error: null,
      } as AcpStatus;
    },
    prompt: async (text, attachments = []) => {
      if (!hostState) throw new Error("ACP Host session is not running");
      await hostState.client.prompt(
        hostState.sessionId,
        text,
        attachments.map(toHostAttachment),
      );
    },
    setModel: async (model) => {
      if (!hostState) throw new Error("ACP Host session is not running");
      await hostState.client.setConfig(hostState.sessionId, { model });
    },
    cancel: async () => {
      if (!hostState) return;
      await hostState.client.cancel(hostState.sessionId);
    },
    respondPermission: async (requestId, optionId) => {
      if (!hostState) throw new Error("ACP Host session is not running");
      await hostState.client.respondPermission(hostState.sessionId, requestId, optionId);
    },
    shutdown: async () => {
      const active = hostState;
      hostState = null;
      active?.unsubscribe?.();
      if (active) await active.client.close(active.sessionId).catch(() => {});
      return IDLE;
    },
    subscribe: async (handlers) => {
      pendingHandlers = handlers;
      attach(handlers);
      return () => {
        if (pendingHandlers === handlers) pendingHandlers = null;
        hostState?.unsubscribe?.();
        if (hostState) hostState.unsubscribe = null;
      };
    },
    listSkills: async () => [],
  };
}
