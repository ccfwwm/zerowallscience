// Token/cost accounting bridge: OpenCode stamps every assistant reply with
// cumulative token counts (input/output/reasoning + cache read/write) and an
// optional USD cost, delivered live as `usage` events. This module persists
// each stamp (latest-wins per message id) and reads the per-session rollup the
// Usage surfaces render. The Tauri bridge is best-effort — recording must never
// break the chat — and a gateway-web read path keeps the panel working over the
// wire. Kept separate from runtime.ts so it can be reasoned about on its own.
import type { UsageEvent } from "@zerowall/sdk";
import type { SessionUsage, WorkspaceUsage } from "@zerowall/shared";
import { isTauri, logDebug } from "./tauri";
import { isGatewayWeb, gatewayGet } from "./webMode";

/** The cumulative counts a `usage` event carries, in the shape the Rust
 *  `usage_record` command expects (camelCase over serde). */
export interface UsageInput {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
  /** USD cost, omitted when the provider priced nothing (kept distinct from 0). */
  cost?: number;
}

/** The persist payload from a live `usage` event, or `null` when it isn't
 *  addressable (no session/message id to key the row on). */
export function usageInputFromEvent(
  event: UsageEvent,
): { sessionId: string; messageId: string; usage: UsageInput } | null {
  if (!event.sessionId || !event.messageID) return null;
  return {
    sessionId: event.sessionId,
    messageId: event.messageID,
    usage: {
      input: event.input,
      output: event.output,
      reasoning: event.reasoning,
      cacheRead: event.cacheRead,
      cacheWrite: event.cacheWrite,
      ...(event.cost !== undefined ? { cost: event.cost } : {}),
    },
  };
}

/** Persist (or refresh) one assistant reply's usage (desktop only). Idempotent
 *  per message id — OpenCode restamps a streaming reply with growing totals, so
 *  the store UPSERTs latest-wins. Recording must never break the chat flow. */
export async function recordUsage(
  sessionId: string,
  messageId: string,
  usage: UsageInput,
): Promise<void> {
  if (!isTauri) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("usage_record", { sessionId, messageId, usage });
  } catch (e) {
    void logDebug(`usage record FAILED for ${messageId}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** A session's per-reply usage (newest first) and grand totals. Empty rollup in
 *  browser dev or when unreadable. */
export async function usageBySession(sessionId: string): Promise<SessionUsage> {
  if (isGatewayWeb) {
    try {
      return (
        (await gatewayGet<SessionUsage>(`/v1/usage?session=${encodeURIComponent(sessionId)}`)) ?? EMPTY_USAGE
      );
    } catch {
      return EMPTY_USAGE;
    }
  }
  if (!isTauri) return EMPTY_USAGE;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<SessionUsage>("usage_by_session", { sessionId });
  } catch {
    return EMPTY_USAGE;
  }
}

const EMPTY_TOTALS = {
  input: 0,
  output: 0,
  reasoning: 0,
  cacheRead: 0,
  cacheWrite: 0,
  cost: null,
  replies: 0,
} as const;

const EMPTY_USAGE: SessionUsage = { replies: [], total: { ...EMPTY_TOTALS } };

const EMPTY_WORKSPACE_USAGE: WorkspaceUsage = { sessions: [], total: { ...EMPTY_TOTALS } };

/** Every session's usage rolled up (busiest first) plus the workspace grand
 *  total, for Settings → Usage. Empty rollup in browser dev or when unreadable. */
export async function usageByWorkspace(): Promise<WorkspaceUsage> {
  if (isGatewayWeb) {
    try {
      return (await gatewayGet<WorkspaceUsage>("/v1/usage")) ?? EMPTY_WORKSPACE_USAGE;
    } catch {
      return EMPTY_WORKSPACE_USAGE;
    }
  }
  if (!isTauri) return EMPTY_WORKSPACE_USAGE;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<WorkspaceUsage>("usage_by_workspace");
  } catch {
    return EMPTY_WORKSPACE_USAGE;
  }
}
