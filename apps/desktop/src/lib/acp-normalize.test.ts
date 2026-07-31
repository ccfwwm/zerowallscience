import { describe, expect, it } from "vitest";
import {
  acpKindToTool,
  acpToolCallToEvent,
  acpToolStatus,
} from "./acp-normalize";

describe("acpToolStatus", () => {
  it("maps ACP statuses to app tool statuses", () => {
    expect(acpToolStatus("in_progress")).toBe("running");
    expect(acpToolStatus("completed")).toBe("success");
    expect(acpToolStatus("failed")).toBe("failed");
    expect(acpToolStatus("pending")).toBe("pending");
  });

  it("falls back to pending for unknown / missing status (non_exhaustive enum)", () => {
    expect(acpToolStatus("switch_mode_or_future_variant")).toBe("pending");
    expect(acpToolStatus(undefined)).toBe("pending");
  });
});

describe("acpKindToTool", () => {
  it("maps kinds with an OpenCode verb analogue", () => {
    expect(acpKindToTool("read")).toBe("read");
    expect(acpKindToTool("edit")).toBe("edit");
    expect(acpKindToTool("execute")).toBe("bash");
    expect(acpKindToTool("search")).toBe("grep");
    expect(acpKindToTool("fetch")).toBe("webfetch");
  });

  it("keeps the raw kind for analogue-less kinds, and 'tool' when absent", () => {
    expect(acpKindToTool("delete")).toBe("delete");
    expect(acpKindToTool("other")).toBe("other");
    expect(acpKindToTool(undefined)).toBe("tool");
    expect(acpKindToTool("")).toBe("tool");
  });
});

describe("acpToolCallToEvent", () => {
  it("returns null without a tool-call id (nothing to key on)", () => {
    expect(acpToolCallToEvent("s1", { title: "x" })).toBeNull();
    expect(acpToolCallToEvent("s1", null)).toBeNull();
    expect(acpToolCallToEvent("s1", "nope")).toBeNull();
  });

  it("translates an execute tool call, passing rawInput through as input", () => {
    // Shape as serialized by agent-client-protocol's ToolCall (camelCase).
    const event = acpToolCallToEvent("sess-1", {
      toolCallId: "call_7",
      title: "Run tests",
      kind: "execute",
      status: "in_progress",
      rawInput: { command: "pnpm test" },
    });
    expect(event).toEqual({
      type: "tool.updated",
      sessionId: "sess-1",
      callId: "call_7",
      tool: "bash",
      status: "running",
      title: "Run tests",
      input: { command: "pnpm test" },
    });
  });

  it("folds the first location path into input when rawInput lacks one", () => {
    const event = acpToolCallToEvent("sess-1", {
      toolCallId: "c1",
      kind: "read",
      status: "completed",
      locations: [{ path: "/ws/src/main.rs", line: 12 }],
    });
    expect(event?.tool).toBe("read");
    expect(event?.status).toBe("success");
    expect(event?.input).toEqual({ path: "/ws/src/main.rs" });
  });

  it("does not overwrite an explicit rawInput path with a location", () => {
    const event = acpToolCallToEvent("sess-1", {
      toolCallId: "c1",
      kind: "read",
      rawInput: { filePath: "/ws/real.ts" },
      locations: [{ path: "/ws/other.ts" }],
    });
    expect(event?.input).toEqual({ filePath: "/ws/real.ts" });
  });

  it("collects text content blocks as output", () => {
    const event = acpToolCallToEvent("sess-1", {
      toolCallId: "c1",
      kind: "execute",
      status: "completed",
      content: [
        { type: "content", content: { type: "text", text: "line 1" } },
        { type: "content", content: { type: "text", text: "line 2" } },
      ],
    });
    expect(event?.output).toBe("line 1\nline 2");
  });

  it("synthesizes a unified diff from a diff content block (edit)", () => {
    const event = acpToolCallToEvent("sess-1", {
      toolCallId: "c1",
      kind: "edit",
      status: "completed",
      content: [
        { type: "diff", path: "/ws/a.ts", oldText: "old", newText: "new" },
      ],
    });
    expect(event?.tool).toBe("edit");
    expect(event?.diff).toBe("- old\n+ new");
  });

  it("renders a new-file diff (null oldText) as all additions", () => {
    const event = acpToolCallToEvent("sess-1", {
      toolCallId: "c1",
      kind: "edit",
      content: [
        { type: "diff", path: "/ws/new.ts", oldText: null, newText: "a\nb" },
      ],
    });
    expect(event?.diff).toBe("+ a\n+ b");
  });

  it("uses a string rawOutput as output when no text content is present", () => {
    const event = acpToolCallToEvent("sess-1", {
      toolCallId: "c1",
      kind: "other",
      rawOutput: "result string",
    });
    expect(event?.tool).toBe("other");
    expect(event?.output).toBe("result string");
  });

  it("omits optional fields the payload did not carry", () => {
    const event = acpToolCallToEvent("sess-1", {
      toolCallId: "c1",
      status: "pending",
    });
    // No title, no input, no output, no diff — only the required shape.
    expect(event).toEqual({
      type: "tool.updated",
      sessionId: "sess-1",
      callId: "c1",
      tool: "tool",
      status: "pending",
    });
  });
});
