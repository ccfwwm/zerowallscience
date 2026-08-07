// ACP → OpenCode event normalization (Part C, Phase 5).
//
// The app's fold/render layer (`foldEvent` in lib/runtime.ts) is a pure reducer
// over `OpenCodeEvent`. Rather than teach it a second event vocabulary, the ACP
// runtime translates each `acp:*` payload into the same `OpenCodeEvent` shape,
// so tool cards, diffs, and status all render identically to an OpenCode turn.
//
// This module is the STATELESS half of that translation — a pure function from
// one raw ACP JSON payload to one normalized event (or null when the payload
// carries nothing renderable). It is deliberately Tauri-free and store-free so
// it can be unit-tested against the exact wire shapes the `zerowall-acp` crate
// emits (`serde_json::to_value` of the Apache-2.0 `agent-client-protocol`
// types, which serialize camelCase). Chunk accumulation, session id tracking,
// and store dispatch live in the runtime adapter, not here.
//
// Scope note: ACP `usage` (context-window occupancy: used/size + optional cost)
// and `plan` (a task checklist) have NO clean `OpenCodeEvent` target — the app's
// UsageEvent is per-message token *deltas*, a different quantity. Mapping them
// would fabricate data, so they are handled by the adapter/UI, not normalized
// here. This module translates only tool calls, which map exactly.
import type { ToolCallStatus } from "@zerowall/shared";
import type { ToolUpdatedEvent } from "@zerowall/sdk";

/** ACP `ToolCallStatus` (snake_case on the wire) → the app's tool status.
 *  ACP has no `waiting-approval`/`warning`; approval is a separate exec-approval
 *  event, so those app-only states never arrive from an ACP tool call. */
export function acpToolStatus(status: unknown): ToolCallStatus {
  switch (status) {
    case "in_progress":
      return "running";
    case "completed":
      return "success";
    case "failed":
      return "failed";
    // "pending" and anything unknown (ACP marks the enum #[non_exhaustive])
    // fall back to pending — the safe "not started / awaiting" state.
    default:
      return "pending";
  }
}

/** ACP `ToolKind` (snake_case) → the OpenCode tool name whose presentation
 *  (verb + detail renderer) best fits. `toolPresentation()` switches on this
 *  name to pick "Ran/Read/Edited/…"; kinds with no close analogue map to their
 *  own string so they render with a neutral title and no verb. */
export function acpKindToTool(kind: unknown): string {
  switch (kind) {
    case "read":
      return "read";
    case "edit":
      return "edit";
    case "execute":
      return "bash";
    case "search":
      return "grep";
    case "fetch":
      return "webfetch";
    // delete / move / think / switch_mode / other (the default) have no
    // OpenCode verb — keep the raw kind so the card shows the ACP title alone.
    default:
      return typeof kind === "string" && kind ? kind : "tool";
  }
}

/** One entry of an ACP tool call's `content` array (a tagged union). We only
 *  read text and diff variants; a `terminal` embed carries no inline bytes. */
interface AcpToolContent {
  type?: string;
  // type === "content": a nested ContentBlock (itself type-tagged).
  content?: { type?: string; text?: string };
  // type === "diff":
  path?: string;
  oldText?: string | null;
  newText?: string;
}

/** The subset of ACP `ToolCall` / `ToolCallUpdate` we consume. `ToolCallUpdate`
 *  flattens its updatable fields to the same top level and may omit any of
 *  them, so every field except the id is optional. */
interface AcpToolCall {
  toolCallId?: string;
  title?: string;
  kind?: string;
  status?: string;
  content?: AcpToolContent[];
  locations?: { path?: string; line?: number }[];
  rawInput?: Record<string, unknown> | null;
  rawOutput?: unknown;
  diff?: string;
  partialOutput?: string;
  startedAt?: number;
  endedAt?: number;
  childSessionId?: string;
}

/** Concatenate the text of every `content`-variant block, dropping empties. */
function collectText(content: AcpToolContent[] | undefined): string {
  if (!Array.isArray(content)) return "";
  return content
    .filter((c) => c?.type === "content" && c.content?.type === "text")
    .map((c) => c.content?.text ?? "")
    .filter(Boolean)
    .join("\n");
}

/** The first `diff` block, rendered as a minimal unified diff string. A new
 *  file (null `oldText`) yields an all-`+` block, which reads as a creation. */
function collectDiff(content: AcpToolContent[] | undefined): string | undefined {
  if (!Array.isArray(content)) return undefined;
  const diff = content.find((c) => c?.type === "diff");
  if (!diff) return undefined;
  const oldLines = (diff.oldText ?? "").length
    ? diff.oldText!.split("\n").map((l) => `- ${l}`)
    : [];
  const newLines = (diff.newText ?? "").split("\n").map((l) => `+ ${l}`);
  return [...oldLines, ...newLines].join("\n");
}

/**
 * Translate one raw ACP tool-call payload (from `acp:tool-call`) into a
 * `ToolUpdatedEvent` for the given session. Returns null when the payload has
 * no tool-call id (nothing the fold layer can key on).
 *
 * `foldEvent` derives the file path from `event.input.filePath`/`.path`, so
 * when the tool call reports `locations` but its `rawInput` lacks a path, we
 * fold the first location into the input under `path` — otherwise a read/edit
 * card would show no file. `rawInput` is passed through as `input` so bash
 * commands (`input.command`) present with the right verb.
 */
export function acpToolCallToEvent(
  sessionId: string,
  payload: unknown,
): ToolUpdatedEvent | null {
  if (!payload || typeof payload !== "object") return null;
  const call = payload as AcpToolCall;
  const callId = call.toolCallId;
  if (!callId) return null;

  const tool = acpKindToTool(call.kind);
  const input: Record<string, unknown> = { ...(call.rawInput ?? {}) };
  const locPath = call.locations?.find((l) => l?.path)?.path;
  if (locPath && input.path === undefined && input.filePath === undefined) {
    input.path = locPath;
  }

  const text = collectText(call.content);
  const diff = call.diff || collectDiff(call.content);
  // rawOutput is arbitrary JSON; surface only a string form as tool output.
  const rawOut =
    typeof call.rawOutput === "string" ? call.rawOutput : undefined;
  const output = text || rawOut;

  return {
    type: "tool.updated",
    sessionId,
    callId,
    tool,
    status: acpToolStatus(call.status),
    ...(call.title ? { title: call.title } : {}),
    ...(Object.keys(input).length ? { input } : {}),
    ...(output ? { output } : {}),
    ...(diff ? { diff } : {}),
    ...(call.partialOutput ? { partialOutput: call.partialOutput } : {}),
    ...(typeof call.startedAt === "number" ? { startedAt: call.startedAt } : {}),
    ...(typeof call.endedAt === "number" ? { endedAt: call.endedAt } : {}),
    ...(call.childSessionId ? { childSessionId: call.childSessionId } : {}),
  };
}
