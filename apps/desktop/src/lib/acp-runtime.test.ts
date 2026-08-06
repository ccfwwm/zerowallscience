import { describe, expect, it, vi } from "vitest";
import type { OpenCodeEvent, RuntimeStatus } from "@zerowall/sdk";
import type { AcpEventHandlers, AcpLaunchRequest, AcpStatus } from "./acp";
import { AcpRuntime, AcpUnsupportedError, type AcpRuntimeDeps } from "./acp-runtime";

const REQUEST: AcpLaunchRequest = {
  profileId: "codex",
  gateway: { providerId: "zerowall-1", baseUrl: "https://gateway/v1", model: "gpt-5.4" },
};
const READY: AcpStatus = {
  phase: "ready",
  profile_id: "codex",
  runtime_info: null,
  last_error: null,
};
const IDLE: AcpStatus = {
  phase: "idle",
  profile_id: null,
  runtime_info: null,
  last_error: null,
};

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
    respondPermission: vi.fn(async () => {}),
    shutdown: vi.fn(async () => IDLE),
    setModel: vi.fn(async () => {}),
    listSkills: vi.fn(async () => []),
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

describe("AcpRuntime capability discovery", () => {
  it("lists the skills copied into the active ACP runtime home", async () => {
    const { runtime, deps } = harness();
    (deps.listSkills as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { name: "literature-review", description: "Search and synthesize papers", location: "C:/acp/skills/literature-review/SKILL.md" },
    ]);

    await expect(runtime.listSkills()).resolves.toEqual([
      { name: "literature-review", description: "Search and synthesize papers", location: "C:/acp/skills/literature-review/SKILL.md" },
    ]);
    expect(deps.listSkills).toHaveBeenCalledWith("codex");
  });
});

describe("AcpRuntime permissions", () => {
  it("preserves Host request ids and selects the real option id", async () => {
    const { runtime, deps, fire, events } = harness();
    await runtime.connect();
    fire().onHostPermission?.({
      request_id: "permission-abc",
      action: "shell",
      resources: ["git status"],
      options: [
        { option_id: "allow_once", name: "Allow once" },
        { option_id: "reject", name: "Reject" },
      ],
    });

    expect(events).toContainEqual({
      type: "permission.asked",
      sessionId: "codex",
      requestId: "permission-abc",
      action: "shell",
      resources: ["git status"],
    });
    await runtime.replyPermission("permission-abc", "once");
    expect(deps.respondPermission).toHaveBeenCalledWith("permission-abc", "allow_once");
    expect(events).toContainEqual({
      type: "permission.resolved",
      sessionId: "codex",
      requestId: "permission-abc",
    });
  });
});

describe("AcpRuntime event translation", () => {
  it("accumulates message chunks into a full-value text.updated per message id", async () => {
    vi.useFakeTimers();
    try {
      const { runtime, fire, events } = harness();
      await runtime.connect();
      fire().onMessage!({ message_id: "m1", text: "Hel" });
      fire().onMessage!({ message_id: "m1", text: "lo" });
      vi.advanceTimersByTime(40);
      const texts = events.filter((e) => e.type === "text.updated");
      expect(texts).toEqual([
        { type: "text.updated", sessionId: "codex", partId: "m1", text: "Hel" },
        { type: "text.updated", sessionId: "codex", partId: "m1", text: "Hello" },
      ]);
    } finally {
      vi.useRealTimers();
    }
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

  it("surfaces an abnormal exit and remains in error for retry", async () => {
    const { runtime, fire, events, statuses } = harness();
    await runtime.connect();
    fire().onExited!("agent crashed");
    expect(last(events)).toEqual({ type: "error", sessionId: "codex", message: "agent crashed" });
    expect(last(statuses)).toBe("error");
  });

  it("does not emit an error on a clean exit", async () => {
    const { runtime, fire, events } = harness();
    await runtime.connect();
    fire().onExited!(null);
    expect(events.some((e) => e.type === "error")).toBe(false);
  });

  it("coalesces rapid text chunks between display refreshes", async () => {
    vi.useFakeTimers();
    try {
      const { runtime, fire, events } = harness();
      await runtime.connect();
      fire().onMessage!({ message_id: "m1", text: "Hel" });
      fire().onMessage!({ message_id: "m1", text: "lo" });
      expect(events.filter((event) => event.type === "text.updated")).toHaveLength(1);
      vi.advanceTimersByTime(40);
      expect(events.filter((event) => event.type === "text.updated")).toEqual([
        { type: "text.updated", sessionId: "codex", partId: "m1", text: "Hel" },
        { type: "text.updated", sessionId: "codex", partId: "m1", text: "Hello" },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not mislabel ACP context occupancy as input or estimated output tokens", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-04T09:00:00.000Z"));
    try {
    const { runtime, fire, events } = harness();
    await runtime.connect();
    await runtime.sendPrompt("codex", "question");
    fire().onMessage!({ message_id: "reply-1", text: "answer" });
    fire().onUsage!({ used: 1234, size: 200000 });
    vi.advanceTimersByTime(1_250);
    fire().onTurnEnded!("end_turn");
    expect(last(events)).toEqual({
      type: "session.idle",
      sessionId: "codex",
    });
    expect(last(events.filter((event) => event.type === "usage"))).toEqual({
      type: "usage",
      sessionId: "codex",
      messageID: "reply-1",
      input: 0,
      inputUnavailable: true,
      output: 0,
      outputUnavailable: true,
      contextUsed: 1234,
      contextSize: 200000,
      durationMs: 1250,
      reasoning: 0,
      cacheRead: 0,
      cacheWrite: 0,
    });
    } finally {
      vi.useRealTimers();
    }
  });

  it("persists exact ACP prompt usage as per-turn deltas", async () => {
    const { runtime, fire, events } = harness();
    await runtime.connect();
    await runtime.sendPrompt("codex", "first");
    fire().onMessage!({ message_id: "reply-1", text: "one" });
    fire().onTurnEnded!("end_turn", {
      total_tokens: 100,
      input_tokens: 60,
      output_tokens: 40,
      thought_tokens: 4,
      cached_read_tokens: 2,
      cached_write_tokens: 1,
    });
    await runtime.sendPrompt("codex", "second");
    fire().onMessage!({ message_id: "reply-2", text: "two" });
    fire().onTurnEnded!("end_turn", {
      total_tokens: 250,
      input_tokens: 160,
      output_tokens: 90,
      thought_tokens: 10,
      cached_read_tokens: 7,
      cached_write_tokens: 3,
    });

    const usage = events.filter((event) => event.type === "usage");
    expect(usage[usage.length - 2]).toMatchObject({
      messageID: "reply-1",
      input: 60,
      output: 40,
      reasoning: 4,
      cacheRead: 2,
      cacheWrite: 1,
    });
    expect(usage[usage.length - 1]).toMatchObject({
      messageID: "reply-2",
      input: 100,
      output: 50,
      reasoning: 6,
      cacheRead: 5,
      cacheWrite: 2,
    });
    expect(usage[usage.length - 1]).not.toHaveProperty("inputUnavailable");
    expect(usage[usage.length - 1]).not.toHaveProperty("outputUnavailable");
  });

  it("uses exact provider counters carried by an ACP usage update", async () => {
    const { runtime, fire, events } = harness();
    await runtime.connect();
    await runtime.sendPrompt("codex", "question");
    fire().onMessage!({ message_id: "reply-meta", text: "answer" });
    fire().onUsage!({
      used: 1_200,
      size: 200_000,
      token_usage: {
        total_tokens: 157,
        input_tokens: 120,
        output_tokens: 37,
        thought_tokens: 5,
        cached_read_tokens: 20,
        cached_write_tokens: 0,
      },
    });

    expect(last(events.filter((event) => event.type === "usage"))).toMatchObject({
      messageID: "reply-meta",
      input: 120,
      output: 37,
      reasoning: 5,
      cacheRead: 20,
      contextUsed: 1_200,
      contextSize: 200_000,
    });
  });

  it("marks both token directions unavailable when ACP reports no usage", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-04T10:00:00.000Z"));
    try {
      const { runtime, fire, events } = harness();
      await runtime.connect();
      await runtime.sendPrompt("codex", "question");
      fire().onMessage!({ message_id: "reply-1", text: "你好" });
      vi.advanceTimersByTime(900);
      fire().onTurnEnded!("end_turn");

      expect(last(events.filter((event) => event.type === "usage"))).toEqual({
        type: "usage",
        sessionId: "codex",
        messageID: "reply-1",
        input: 0,
        inputUnavailable: true,
        output: 0,
        outputUnavailable: true,
        durationMs: 900,
        reasoning: 0,
        cacheRead: 0,
        cacheWrite: 0,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("restamps Claude usage that arrives after turn-ended onto the completed reply", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-05T01:00:00.000Z"));
    try {
      const { runtime, fire, events } = harness();
      await runtime.connect();
      await runtime.sendPrompt("codex", "question");
      fire().onMessage!({ message_id: "reply-1", text: "answer" });
      vi.advanceTimersByTime(900);
      fire().onTurnEnded!("end_turn");
      // Claude Code ACP sends its context occupancy after the terminal update.
      fire().onUsage!({ used: 512, size: 200000 });

      expect(last(events.filter((event) => event.type === "usage"))).toEqual({
        type: "usage",
        sessionId: "codex",
        messageID: "reply-1",
        input: 0,
        inputUnavailable: true,
        output: 0,
        outputUnavailable: true,
        contextUsed: 512,
        contextSize: 200000,
        durationMs: 900,
        reasoning: 0,
        cacheRead: 0,
        cacheWrite: 0,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("holds usage that arrives before text until it can sit beneath that reply", async () => {
    const { runtime, fire, events } = harness();
    await runtime.connect();
    fire().onUsage!({ used: 4321, size: 200000 });
    expect(events).toEqual([]);
    fire().onMessage!({ message_id: "reply-1", text: "answer" });
    expect(events.map((event) => event.type)).toEqual(["text.updated", "usage"]);
    expect(last(events)).toMatchObject({
      type: "usage",
      messageID: "reply-1",
      input: 0,
      inputUnavailable: true,
      output: 0,
      outputUnavailable: true,
      contextUsed: 4321,
      contextSize: 200000,
    });
  });

  it("keeps the connection ready across authoritative busy and ready states", async () => {
    const { runtime, fire } = harness();
    await runtime.connect();
    fire().onState!({ ...READY, phase: "busy" });
    fire().onState!(READY);
    expect(runtime.getStatus()).toBe("ready");
  });
});

describe("AcpRuntime prompt + unsupported ops", () => {
  it("creates and switches multiple Host sessions without reusing the profile id", async () => {
    const { deps } = makeDeps();
    deps.currentSessionId = vi.fn(() => "host-session-1");
    deps.createSession = vi.fn(async () => "host-session-2");
    deps.listSessions = vi.fn(async () => [
      { id: "host-session-1", title: "First" },
      { id: "host-session-2", title: "Second" },
    ]);
    deps.getMessages = vi.fn(async (sessionId) => [
      { role: "user" as const, id: sessionId, parts: [{ type: "text", text: sessionId }] },
    ]);
    deps.promptSession = vi.fn(async () => {});
    deps.activateSession = vi.fn(async () => {});
    const runtime = new AcpRuntime(REQUEST, deps);
    await runtime.connect();

    expect(await runtime.createSession()).toBe("host-session-1");
    expect(await runtime.createSession()).toBe("host-session-2");
    expect(await runtime.listSessions()).toEqual([
      { id: "host-session-1", title: "First" },
      { id: "host-session-2", title: "Second" },
    ]);
    await expect(runtime.getMessages("host-session-2")).resolves.toEqual([
      { role: "user", id: "host-session-2", parts: [{ type: "text", text: "host-session-2" }] },
    ]);
    await runtime.sendPrompt("host-session-2", "hello");
    expect(deps.activateSession).toHaveBeenCalledWith("host-session-2");
    expect(deps.promptSession).toHaveBeenCalledWith("host-session-2", "hello", []);
  });

  it("forwards a prompt and its attachments while ignoring agent/model/variant", async () => {
    const { runtime, deps } = harness();
    await runtime.connect();
    const attachments = [
      { filename: "floor-plan.png", mime: "image/png", base64: "cGl4ZWxz" },
      {
        filename: "notes.txt",
        mime: "text/plain",
        base64: "bm90ZXM=",
        extractedText: "Important document contents",
      },
    ];
    await runtime.sendPrompt("codex", "hi", "plan", "openai/gpt-5", "max", attachments);
    expect(deps.prompt).toHaveBeenCalledWith("hi", attachments);
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

describe("AcpRuntime model selection", () => {
  it("changes the model in the existing ACP session without launching again", async () => {
    const { runtime, deps } = harness();
    await runtime.connect();

    await runtime.setDefaultModel("zerowall-1/gpt-5.6-terra");

    expect(deps.setModel).toHaveBeenCalledWith("gpt-5.6-terra");
    expect(deps.launch).toHaveBeenCalledOnce();
    expect(deps.shutdown).not.toHaveBeenCalled();
  });
});
