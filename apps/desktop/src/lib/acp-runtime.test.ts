import { describe, expect, it, vi } from "vitest";
import type { OpenCodeEvent, RuntimeStatus } from "@zerowall/sdk";
import type { AcpEventHandlers, AcpLaunchRequest, AcpStatus } from "./acp";
import { AcpRuntime, AcpUnsupportedError, type AcpRuntimeDeps } from "./acp-runtime";

const REQUEST: AcpLaunchRequest = { id: "codex", label: "Codex", command: "codex" };
const READY: AcpStatus = { running: true, profile_id: "codex" };
const IDLE: AcpStatus = { running: false, profile_id: null };

/** Last element, avoiding Array.prototype.at (below the tsc lib target here). */
function last<T>(arr: T[]): T | undefined {
  return arr[arr.length - 1];
}

/** A fake of the injected Tauri bridge that captures the subscribed handlers so
 *  a test can drive the agent's event stream synchronously. */
function makeDeps() {
  let handlers: AcpEventHandlers = {};
  const unlisten = vi.fn();
  const deps: AcpRuntimeDeps = {
    launch: vi.fn(async () => READY),
    prompt: vi.fn(async () => {}),
    cancel: vi.fn(async () => {}),
    shutdown: vi.fn(async () => IDLE),
    subscribe: vi.fn(async (h: AcpEventHandlers) => {
      handlers = h;
      return unlisten;
    }),
  };
  return { deps, unlisten, fire: () => handlers };
}

function harness() {
  const { deps, unlisten, fire } = makeDeps();
  const runtime = new AcpRuntime(REQUEST, deps);
  const events: OpenCodeEvent[] = [];
  const statuses: RuntimeStatus[] = [];
  runtime.onEvent((e) => events.push(e));
  runtime.onStatus((s) => statuses.push(s));
  return { runtime, deps, unlisten, fire, events, statuses };
}

describe("AcpRuntime lifecycle", () => {
  it("subscribes before launching, then goes ready", async () => {
    const { runtime, deps, statuses } = harness();
    await runtime.connect();
    // subscribe must be called before launch so no early event is dropped.
    const subOrder = (deps.subscribe as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    const launchOrder = (deps.launch as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    expect(subOrder).toBeLessThan(launchOrder);
    expect(statuses).toEqual(["connecting", "ready"]);
    expect(runtime.getStatus()).toBe("ready");
  });

  it("tears down and reports error when launch fails", async () => {
    const { runtime, unlisten, statuses } = harness();
    (runtime as unknown as { deps: AcpRuntimeDeps }).deps.launch = vi.fn(async () => {
      throw new Error("spawn failed");
    });
    await expect(runtime.connect()).rejects.toThrow("spawn failed");
    expect(unlisten).toHaveBeenCalledOnce();
    expect(statuses).toEqual(["connecting", "error"]);
  });

  it("close() unlistens, shuts down, and goes offline", async () => {
    const { runtime, deps, unlisten, statuses } = harness();
    await runtime.connect();
    runtime.close();
    expect(unlisten).toHaveBeenCalledOnce();
    expect(deps.shutdown).toHaveBeenCalledOnce();
    expect(last(statuses)).toBe("offline");
  });
});

describe("AcpRuntime event translation", () => {
  it("accumulates message chunks into a full-value text.updated per message id", async () => {
    const { runtime, fire, events } = harness();
    await runtime.connect();
    fire().onMessage!({ message_id: "m1", text: "Hel" });
    fire().onMessage!({ message_id: "m1", text: "lo" });
    const texts = events.filter((e) => e.type === "text.updated");
    expect(texts).toEqual([
      { type: "text.updated", sessionId: "codex", partId: "m1", text: "Hel" },
      { type: "text.updated", sessionId: "codex", partId: "m1", text: "Hello" },
    ]);
  });

  it("routes thought chunks to reasoning.updated", async () => {
    const { runtime, fire, events } = harness();
    await runtime.connect();
    fire().onThought!({ message_id: "t1", text: "thinking" });
    expect(events.filter((e) => e.type === "reasoning.updated")).toEqual([
      { type: "reasoning.updated", sessionId: "codex", partId: "t1", text: "thinking" },
    ]);
  });

  it("keeps unlabeled chunks of separate turns in separate bubbles", async () => {
    const { runtime, fire, events } = harness();
    await runtime.connect();
    fire().onMessage!({ message_id: null, text: "turn one" });
    fire().onTurnEnded!("end_turn");
    fire().onMessage!({ message_id: null, text: "turn two" });
    const parts = events
      .filter((e): e is Extract<OpenCodeEvent, { type: "text.updated" }> => e.type === "text.updated")
      .map((e) => e.partId);
    expect(new Set(parts).size).toBe(2); // two distinct part ids across the turn boundary
  });

  it("emits session.idle on turn-ended", async () => {
    const { runtime, fire, events } = harness();
    await runtime.connect();
    fire().onTurnEnded!("end_turn");
    expect(last(events)).toEqual({ type: "session.idle", sessionId: "codex" });
  });

  it("translates a tool call through the normalizer", async () => {
    const { runtime, fire, events } = harness();
    await runtime.connect();
    fire().onToolCall!({
      toolCallId: "c1",
      kind: "execute",
      status: "in_progress",
      rawInput: { command: "ls" },
    });
    expect(last(events)).toEqual({
      type: "tool.updated",
      sessionId: "codex",
      callId: "c1",
      tool: "bash",
      status: "running",
      input: { command: "ls" },
    });
  });

  it("surfaces an abnormal exit as an error and goes offline", async () => {
    const { runtime, fire, events, statuses } = harness();
    await runtime.connect();
    fire().onExited!("agent crashed");
    expect(last(events)).toEqual({ type: "error", sessionId: "codex", message: "agent crashed" });
    expect(last(statuses)).toBe("offline");
  });

  it("does not emit an error on a clean exit", async () => {
    const { runtime, fire, events } = harness();
    await runtime.connect();
    fire().onExited!(null);
    expect(events.some((e) => e.type === "error")).toBe(false);
  });
});

describe("AcpRuntime prompt + unsupported ops", () => {
  it("forwards a prompt as plain text (ignoring agent/model/variant)", async () => {
    const { runtime, deps } = harness();
    await runtime.connect();
    await runtime.sendPrompt("codex", "hi", "plan", "openai/gpt-5", "max");
    expect(deps.prompt).toHaveBeenCalledWith("hi");
  });

  it("abort forwards to cancel", async () => {
    const { runtime, deps } = harness();
    await runtime.connect();
    await runtime.abortSession("codex");
    expect(deps.cancel).toHaveBeenCalledOnce();
  });

  it("throws AcpUnsupportedError for revert / shell / command", async () => {
    const { runtime } = harness();
    await expect(runtime.revert("codex", "m1")).rejects.toBeInstanceOf(AcpUnsupportedError);
    await expect(runtime.runShell("codex", "ls")).rejects.toBeInstanceOf(AcpUnsupportedError);
    await expect(runtime.runCommand("codex", "/review")).rejects.toBeInstanceOf(AcpUnsupportedError);
  });

  it("exposes exactly one session whose id is the profile id", async () => {
    const { runtime } = harness();
    expect(await runtime.createSession()).toBe("codex");
    expect(await runtime.listSessions()).toEqual([{ id: "codex", title: "Codex" }]);
    expect(await runtime.getMessages()).toEqual([]);
  });

  it("discovery methods return empty (nothing advertised over ACP)", async () => {
    const { runtime } = harness();
    expect(await runtime.listSkills()).toEqual([]);
    expect(await runtime.listAgents()).toEqual([]);
    expect(await runtime.listCommands()).toEqual([]);
    expect(await runtime.getDefaultModel()).toBeNull();
  });
});
