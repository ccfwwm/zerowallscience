import { describe, expect, it } from "vitest";
import type { OpenCodeEvent, HistoryMessage } from "@zerowall/sdk";
import {
  datedWorkspaceName,
  foldCarriageReturns,
  foldEvent,
  historyToThread,
  humanizeCommand,
  subagentActivity,
  tidyToolTitle,
  toolPresentation,
  type FoldState,
} from "./runtime";

const empty: FoldState = { blocks: [], index: {} };
const S = "ses_1";
const foldAll = (events: OpenCodeEvent[], from: FoldState = empty): FoldState =>
  events.reduce((s, e) => foldEvent(s, e), from);

describe("tidyToolTitle", () => {
  it("shows workspace files by their relative path", () => {
    expect(tidyToolTitle("/Users/asq/Documents/ZeroWallScience/demo/analyze.py")).toBe("demo/analyze.py");
    expect(tidyToolTitle("mkdir -p /Users/asq/Documents/ZeroWallScience/demo_analysis")).toBe(
      "mkdir -p demo_analysis",
    );
    // OpenCode's write-tool titles drop the leading slash — must still relativize.
    expect(tidyToolTitle("Users/asq/Documents/ZeroWallScience/demo_analysis/analyze.py")).toBe(
      "demo_analysis/analyze.py",
    );
  });
  it("leaves non-workspace titles unchanged", () => {
    expect(tidyToolTitle("search (done)")).toBe("search (done)");
    expect(tidyToolTitle("python3 -c \"import numpy\"")).toBe('python3 -c "import numpy"');
  });
});

describe("humanizeCommand", () => {
  it("strips leading cd hops so the real command leads", () => {
    expect(
      humanizeCommand("cd output/experiment-suite/very/long/path && python train.py --mode teacher"),
    ).toBe("python train.py --mode teacher");
    expect(humanizeCommand("cd /a/b; cd c && ls -la")).toBe("ls -la");
    expect(humanizeCommand('cd "dir with spaces" && make test')).toBe("make test");
  });
  it("collapses whitespace but leaves cd-less commands intact", () => {
    expect(humanizeCommand("git  status\n  --short")).toBe("git status --short");
  });
  it("a bare cd keeps the command (nothing better to show)", () => {
    expect(humanizeCommand("cd demo")).toBe("cd demo");
  });
});

describe("foldCarriageReturns", () => {
  it("keeps only what each line last drew (tqdm-style redraws)", () => {
    expect(foldCarriageReturns("epoch 1:  10%\repoch 1:  50%\repoch 1: 100%\ndone")).toBe(
      "epoch 1: 100%\ndone",
    );
    expect(foldCarriageReturns("plain\ntext")).toBe("plain\ntext");
  });
});

describe("toolPresentation", () => {
  it("bash: verb Ran + de-noised command, over the model's description", () => {
    expect(toolPresentation("bash", "install deps", { command: "cd x && pip install numpy" })).toEqual({
      verb: "Ran",
      title: "pip install numpy",
    });
  });
  it("file tools: verb + relative path", () => {
    expect(
      toolPresentation("write", "", { filePath: "/Users/asq/Documents/ZeroWallScience/demo/train.py" }),
    ).toEqual({ verb: "Created", title: "demo/train.py" });
    expect(toolPresentation("edit", "", { filePath: "config.yaml" })).toEqual({
      verb: "Edited",
      title: "config.yaml",
    });
  });
  it("unknown tools keep the old fallback chain, no verb", () => {
    expect(toolPresentation("mcp_thing", "did something", {})).toEqual({ title: "did something" });
    expect(toolPresentation("mcp_thing", "", {})).toEqual({ title: "mcp_thing" });
  });
});

describe("datedWorkspaceName", () => {
  it("formats a zero-padded YYYY-MM-DD-HHMM folder name", () => {
    expect(datedWorkspaceName(new Date(2026, 6, 4, 16, 5))).toBe("2026-07-04-1605");
    expect(datedWorkspaceName(new Date(2026, 0, 9, 3, 40))).toBe("2026-01-09-0340");
  });
});

describe("foldEvent", () => {
  it("upserts a text part by id (idempotent full-text updates, not appends)", () => {
    const s = foldAll([
      { type: "text.updated", sessionId: S, partId: "p1", text: "Planning" },
      { type: "text.updated", sessionId: S, partId: "p1", text: "Planning the review" },
    ]);
    expect(s.blocks).toHaveLength(1);
    expect(s.blocks[0]).toEqual({ kind: "agent", markdown: "Planning the review" });
  });

  it("upserts a reasoning part by id into a reasoning block (thinking, streamed)", () => {
    const s = foldAll([
      { type: "reasoning.updated", sessionId: S, partId: "r1", text: "Let me" },
      { type: "reasoning.updated", sessionId: S, partId: "r1", text: "Let me check the data" },
    ]);
    expect(s.blocks).toHaveLength(1);
    expect(s.blocks[0]).toEqual({ kind: "reasoning", text: "Let me check the data" });
  });

  it("keeps reasoning separate from the final answer text", () => {
    const s = foldAll([
      { type: "reasoning.updated", sessionId: S, partId: "r1", text: "Thinking…" },
      { type: "text.updated", sessionId: S, partId: "p1", text: "Here is the answer" },
    ]);
    expect(s.blocks).toHaveLength(2);
    expect(s.blocks[0]).toEqual({ kind: "reasoning", text: "Thinking…" });
    expect(s.blocks[1]).toEqual({ kind: "agent", markdown: "Here is the answer" });
  });

  it("upserts a tool call by callId and reflects status transitions", () => {
    const s = foldAll([
      { type: "tool.updated", sessionId: S, callId: "c1", tool: "search", status: "running", title: "search" },
      { type: "tool.updated", sessionId: S, callId: "c1", tool: "search", status: "success", title: "search (done)" },
    ]);
    expect(s.blocks).toHaveLength(1);
    expect(s.blocks[0]).toMatchObject({ kind: "tool-call", status: "success", title: "search (done)" });
  });

  it("does not render interactive question/permission tools as thread rows", () => {
    // These are surfaced by InteractionPrompt (answerable), not as blank rows.
    const s = foldAll([
      { type: "tool.updated", sessionId: S, callId: "q1", tool: "question", status: "running", title: "" },
      { type: "tool.updated", sessionId: S, callId: "p1", tool: "permission", status: "running", title: "" },
    ]);
    expect(s.blocks).toHaveLength(0);
  });

  it("drops opaque todo tool rows from the conversation", () => {
    const s = foldAll([
      { type: "tool.updated", sessionId: S, callId: "t1", tool: "todowrite", status: "success", title: "4 todos" },
    ]);
    expect(s.blocks).toHaveLength(0);
  });

  it("never blanks a tool row when the completed event reports an empty title", () => {
    // Completed MCP tool parts carry title: "" — the tool name must survive.
    const s = foldAll([
      { type: "tool.updated", sessionId: S, callId: "c1", tool: "jupyter_insert_cell", status: "running" },
      { type: "tool.updated", sessionId: S, callId: "c1", tool: "jupyter_insert_cell", status: "success", title: "" },
    ]);
    expect(s.blocks[0]).toMatchObject({
      kind: "tool-call",
      status: "success",
      title: "jupyter_insert_cell",
    });
  });

  it("shows the file path for a file tool that has no title yet", () => {
    // OpenCode only sets a write/edit tool's title on completion — while the
    // tool runs, the file path in its input is the only thing worth showing.
    const s = foldAll([
      { type: "tool.updated", sessionId: S, callId: "c1", tool: "write", status: "running", input: { filePath: "/Users/asq/Documents/ZeroWallScience/2026-07-04/index.html", content: "<!doctype html>" } },
    ]);
    expect(s.blocks[0]).toMatchObject({
      kind: "tool-call",
      status: "running",
      title: "2026-07-04/index.html",
    });
  });

  it("surfaces a written file as an artifact block, deduped by path", () => {
    const s = foldAll([
      { type: "tool.updated", sessionId: S, callId: "c1", tool: "write", status: "running", input: { filePath: "fig.py" } },
      { type: "tool.updated", sessionId: S, callId: "c1", tool: "write", status: "success", input: { filePath: "fig.py", content: "print(1)" } },
    ]);
    const artifacts = s.blocks.filter((b) => b.kind === "artifact");
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]).toMatchObject({ kind: "artifact", filename: "fig.py", artifact: "script", content: "print(1)" });
    // The tool-call row is still present alongside the artifact.
    expect(s.blocks.some((b) => b.kind === "tool-call")).toBe(true);
  });

  it("carries a running bash step's live output tail, \\r-folded; completion clears it", () => {
    const s1 = foldAll([
      { type: "tool.updated", sessionId: S, callId: "c1", tool: "bash", status: "running", input: { command: "python train.py" }, startedAt: 1000, partialOutput: "epoch 1:  10%\repoch 1:  50%\n" },
    ]);
    expect(s1.blocks[0]).toMatchObject({
      kind: "tool-call",
      title: "python train.py",
      verb: "Ran",
      status: "running",
      partialOutput: "epoch 1:  50%\n",
      startedAt: 1000,
    });
    const s2 = foldAll(
      [{ type: "tool.updated", sessionId: S, callId: "c1", tool: "bash", status: "success", input: { command: "python train.py" }, output: "epoch 1: 100%\ndone\n", endedAt: 5000 }],
      s1,
    );
    expect(s2.blocks[0]).toMatchObject({
      kind: "tool-call",
      status: "success",
      output: "epoch 1: 100%\ndone",
      // startedAt survives from the running event; the tail is gone.
      startedAt: 1000,
      endedAt: 5000,
    });
    expect(s2.blocks[0]).not.toHaveProperty("partialOutput");
  });

  it("keeps distinct parts as separate blocks in arrival order", () => {
    const s = foldAll([
      { type: "text.updated", sessionId: S, partId: "p1", text: "planning" },
      { type: "tool.updated", sessionId: S, callId: "c1", tool: "search", status: "success" },
      { type: "text.updated", sessionId: S, partId: "p2", text: "done" },
      { type: "session.idle", sessionId: S },
    ]);
    expect(s.blocks.map((b) => b.kind)).toEqual(["agent", "tool-call", "agent", "status-line"]);
  });

  it("deduplicates repeated session idle events", () => {
    const s = foldAll([
      { type: "text.updated", sessionId: S, partId: "p1", text: "done" },
      { type: "session.idle", sessionId: S },
      { type: "session.idle", sessionId: S },
    ]);
    expect(s.blocks.filter((b) => b.kind === "status-line" && b.tone === "done")).toHaveLength(1);
  });

  it("upserts usage by message id — one tail with the latest cumulative totals", () => {
    // OpenCode restamps the same assistant message with growing totals; the tail
    // must upsert (not append a row per stamp).
    const s = foldAll([
      { type: "usage", sessionId: S, messageID: "m1", input: 100, output: 5, reasoning: 0, cacheRead: 0, cacheWrite: 0, cost: 0.001 },
      { type: "usage", sessionId: S, messageID: "m1", input: 100, output: 42, reasoning: 8, cacheRead: 0, cacheWrite: 0, cost: 0.0021 },
    ]);
    const usage = s.blocks.filter((b) => b.kind === "usage");
    expect(usage).toHaveLength(1);
    expect(usage[0]).toEqual({
      kind: "usage",
      input: 100,
      output: 42,
      reasoning: 8,
      cacheRead: 0,
      cacheWrite: 0,
    });
  });

  it("keeps two assistant messages' usage as separate tails", () => {
    const s = foldAll([
      { type: "usage", sessionId: S, messageID: "m1", input: 10, output: 1, reasoning: 0, cacheRead: 0, cacheWrite: 0, cost: 0.0001 },
      { type: "usage", sessionId: S, messageID: "m2", input: 20, output: 2, reasoning: 0, cacheRead: 0, cacheWrite: 0, cost: 0.0002 },
    ]);
    expect(s.blocks.filter((b) => b.kind === "usage")).toHaveLength(2);
  });

  it("omits cost from the usage block when the provider priced nothing", () => {
    // A local model reports no cost → the block carries no `cost` key, so the UI
    // renders "—" rather than a fabricated $0 (see AGENTS.md: fail honestly).
    const s = foldAll([
      { type: "usage", sessionId: S, messageID: "m1", input: 30, output: 4, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
    ]);
    const usage = s.blocks.find((b) => b.kind === "usage");
    expect(usage).not.toHaveProperty("cost");
  });
});

describe("subagent activity", () => {
  it("records the child session id on a task tool block", () => {
    const s = foldAll([
      {
        type: "tool.updated",
        sessionId: S,
        callId: "c1",
        tool: "task",
        status: "running",
        title: "Visual QA for slides",
        childSessionId: "ses_child",
      },
    ]);
    expect(s.blocks[0]).toMatchObject({ kind: "tool-call", childSessionId: "ses_child" });
  });

  it("subagentActivity: shows the child's latest tool step", () => {
    const child = foldAll([
      { type: "tool.updated", sessionId: "ses_child", callId: "k1", tool: "bash", status: "success", title: "pdftoppm -jpeg slides.pdf" },
      { type: "tool.updated", sessionId: "ses_child", callId: "k2", tool: "bash", status: "running", title: "python3 analyze slide-03.jpg" },
    ]);
    expect(subagentActivity(child.blocks)).toBe("python3 analyze slide-03.jpg");
  });

  it("subagentActivity: 'Writing…' while the child is streaming text", () => {
    const child = foldAll([
      { type: "tool.updated", sessionId: "ses_child", callId: "k1", tool: "bash", status: "success", title: "ls" },
      { type: "text.updated", sessionId: "ses_child", partId: "p1", text: "Compiling the final report" },
    ]);
    expect(subagentActivity(child.blocks)).toBe("Writing…");
  });

  it("subagentActivity: 'Working…' when nothing is known yet", () => {
    expect(subagentActivity(undefined)).toBe("Working…");
    expect(subagentActivity([])).toBe("Working…");
  });

  it("keeps the child link when a later update omits it", () => {
    const s = foldAll([
      {
        type: "tool.updated",
        sessionId: S,
        callId: "c1",
        tool: "task",
        status: "running",
        title: "Visual QA for slides",
        childSessionId: "ses_child",
      },
      { type: "tool.updated", sessionId: S, callId: "c1", tool: "task", status: "running", title: "Visual QA for slides" },
    ]);
    expect(s.blocks[0]).toMatchObject({ kind: "tool-call", childSessionId: "ses_child" });
  });
});

describe("historyToThread", () => {
  it("converts user/assistant messages (text + tool parts) into blocks", () => {
    const msgs: HistoryMessage[] = [
      { role: "user", parts: [{ type: "text", text: "hi" }] },
      {
        role: "assistant",
        parts: [
          { type: "text", text: "planning" },
          { type: "tool", tool: "search", state: { status: "completed", title: "search" } },
        ],
      },
    ];
    const t = historyToThread(msgs);
    expect(t.blocks.map((b) => b.kind)).toEqual(["user", "agent", "tool-call"]);
    expect(t.blocks[2]).toMatchObject({ kind: "tool-call", status: "success" });
  });

  it("restores reasoning parts on reload as reasoning blocks, before the answer", () => {
    const msgs: HistoryMessage[] = [
      { role: "user", parts: [{ type: "text", text: "hi" }] },
      {
        role: "assistant",
        parts: [
          { type: "reasoning", text: "Let me think about this" },
          { type: "text", text: "Here it is" },
        ],
      },
    ];
    const t = historyToThread(msgs);
    expect(t.blocks.map((b) => b.kind)).toEqual(["user", "reasoning", "agent"]);
    expect(t.blocks[1]).toEqual({ kind: "reasoning", text: "Let me think about this" });
  });

  it("renders a user-run '!' shell turn like the live path: '! cmd' + inline output", () => {
    // OpenCode records a "!" run as a synthetic user text + a bash tool part.
    const msgs: HistoryMessage[] = [
      {
        role: "user",
        parts: [{ type: "text", text: "The following tool was executed by the user", synthetic: true }],
      },
      {
        role: "assistant",
        parts: [
          {
            type: "tool",
            tool: "bash",
            state: { status: "completed", title: "", input: { command: "pwd" }, output: "/ws/here\n" },
          },
        ],
      },
    ];
    const t = historyToThread(msgs);
    expect(t.blocks).toEqual([
      { kind: "user", text: "! pwd" },
      {
        kind: "tool-call",
        title: "pwd",
        verb: "Ran",
        tool: "bash",
        command: "pwd",
        status: "success",
        output: "/ws/here",
        outputSummary: "/ws/here",
      },
    ]);
  });

  it("shows a failed turn's error on reload instead of an unexplained empty reply", () => {
    const msgs: HistoryMessage[] = [
      { role: "user", parts: [{ type: "text", text: "hi" }] },
      { role: "assistant", completed: 2, error: "no channel available for this model", parts: [] },
    ];
    const t = historyToThread(msgs);
    expect(t.blocks).toEqual([
      { kind: "user", text: "hi" },
      { kind: "status-line", text: "no channel available for this model", tone: "error" },
    ]);
  });

  it("keeps user-interrupted turns quiet: an aborted error adds no red line", () => {
    const msgs: HistoryMessage[] = [
      { role: "user", parts: [{ type: "text", text: "hi" }] },
      { role: "assistant", completed: 2, error: "The operation was aborted.", parts: [] },
    ];
    expect(historyToThread(msgs).blocks).toEqual([{ kind: "user", text: "hi" }]);
  });

  it("falls back to the bash command as the row title (agent steps too)", () => {
    const msgs: HistoryMessage[] = [
      {
        role: "assistant",
        parts: [
          { type: "tool", tool: "bash", state: { status: "completed", title: "", input: { command: "ls -la" } } },
        ],
      },
    ];
    const t = historyToThread(msgs);
    expect(t.blocks[0]).toMatchObject({ kind: "tool-call", title: "ls -la" });
    // An agent bash step (no synthetic marker) never shows inline output.
    expect(t.blocks[0]).not.toHaveProperty("outputSummary");
  });

  it("never spins in history: frozen running/pending steps become quiet + one interrupted line", () => {
    const msgs: HistoryMessage[] = [
      { role: "user", parts: [{ type: "text", text: "explore" }] },
      {
        role: "assistant",
        parts: [
          { type: "tool", tool: "read", state: { status: "running", title: "README.md" } },
          { type: "tool", tool: "glob", state: { status: "pending", title: "*.md" } },
        ],
      },
    ];
    const t = historyToThread(msgs);
    expect(t.blocks[1]).toMatchObject({ kind: "tool-call", status: "pending" });
    expect(t.blocks[2]).toMatchObject({ kind: "tool-call", status: "pending" });
    const last = t.blocks[t.blocks.length - 1];
    expect(last).toMatchObject({ kind: "status-line", tone: "error" });
  });

  it("shows a slash command as what the user typed, not its expanded template", () => {
    // OpenCode stores the EXPANDED command/skill template as the user message,
    // with typed arguments appended — reverse-map via the known templates.
    const template = "\nThis skill guides growth for indie AI products…\n\n## Core Philosophy\n…";
    const msgs: HistoryMessage[] = [
      { role: "user", parts: [{ type: "text", text: template.trim() }] },
      { role: "assistant", parts: [{ type: "text", text: "on it" }] },
      { role: "user", parts: [{ type: "text", text: `${template.trim()}\n\n帮我设计增长方式` }] },
    ];
    const t = historyToThread(msgs, [
      { name: "growth-marketing", source: "skill", template },
    ]);
    expect(t.blocks[0]).toEqual({ kind: "user", text: "/growth-marketing" });
    expect(t.blocks[2]).toEqual({ kind: "user", text: "/growth-marketing 帮我设计增长方式" });
  });

  it("collapses a template whose $ARGUMENTS placeholder sits mid-template (goal plugin)", () => {
    // The goal plugin's command embeds the args INSIDE the template, with a
    // long instruction block after them — prefix/suffix matching around
    // $ARGUMENTS must recover the typed "/goal <args>".
    const template =
      'OpenCode goal mode command "/goal" was invoked.\n\nArguments:\n<goal_command_arguments>\n$ARGUMENTS\n</goal_command_arguments>\n\nUse the goal tools to handle this command:\n- If the arguments are empty, call get_goal…';
    const expanded = template.replace("$ARGUMENTS", "梳理项目，做一个详细剧情docx。");
    const msgs: HistoryMessage[] = [
      { role: "user", parts: [{ type: "text", text: expanded }] },
    ];
    const t = historyToThread(msgs, [{ name: "goal", source: "command", template }]);
    expect(t.blocks[0]).toEqual({ kind: "user", text: "/goal 梳理项目，做一个详细剧情docx。" });
  });

  it("leaves a long pasted user text alone when it matches no template", () => {
    const msgs: HistoryMessage[] = [
      { role: "user", parts: [{ type: "text", text: "a genuinely long pasted question…" }] },
    ];
    const t = historyToThread(msgs, [{ name: "init", template: "something else" }]);
    expect(t.blocks[0]).toEqual({ kind: "user", text: "a genuinely long pasted question…" });
  });

  it("adds no interrupted line when every step finished", () => {
    const msgs: HistoryMessage[] = [
      {
        role: "assistant",
        parts: [{ type: "tool", tool: "read", state: { status: "completed", title: "README.md" } }],
      },
    ];
    const t = historyToThread(msgs);
    expect(t.blocks.every((b) => b.kind !== "status-line")).toBe(true);
  });

  it("reconstructs a per-reply usage tail from a stored assistant message on reload", () => {
    const msgs: HistoryMessage[] = [
      { role: "user", parts: [{ type: "text", text: "hi" }] },
      {
        role: "assistant",
        parts: [{ type: "text", text: "hello" }],
        usage: { input: 120, output: 34, reasoning: 8, cacheRead: 16, cacheWrite: 0, cost: 0.0021 },
      },
    ];
    const t = historyToThread(msgs);
    expect(t.blocks.map((b) => b.kind)).toEqual(["user", "agent", "usage"]);
    expect(t.blocks[2]).toEqual({
      kind: "usage",
      input: 120,
      output: 34,
      reasoning: 8,
      cacheRead: 16,
      cacheWrite: 0,
    });
  });

  it("reconstructs an unpriced usage tail with no cost key", () => {
    const msgs: HistoryMessage[] = [
      {
        role: "assistant",
        parts: [{ type: "text", text: "hi" }],
        usage: { input: 10, output: 2, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
      },
    ];
    const t = historyToThread(msgs);
    const usage = t.blocks.find((b) => b.kind === "usage");
    expect(usage).toBeDefined();
    expect(usage).not.toHaveProperty("cost");
  });
});
