import { describe, expect, it } from "vitest";
import { canonicalEventToLegacy, createCanonicalEventState } from "./agent-events";

describe("desktop AgentEvent boundary", () => {
  it("accumulates canonical text deltas into one reducer-compatible block", () => {
    const state = createCanonicalEventState();
    expect(canonicalEventToLegacy(state, { type: "text.delta", sessionId: "s1", delta: "Hel" }))
      .toMatchObject({ type: "text.updated", partId: "s1:0", text: "Hel" });
    expect(canonicalEventToLegacy(state, { type: "text.delta", sessionId: "s1", delta: "lo" }))
      .toMatchObject({ type: "text.updated", partId: "s1:0", text: "Hello" });
    expect(canonicalEventToLegacy(state, { type: "session.idle", sessionId: "s1" }))
      .toEqual({ type: "session.idle", sessionId: "s1" });
    expect(canonicalEventToLegacy(state, { type: "text.delta", sessionId: "s1", delta: "Next" }))
      .toMatchObject({ type: "text.updated", partId: "s1:1", text: "Next" });
  });

  it("preserves canonical tool, permission, usage, and artifact semantics", () => {
    const state = createCanonicalEventState();
    expect(canonicalEventToLegacy(state, {
      type: "tool.updated",
      sessionId: "s1",
      toolCallId: "call-1",
      status: "completed",
      title: "Read file",
      tool: "read",
      input: { path: "paper.md" },
    })).toMatchObject({ type: "tool.updated", callId: "call-1", status: "success" });
    expect(canonicalEventToLegacy(state, {
      type: "permission.requested",
      sessionId: "s1",
      requestId: "p1",
      action: "read",
      resources: ["paper.md"],
      options: [{ id: "allow", label: "Allow" }],
    })).toMatchObject({ type: "permission.asked", requestId: "p1" });
    expect(canonicalEventToLegacy(state, {
      type: "usage.updated",
      sessionId: "s1",
      inputTokens: 12,
      outputTokens: 8,
    })).toMatchObject({ type: "usage", input: 12, output: 8 });
    expect(canonicalEventToLegacy(state, {
      type: "artifact.created",
      sessionId: "s1",
      artifactId: "paper.md",
    })).toEqual({ type: "artifact.created", sessionId: "s1", artifactId: "paper.md" });
  });

  it("keeps legacy OpenCode events explicitly behind the compatibility envelope", () => {
    const state = createCanonicalEventState();
    const event = { type: "session.idle", sessionId: "web" } as const;
    expect(canonicalEventToLegacy(state, { type: "legacy", event })).toBe(event);
  });

  it("starts a clean text accumulator when a session reconnects after an error", () => {
    const state = createCanonicalEventState();
    canonicalEventToLegacy(state, { type: "text.delta", sessionId: "s1", delta: "stale" });
    canonicalEventToLegacy(state, { type: "error", sessionId: "s1", message: "adapter exited" });
    canonicalEventToLegacy(state, { type: "session.started", sessionId: "s1" });

    expect(canonicalEventToLegacy(state, { type: "text.delta", sessionId: "s1", delta: "fresh" }))
      .toMatchObject({ type: "text.updated", partId: "s1:0", text: "fresh" });
  });
});
