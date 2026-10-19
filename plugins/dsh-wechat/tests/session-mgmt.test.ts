/**
 * Session-management fixes:
 * - listSessions() filters archived sessions (GUI "archive" hides them).
 * - mintSessionId() uses the GUI's `session-<uuid>` format.
 * - `/session new` reuses a blank session in the current cwd (GUI's
 *   "reuse-or-create its blank session") instead of always creating.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const sendTextMessage = vi.fn().mockResolvedValue(undefined);
const sendMediaMessage = vi.fn().mockResolvedValue(undefined);

vi.mock("../src/weixin/send.js", () => ({
  sendTextMessage: (...args: unknown[]) => sendTextMessage(...args),
  sendMediaMessage: (...args: unknown[]) => sendMediaMessage(...args),
  splitText: (text: string, maxLen: number) =>
    text.length <= maxLen ? [text] : [text.slice(0, maxLen), text.slice(maxLen)],
}));

import { WeChatDSHBridge } from "../src/bridge/bridge.js";
import { DshOps } from "../src/dsh/ops.js";
import { mintSessionId } from "../src/dsh/sessions.js";
import { defaultConfig } from "../src/config.js";
import { MessageType } from "../src/weixin/types.js";

function makeMockAgent(id: string) {
  const received: Array<{ content: unknown; source: unknown; id?: string }> = [];
  return {
    agent: {
      id,
      status: "idle",
      options: { provider: "deepseek", model: "deepseek-chat" },
      followup: (m: { content: unknown; source: unknown; id?: string }) => received.push(m),
      steer: () => {},
      cancel: () => {},
      whenIdle: async () => {},
    },
    received,
  };
}

function makeBridge(agent: { agent: unknown; received: unknown[] }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-wx-sess-"));
  const agentsService = {
    create: async () => agent,
    resume: async () => agent,
    get: (id: string) => (id === agent.agent.id ? agent.agent : undefined),
    list: () => [agent.agent],
  };
  const ctx = {
    get: (name: string) => (name === "agents" ? agentsService : undefined),
    on: () => () => {},
  };
  const cfg = defaultConfig();
  cfg.storageDir = dir;
  const bridge = new WeChatDSHBridge(ctx, cfg);
  (bridge as unknown as { token: unknown }).token = { baseUrl: "https://gw", token: "t", accountId: "b1", userId: "u", savedAt: "" };
  return bridge;
}

describe("mintSessionId uses the GUI session id format", () => {
  it("produces `session-<uuid>` ids", () => {
    const id = mintSessionId();
    expect(id).toMatch(/^session-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(id).not.toMatch(/^wx-/);
    // Unique across calls.
    expect(mintSessionId()).not.toBe(id);
  });
});

describe("listSessions filters archived sessions", () => {
  function makeOps(
    archived: string[],
    sessions: unknown[],
    listEvents: () => Promise<Array<{ type: string; time: number }>> = async () => [],
  ) {
    const ctx = {
      get: (name: string) => {
        if (name === "sessionQuery") {
          return { listSessions: async () => sessions, readTitle: async () => undefined, listEvents };
        }
        if (name === "workspaceRegistry") {
          return { archivedSessionIds: archived };
        }
        return undefined;
      },
      on: () => () => {},
    };
    return new DshOps(ctx as never);
  }

  it("drops archived sessions and keeps the rest", async () => {
    const ops = makeOps(
      ["archived-1"],
      [
        { header: { id: "s-1", createdAt: 1, cwd: "C:\\w" }, live: false, persisted: true },
        { header: { id: "archived-1", createdAt: 2, cwd: "C:\\w" }, live: false, persisted: true },
        { header: { id: "sub-1", createdAt: 3, cwd: "C:\\w", origin: "subagent" }, live: false, persisted: true },
      ],
    );
    const result = await ops.listSessions();
    expect(result.map((r) => r.header.id)).toEqual(["s-1"]);
  });

  it("inspectSessionActivity reports the last user/message time", async () => {
    const ops = makeOps([], [], async () => [
      { type: "assistant/message", time: 1 },
      { type: "user/message", time: 42 },
      { type: "assistant/message", time: 50 },
    ]);
    await expect(ops.inspectSessionActivity("s-1")).resolves.toEqual({ ok: true, lastUserMessageTime: 42 });
  });

  it("inspectSessionActivity treats an empty readable log as blank, not corrupt", async () => {
    const ops = makeOps([], []);
    await expect(ops.inspectSessionActivity("s-1")).resolves.toEqual({ ok: true });
  });

  it("inspectSessionActivity returns ok:false when listEvents throws", async () => {
    const ops = makeOps([], [], async () => {
      throw new Error("stored session failed validation");
    });
    await expect(ops.inspectSessionActivity("s-1")).resolves.toEqual({
      ok: false,
      error: "stored session failed validation",
    });
  });

  it("inspectSessionActivity skips listEvents for a large on-disk session", async () => {
    const require = createRequire(import.meta.url);
    const slog = require("../src/dsh/session-log.cjs") as {
      projectKey: (cwd: string) => string;
      clearSessionLogCache: () => void;
    };
    slog.clearSessionLogCache();
    const dshHome = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-home-snew-"));
    const previous = process.env.DSH_HOME;
    process.env.DSH_HOME = dshHome;
    try {
      const cwd = "C:\\work";
      const sessionId = "s-fat";
      const dir = path.join(dshHome, "sessions", slog.projectKey(cwd), encodeURIComponent(sessionId));
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "session.jsonl.zstd"), Buffer.alloc(2048, 1));
      const listEvents = vi.fn(async () => {
        throw new Error("listEvents should not run for a large used session");
      });
      const ops = makeOps([], [], listEvents);
      await expect(
        ops.inspectSessionActivity(sessionId, cwd, { version: 0, id: sessionId, createdAt: 1, cwd }),
      ).resolves.toEqual({ ok: true, lastUserMessageTime: 1 });
      expect(listEvents).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env.DSH_HOME;
      else process.env.DSH_HOME = previous;
      slog.clearSessionLogCache();
    }
  });

  it("keeps everything when nothing is archived", async () => {
    const ops = makeOps(
      [],
      [
        { header: { id: "s-1", createdAt: 1, cwd: "C:\\w" }, live: false, persisted: true },
        { header: { id: "s-2", createdAt: 2, cwd: "C:\\w" }, live: false, persisted: true },
      ],
    );
    const result = await ops.listSessions();
    expect(result.map((r) => r.header.id)).toEqual(["s-1", "s-2"]);
  });
});

describe("/session new reuses a blank session", () => {
  let bridge: WeChatDSHBridge;
  let mock: ReturnType<typeof makeMockAgent>;

  beforeEach(() => {
    vi.clearAllMocks();
    mock = makeMockAgent("session-aaaaaaaa-0000-4000-8000-000000000000");
    bridge = makeBridge(mock);
  });

  async function setupWithSessions(
    sessions: Array<{ id: string; createdAt: number; cwd?: string }>,
    userActivity?: (id: string) => number | undefined,
    unreadable?: (id: string) => boolean,
  ) {
    const anyBridge = bridge as unknown as {
      state: {
        ensureUser(u: string, c: string): { userId: string; cwd: string; sessionId: string; silent: boolean };
        update(u: string, p: unknown): void;
        getUser(u: string): { userId: string; cwd: string; sessionId: string; silent: boolean };
      };
      ops: {
        listSessions(): Promise<Array<{ header: { id: string; createdAt: number; cwd?: string } }>>;
        lastUserMessageTime(id: string): Promise<number | undefined>;
        inspectSessionActivity(id: string): Promise<
          { ok: true; lastUserMessageTime?: number } | { ok: false; error: string }
        >;
      };
      handleSessionCommand(u: string, cmd: { kind: "new" }): Promise<void>;
    };
    const activity = userActivity ?? (() => undefined);
    const isUnreadable = unreadable ?? (() => false);
    anyBridge.ops.listSessions = async () =>
      sessions.map((s) => ({
        header: { id: s.id, createdAt: s.createdAt, ...(s.cwd ? { cwd: s.cwd } : {}) },
      }));
    anyBridge.ops.lastUserMessageTime = async (id: string) => activity(id);
    anyBridge.ops.inspectSessionActivity = async (id: string) => {
      if (isUnreadable(id)) return { ok: false, error: "corrupt" };
      const t = activity(id);
      return t === undefined ? { ok: true } : { ok: true, lastUserMessageTime: t };
    };
    const user = anyBridge.state.ensureUser("u1", "C:\\work");
    (user as { sessionId: string }).sessionId = "";
    return anyBridge;
  }

  it("reuses the newest blank session in the cwd instead of creating", async () => {
    const anyBridge = await setupWithSessions(
      [
        { id: "blank-old", createdAt: 100, cwd: "C:\\work" },
        { id: "blank-new", createdAt: 200, cwd: "C:\\work" },
        { id: "used", createdAt: 300, cwd: "C:\\work" },
        { id: "other-cwd", createdAt: 400, cwd: "D:\\other" },
      ],
      (id) => (id === "used" ? 999 : undefined), // only "used" has activity
    );
    await anyBridge.handleSessionCommand("u1", { kind: "new" });
    const user = anyBridge.state.getUser("u1");
    expect(user.sessionId).toBe("blank-new"); // newest blank
    expect(sendTextMessage).toHaveBeenCalledWith(
      "u1",
      expect.stringContaining("已复用空白会话"),
      expect.anything(),
    );
  });

  it("keeps the current session when it is already blank", async () => {
    const anyBridge = await setupWithSessions([
      { id: "blank-old", createdAt: 100, cwd: "C:\\work" },
    ]);
    const user = anyBridge.state.getUser("u1");
    user.sessionId = "current-blank";
    await anyBridge.handleSessionCommand("u1", { kind: "new" });
    expect(user.sessionId).toBe("current-blank");
    expect(sendTextMessage).toHaveBeenCalledWith(
      "u1",
      expect.stringContaining("已在空白会话"),
      expect.anything(),
    );
  });

  it("creates a fresh session when no blank exists", async () => {
    const anyBridge = await setupWithSessions(
      [{ id: "used", createdAt: 100, cwd: "C:\\work" }],
      () => 999,
    );
    const user = anyBridge.state.getUser("u1");
    user.sessionId = "";
    // Force minted session: the mock create returns the fixed agent, and
    // ensure() writes the minted id into user.sessionId.
    const before = user.sessionId;
    await anyBridge.handleSessionCommand("u1", { kind: "new" });
    expect(user.sessionId).not.toBe(before);
    expect(user.sessionId).toMatch(/^session-/);
    expect(sendTextMessage).toHaveBeenCalledWith(
      "u1",
      expect.stringContaining("已创建新会话"),
      expect.anything(),
    );
  });

  it("creates a fresh session when the current binding is unreadable", async () => {
    const anyBridge = await setupWithSessions(
      [{ id: "session-corrupt", createdAt: 100, cwd: "C:\\work" }],
      () => undefined,
      (id) => id === "session-corrupt",
    );
    const user = anyBridge.state.getUser("u1");
    user.sessionId = "session-corrupt";
    await anyBridge.handleSessionCommand("u1", { kind: "new" });
    expect(user.sessionId).not.toBe("session-corrupt");
    expect(user.sessionId).toMatch(/^session-/);
    expect(sendTextMessage).toHaveBeenCalledWith(
      "u1",
      expect.stringContaining("原会话 session-corrupt 已损坏"),
      expect.anything(),
    );
    expect(sendTextMessage).toHaveBeenCalledWith(
      "u1",
      expect.stringContaining("已新建会话"),
      expect.anything(),
    );
  });

  it("does not reuse an unreadable candidate as a blank session", async () => {
    const anyBridge = await setupWithSessions(
      [
        { id: "corrupt-blank", createdAt: 300, cwd: "C:\\work" },
        { id: "real-blank", createdAt: 200, cwd: "C:\\work" },
        { id: "used", createdAt: 100, cwd: "C:\\work" },
      ],
      (id) => (id === "used" ? 999 : undefined),
      (id) => id === "corrupt-blank",
    );
    await anyBridge.handleSessionCommand("u1", { kind: "new" });
    const user = anyBridge.state.getUser("u1");
    expect(user.sessionId).toBe("real-blank");
    expect(sendTextMessage).toHaveBeenCalledWith(
      "u1",
      expect.stringContaining("已复用空白会话"),
      expect.anything(),
    );
  });

  it("reuses a blank session whose recorded cwd is spelled differently", async () => {
    // Real directory: the host's canon is `fs.promises.realpath`, so a
    // respelled cwd (trailing separator / `.` segment) is the same
    // directory and its blank session must be reused, not duplicated.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-wx-blank-"));
    const anyBridge = await setupWithSessions([
      { id: "blank-respelled", createdAt: 200, cwd: `${dir}${path.sep}` },
      { id: "other-cwd", createdAt: 400, cwd: path.join(dir, "..") },
    ]);
    // The user's cwd uses the other spelling of the same directory.
    anyBridge.state.update("u1", { cwd: path.join(dir, ".") });
    await anyBridge.handleSessionCommand("u1", { kind: "new" });
    const user = anyBridge.state.getUser("u1");
    expect(user.sessionId).toBe("blank-respelled");
    expect(sendTextMessage).toHaveBeenCalledWith(
      "u1",
      expect.stringContaining("已复用空白会话"),
      expect.anything(),
    );
  });

  it("does not reuse a blank session from a genuinely different cwd", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-wx-blank-"));
    const other = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-wx-blank-"));
    const anyBridge = await setupWithSessions([
      { id: "blank-elsewhere", createdAt: 200, cwd: other },
    ]);
    anyBridge.state.update("u1", { cwd: dir });
    await anyBridge.handleSessionCommand("u1", { kind: "new" });
    const user = anyBridge.state.getUser("u1");
    // Nothing reusable in THIS directory → a fresh session is minted.
    expect(user.sessionId).not.toBe("blank-elsewhere");
    expect(user.sessionId).toMatch(/^session-/);
  });
});

describe("/workspace list counts exclude archived sessions", () => {
  let bridge: WeChatDSHBridge;
  let mock: ReturnType<typeof makeMockAgent>;

  beforeEach(() => {
    vi.clearAllMocks();
    mock = makeMockAgent("session-aaaaaaaa-0000-4000-8000-000000000000");
    bridge = makeBridge(mock);
  });

  it("shows visible session counts per workspace", async () => {
    const anyBridge = bridge as unknown as {
      state: { ensureUser(u: string, c: string): { userId: string; cwd: string; sessionId: string; silent: boolean } };
      ops: {
        listWorkspaces(): Array<{ id: string; path: string; title: string; sessionIds: string[] }>;
        archivedSessionIds(): string[];
      };
      handleWorkspaceCommand(u: string, cmd: { kind: "list" }): Promise<void>;
    };
    anyBridge.ops.listWorkspaces = () => [
      { id: "w1", path: "C:\\work", title: "work", sessionIds: ["s-1", "s-2", "s-archived"] },
      { id: "w2", path: "D:\\other", title: "other", sessionIds: ["s-3"] },
    ];
    anyBridge.ops.archivedSessionIds = () => ["s-archived"];
    anyBridge.state.ensureUser("u1", "C:\\work");
    await anyBridge.handleWorkspaceCommand("u1", { kind: "list" });
    expect(sendTextMessage).toHaveBeenCalledWith(
      "u1",
      expect.stringContaining("C:\\work（2 会话）"),
      expect.anything(),
    );
    expect(sendTextMessage).toHaveBeenCalledWith(
      "u1",
      expect.stringContaining("D:\\other（1 会话）"),
      expect.anything(),
    );
  });
});

describe("/workspace switch reports the restored session", () => {
  let bridge: WeChatDSHBridge;
  let mock: ReturnType<typeof makeMockAgent>;

  beforeEach(() => {
    vi.clearAllMocks();
    mock = makeMockAgent("session-aaaaaaaa-0000-4000-8000-000000000000");
    bridge = makeBridge(mock);
  });

  function setupWorkspaces(
    workspaces: Array<{ id: string; path: string; title: string; sessionIds: string[] }>,
    archived: string[],
    titles: Record<string, string | undefined>,
  ) {
    const anyBridge = bridge as unknown as {
      state: {
        ensureUser(u: string, c: string): { userId: string; cwd: string; sessionId: string; silent: boolean };
        getUser(u: string): { userId: string; cwd: string; sessionId: string };
      };
      ops: {
        listWorkspaces(): Array<{ id: string; path: string; title: string; sessionIds: string[] }>;
        archivedSessionIds(): string[];
        readSessionTitle(id: string): Promise<string | undefined>;
      };
      handleWorkspaceCommand(u: string, cmd: { kind: "switch"; target: string }): Promise<void>;
    };
    anyBridge.ops.listWorkspaces = () => workspaces;
    anyBridge.ops.archivedSessionIds = () => archived;
    anyBridge.ops.readSessionTitle = async (id: string) => titles[id];
    anyBridge.state.ensureUser("u1", "C:\\work");
    return anyBridge;
  }

  it("shows restored session name and full id", async () => {
    const anyBridge = setupWorkspaces(
      [{ id: "w1", path: "C:\\work", title: "work", sessionIds: ["session-visible-1"] }],
      [],
      { "session-visible-1": "修切换回显" },
    );
    await anyBridge.handleWorkspaceCommand("u1", { kind: "switch", target: "1" });
    const user = anyBridge.state.getUser("u1");
    expect(user.sessionId).toBe("session-visible-1");
    const body = String(sendTextMessage.mock.calls[0]?.[1]);
    expect(body).toContain("已切换到工作区: work — C:\\work");
    expect(body).toContain("已恢复会话: 修切换回显（session-visible-1）");
  });

  it("skips archived sessions and restores the next visible one", async () => {
    const anyBridge = setupWorkspaces(
      [{ id: "w1", path: "C:\\work", title: "work", sessionIds: ["s-archived", "s-visible"] }],
      ["s-archived"],
      { "s-visible": "可见会话" },
    );
    await anyBridge.handleWorkspaceCommand("u1", { kind: "switch", target: "1" });
    const user = anyBridge.state.getUser("u1");
    expect(user.sessionId).toBe("s-visible");
    const body = String(sendTextMessage.mock.calls[0]?.[1]);
    expect(body).toContain("已恢复会话: 可见会话（s-visible）");
    expect(body).not.toContain("s-archived");
  });

  it("says no session when the workspace has none visible", async () => {
    const anyBridge = setupWorkspaces(
      [{ id: "w1", path: "C:\\work", title: "work", sessionIds: ["s-archived"] }],
      ["s-archived"],
      {},
    );
    await anyBridge.handleWorkspaceCommand("u1", { kind: "switch", target: "1" });
    const user = anyBridge.state.getUser("u1");
    expect(user.sessionId).toBe("");
    const body = String(sendTextMessage.mock.calls[0]?.[1]);
    expect(body).toContain("已切换到工作区: work — C:\\work");
    expect(body).toContain("该工作区暂无会话，发送消息将创建");
  });
});

describe("/session list windowing", () => {
  let bridge: WeChatDSHBridge;
  let mock: ReturnType<typeof makeMockAgent>;

  beforeEach(() => {
    vi.clearAllMocks();
    mock = makeMockAgent("session-aaaaaaaa-0000-4000-8000-000000000000");
    bridge = makeBridge(mock);
  });

  type ListCmd = { kind: "list"; scope?: "current"; limit?: number; all?: boolean };

  function setupSessions(count: number, cwd = "C:\\work") {
    const anyBridge = bridge as unknown as {
      state: {
        ensureUser(u: string, c: string): { userId: string; cwd: string; sessionId: string };
        update(u: string, p: unknown): void;
        getUser(u: string): { userId: string; cwd: string; sessionId: string };
      };
      ops: {
        listSessions(): Promise<Array<{ header: { id: string; createdAt: number; cwd?: string } }>>;
        lastUserMessageTime(id: string, cwd?: string, header?: unknown): Promise<number | undefined>;
        readSessionListFacts(id: string, cwd?: string, header?: unknown): Promise<unknown>;
        listPresets(): Promise<Array<{ id: string; name?: string }>>;
        readSessionTitle(id: string): Promise<string | undefined>;
        inspectSessionActivity(id: string): Promise<{ ok: true; lastUserMessageTime?: number }>;
      };
      handleSessionCommand(u: string, cmd: ListCmd): Promise<void>;
    };
    const sessions = Array.from({ length: count }, (_, i) => ({
      // newest first by createdAt so the recency sort is deterministic
      header: { id: `s-${String(i + 1).padStart(2, "0")}`, createdAt: 1000 - i, cwd },
    }));
    anyBridge.ops.listSessions = async () => sessions;
    anyBridge.ops.lastUserMessageTime = async () => undefined;
    anyBridge.ops.readSessionListFacts = async () => ({});
    anyBridge.ops.listPresets = async () => [];
    anyBridge.ops.readSessionTitle = async (id: string) => id;
    anyBridge.ops.inspectSessionActivity = async () => ({ ok: true });
    const user = anyBridge.state.ensureUser("u1", cwd);
    (user as { sessionId: string }).sessionId = "";
    return { anyBridge, user };
  }

  function renderedRows(text: string): string[] {
    return text.split("\n").filter((l) => /^\d+\. /.test(l));
  }

  it("shows 20 rows plus a 看更多 hint by default", async () => {
    const { anyBridge } = setupSessions(25);
    await anyBridge.handleSessionCommand("u1", { kind: "list" });
    const body = String(sendTextMessage.mock.calls[0]?.[1]);
    expect(renderedRows(body)).toHaveLength(20);
    expect(body).toContain("显示 20/25，看更多: /s list all（或 /s list <数量>）");
  });

  it("shows exactly the requested count without a hint", async () => {
    const { anyBridge } = setupSessions(25);
    await anyBridge.handleSessionCommand("u1", { kind: "list", limit: 25 });
    const body = String(sendTextMessage.mock.calls[0]?.[1]);
    expect(renderedRows(body)).toHaveLength(25);
    expect(body).not.toContain("看更多");
  });

  it("shows every row with all and no hint", async () => {
    const { anyBridge } = setupSessions(25);
    await anyBridge.handleSessionCommand("u1", { kind: "list", all: true });
    const body = String(sendTextMessage.mock.calls[0]?.[1]);
    expect(renderedRows(body)).toHaveLength(25);
    expect(body).not.toContain("看更多");
  });

  it("omits the hint when the window covers the whole list", async () => {
    const { anyBridge } = setupSessions(20);
    await anyBridge.handleSessionCommand("u1", { kind: "list" });
    const body = String(sendTextMessage.mock.calls[0]?.[1]);
    expect(renderedRows(body)).toHaveLength(20);
    expect(body).not.toContain("看更多");
  });

  it("keeps the switch snapshot at the full list, so /s switch 25 still works", async () => {
    const { anyBridge, user } = setupSessions(25);
    await anyBridge.handleSessionCommand("u1", { kind: "list" });
    expect(renderedRows(String(sendTextMessage.mock.calls[0]?.[1]))).toHaveLength(20);
    await anyBridge.handleSessionCommand("u1", { kind: "switch", index: 25 });
    // Row 25 was never displayed, but the number resolves against the full
    // recency-ordered list (the documented behaviour).
    expect(user.sessionId).toBe("s-25");
  });

  it("advertises the scoped hint form for list current", async () => {
    const { anyBridge } = setupSessions(25);
    await anyBridge.handleSessionCommand("u1", { kind: "list", scope: "current" });
    const body = String(sendTextMessage.mock.calls[0]?.[1]);
    expect(renderedRows(body)).toHaveLength(20);
    expect(body).toContain("看更多: /s list current all（或 /s list current <数量>）");
  });
});

describe("/s list current matches a canonically equal cwd", () => {
  let bridge: WeChatDSHBridge;
  let mock: ReturnType<typeof makeMockAgent>;

  beforeEach(() => {
    vi.clearAllMocks();
    mock = makeMockAgent("session-aaaaaaaa-0000-4000-8000-000000000000");
    bridge = makeBridge(mock);
  });

  function setup(cwd: string, sessionCwds: string[]) {
    const anyBridge = bridge as unknown as {
      state: {
        ensureUser(u: string, c: string): { userId: string; cwd: string; sessionId: string };
        update(u: string, p: unknown): void;
      };
      ops: {
        listSessions(): Promise<Array<{ header: { id: string; createdAt: number; cwd?: string } }>>;
        lastUserMessageTime(id: string, cwd?: string, header?: unknown): Promise<number | undefined>;
        readSessionListFacts(id: string, cwd?: string, header?: unknown): Promise<unknown>;
        listPresets(): Promise<Array<{ id: string; name?: string }>>;
        readSessionTitle(id: string): Promise<string | undefined>;
      };
      handleSessionCommand(
        u: string,
        cmd: { kind: "list"; scope?: "current"; limit?: number; all?: boolean },
      ): Promise<void>;
    };
    anyBridge.ops.listSessions = async () =>
      sessionCwds.map((c, i) => ({ header: { id: `c-${i}`, createdAt: 100 - i, cwd: c } }));
    anyBridge.ops.lastUserMessageTime = async () => undefined;
    anyBridge.ops.readSessionListFacts = async () => ({});
    anyBridge.ops.listPresets = async () => [];
    anyBridge.ops.readSessionTitle = async (id: string) => id;
    const user = anyBridge.state.ensureUser("u1", cwd);
    (user as { sessionId: string }).sessionId = "";
    return anyBridge;
  }

  function renderedRows(text: string): string[] {
    return text.split("\n").filter((l) => /^\d+\. /.test(l));
  }

  it("matches through a trailing separator, mixed separators, and dot segments", async () => {
    // The host's realpathNormalize folds all of these to one directory, so
    // `/s list current` must agree with the workspace grouping.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-wx-cwd-"));
    fs.mkdirSync(path.join(dir, "sub"), { recursive: true });
    const anyBridge = setup(path.join(dir, "."), [dir, path.join(dir, "sub", ".."), "C:\\elsewhere"]);
    await anyBridge.handleSessionCommand("u1", { kind: "list", scope: "current" });
    const body = String(sendTextMessage.mock.calls[0]?.[1]);
    expect(renderedRows(body)).toHaveLength(2);
  });

  it("still excludes a genuinely different cwd", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-wx-cwd-"));
    const anyBridge = setup(dir, ["C:\\elsewhere"]);
    await anyBridge.handleSessionCommand("u1", { kind: "list", scope: "current" });
    expect(String(sendTextMessage.mock.calls[0]?.[1])).toContain("暂无会话");
  });

  it("excludes sessions with no recorded cwd", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-wx-cwd-"));
    const anyBridge = setup(dir, [dir, "C:\\elsewhere"]);
    // Second session's header carries no cwd at all.
    anyBridge.ops.listSessions = async () => [
      { header: { id: "has-cwd", createdAt: 2, cwd: dir } },
      { header: { id: "no-cwd", createdAt: 1 } },
    ];
    await anyBridge.handleSessionCommand("u1", { kind: "list", scope: "current" });
    const body = String(sendTextMessage.mock.calls[0]?.[1]);
    expect(renderedRows(body)).toHaveLength(1);
    expect(body).toContain("has-cwd");
  });
});

describe("/workspace list windowing and ordering label", () => {
  let bridge: WeChatDSHBridge;
  let mock: ReturnType<typeof makeMockAgent>;

  beforeEach(() => {
    vi.clearAllMocks();
    mock = makeMockAgent("session-aaaaaaaa-0000-4000-8000-000000000000");
    bridge = makeBridge(mock);
  });

  function setup(count: number) {
    const anyBridge = bridge as unknown as {
      state: { ensureUser(u: string, c: string): { userId: string; cwd: string; sessionId: string } };
      ops: {
        listWorkspaces(): Array<{ id: string; path: string; title: string; sessionIds: string[] }>;
        archivedSessionIds(): string[];
      };
      handleWorkspaceCommand(
        u: string,
        cmd: { kind: "list"; limit?: number; all?: boolean },
      ): Promise<void>;
    };
    anyBridge.ops.listWorkspaces = () =>
      Array.from({ length: count }, (_, i) => ({
        id: `w-${i}`,
        path: `C:\\ws-${i}`,
        title: `ws-${i}`,
        sessionIds: [],
      }));
    anyBridge.ops.archivedSessionIds = () => [];
    anyBridge.state.ensureUser("u1", "C:\\ws-0");
    return anyBridge;
  }

  function renderedRows(text: string): string[] {
    return text.split("\n").filter((l) => /^\d+\. /.test(l));
  }

  it("labels the order as insertion order and windows to 20 by default", async () => {
    const anyBridge = setup(25);
    await anyBridge.handleWorkspaceCommand("u1", { kind: "list" });
    const body = String(sendTextMessage.mock.calls[0]?.[1]);
    expect(body).toContain("📂 工作区列表（按添加顺序，共 25 个）");
    expect(body).not.toContain("按最近使用排序");
    expect(renderedRows(body)).toHaveLength(20);
    expect(body).toContain("显示 20/25，看更多: /workspace list all（或 /workspace list <数量>）");
  });

  it("shows every workspace with all and no hint", async () => {
    const anyBridge = setup(25);
    await anyBridge.handleWorkspaceCommand("u1", { kind: "list", all: true });
    const body = String(sendTextMessage.mock.calls[0]?.[1]);
    expect(renderedRows(body)).toHaveLength(25);
    expect(body).not.toContain("看更多");
  });

  it("honours an explicit count", async () => {
    const anyBridge = setup(25);
    await anyBridge.handleWorkspaceCommand("u1", { kind: "list", limit: 22 });
    const body = String(sendTextMessage.mock.calls[0]?.[1]);
    expect(renderedRows(body)).toHaveLength(22);
    expect(body).toContain("显示 22/25");
  });

  it("marks the current workspace through the canonical-path rule", async () => {
    // Real directories: `fs.promises.realpath` is the host's canon, and a
    // fake Windows spelling would canonicalize differently on the Linux CI
    // runner (`path.resolve` has no backslash separator there).
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-wx-ws-"));
    const anyBridge = setup(3);
    anyBridge.ops.listWorkspaces = () => [
      { id: "w-0", path: dir, title: "ws-0", sessionIds: [] },
      { id: "w-1", path: path.join(dir, ".."), title: "ws-1", sessionIds: [] },
    ];
    const state = (bridge as unknown as {
      state: { update(u: string, p: unknown): void };
    }).state;
    // user.cwd spelled with a trailing separator still marks ws-0.
    state.update("u1", { cwd: `${dir}${path.sep}` });
    await anyBridge.handleWorkspaceCommand("u1", { kind: "list" });
    const body = String(sendTextMessage.mock.calls[0]?.[1]);
    const rows = body.split("\n").filter((l) => /^\d+\. /.test(l));
    expect(rows[0]).toContain("ws-0");
    expect(rows[0]).toContain("◀ 当前");
    expect(rows[1]).not.toContain("◀ 当前");
  });
});

describe("/session switch reports the session name", () => {
  let bridge: WeChatDSHBridge;
  let mock: ReturnType<typeof makeMockAgent>;

  beforeEach(() => {
    vi.clearAllMocks();
    mock = makeMockAgent("session-aaaaaaaa-0000-4000-8000-000000000000");
    bridge = makeBridge(mock);
  });

  it("includes title and full id in the switch reply", async () => {
    const anyBridge = bridge as unknown as {
      state: { ensureUser(u: string, c: string): { userId: string; cwd: string; sessionId: string; silent: boolean } };
      ops: {
        listSessions(): Promise<Array<{ header: { id: string; createdAt: number; cwd?: string } }>>;
        readSessionTitle(id: string): Promise<string | undefined>;
      };
      handleSessionCommand(u: string, cmd: { kind: "switch"; index: number }): Promise<void>;
    };
    anyBridge.ops.listSessions = async () => [
      { header: { id: "session-old", createdAt: 100, cwd: "C:\\work" } },
      { header: { id: "session-new", createdAt: 200, cwd: "C:\\work" } },
    ];
    anyBridge.ops.readSessionTitle = async (id: string) => (id === "session-new" ? "最新会话" : "旧会话");
    anyBridge.state.ensureUser("u1", "C:\\work");
    await anyBridge.handleSessionCommand("u1", { kind: "switch", index: 1 });
    const body = String(sendTextMessage.mock.calls[0]?.[1]);
    expect(body).toContain("已切换到会话 最新会话（session-new） — C:\\work");
    expect(body).toContain("Agent");
  });

  it("keeps the current scope when switching after list current", async () => {
    const anyBridge = bridge as unknown as {
      state: {
        ensureUser(u: string, c: string): { userId: string; cwd: string; sessionId: string; silent: boolean };
        getUser(u: string): { userId: string; cwd: string; sessionId: string };
      };
      ops: {
        listSessions(): Promise<Array<{ header: { id: string; createdAt: number; cwd?: string } }>>;
        lastUserMessageTime(id: string, cwd?: string, header?: unknown): Promise<number | undefined>;
        readSessionTitle(id: string): Promise<string | undefined>;
      };
      handleSessionCommand(
        u: string,
        cmd: { kind: "list"; scope?: "current" } | { kind: "switch"; index: number; scope?: "current" },
      ): Promise<void>;
    };
    anyBridge.ops.listSessions = async () => [
      { header: { id: "other-new", createdAt: 300, cwd: "D:\\other" } },
      { header: { id: "current-new", createdAt: 200, cwd: "C:\\work" } },
      { header: { id: "current-old", createdAt: 100, cwd: "C:\\work" } },
    ];
    anyBridge.ops.lastUserMessageTime = async () => undefined;
    anyBridge.ops.readSessionTitle = async (id: string) => id;
    const user = anyBridge.state.ensureUser("u1", "C:\\work");

    await anyBridge.handleSessionCommand("u1", { kind: "list", scope: "current" });
    await anyBridge.handleSessionCommand("u1", { kind: "switch", index: 1 });

    expect(user.sessionId).toBe("current-new");
    expect(user.cwd).toBe("C:\\work");
    expect(String(sendTextMessage.mock.calls[1]?.[1])).toContain("current-new");
  });
});

describe("DshOps pin outcomes map the host's own results", () => {
  function makePinOps(registry: unknown) {
    const ctx = {
      get: (name: string) => (name === "workspaceRegistry" ? registry : undefined),
      on: () => () => {},
    };
    return new DshOps(ctx as never);
  }

  function namedError(name: string): Error {
    const err = new Error(`boom: ${name}`);
    err.name = name;
    return err;
  }

  it("reports unavailable with no registry at all", async () => {
    const ops = makePinOps(undefined);
    await expect(ops.pinSession("s-1")).resolves.toBe("unavailable");
    await expect(ops.unpinSession("s-1")).resolves.toBe("unavailable");
    expect(ops.pinnedSessionIds()).toEqual([]);
  });

  it("reports unavailable when the host predates the pin API", async () => {
    const ops = makePinOps({ archivedSessionIds: [] });
    await expect(ops.pinSession("s-1")).resolves.toBe("unavailable");
    expect(ops.pinnedSessionIds()).toEqual([]);
  });

  it("returns ok and surfaces the host's pin set", async () => {
    const written: string[] = [];
    const ops = makePinOps({
      archivedSessionIds: [],
      pinnedSessionIds: ["s-9"],
      pinSession: async (id: string) => { written.push(id); },
      unpinSession: async (id: string) => { written.push(`-${id}`); },
    });
    await expect(ops.pinSession("s-1")).resolves.toBe("ok");
    await expect(ops.unpinSession("s-2")).resolves.toBe("ok");
    expect(written).toEqual(["s-1", "-s-2"]);
    expect(ops.pinnedSessionIds()).toEqual(["s-9"]);
  });

  it("distinguishes an archived rejection from an unknown session", async () => {
    const archivedOps = makePinOps({
      archivedSessionIds: ["s-1"],
      pinnedSessionIds: [],
      pinSession: async () => { throw namedError("WorkspaceArchivedSessionPinError"); },
      unpinSession: async () => {},
    });
    await expect(archivedOps.pinSession("s-1")).resolves.toBe("archived");

    const unknownOps = makePinOps({
      archivedSessionIds: [],
      pinnedSessionIds: [],
      pinSession: async () => { throw namedError("WorkspaceUnknownSessionError"); },
      unpinSession: async () => {},
    });
    await expect(unknownOps.pinSession("s-gone")).resolves.toBe("unknown");
  });

  it("reports failed for an unrecognised rejection instead of throwing", async () => {
    const ops = makePinOps({
      archivedSessionIds: [],
      pinnedSessionIds: [],
      pinSession: async () => { throw new Error("storage fault"); },
      unpinSession: async () => {},
    });
    await expect(ops.pinSession("s-1")).resolves.toBe("failed");
  });

  it("treats an unreadable pin set as no pins", () => {
    const ops = makePinOps({
      archivedSessionIds: [],
      get pinnedSessionIds(): string[] { throw new Error("registry not ready"); },
    });
    expect(ops.pinnedSessionIds()).toEqual([]);
  });

  it("reports pin support only when both write methods exist", () => {
    expect(makePinOps(undefined).supportsPin()).toBe(false);
    expect(makePinOps({ archivedSessionIds: [] }).supportsPin()).toBe(false);
    // A half-implemented host (pin but no unpin) is not usable for the
    // toggle pair, so it must report false rather than half-working.
    expect(makePinOps({
      archivedSessionIds: [],
      pinnedSessionIds: [],
      pinSession: async () => {},
    }).supportsPin()).toBe(false);
    expect(makePinOps({
      archivedSessionIds: [],
      pinnedSessionIds: [],
      pinSession: async () => {},
      unpinSession: async () => {},
    }).supportsPin()).toBe(true);
  });

  it("reports unknown for an empty session id without calling the host", async () => {
    const pinSession = vi.fn(async () => {});
    const ops = makePinOps({ archivedSessionIds: [], pinnedSessionIds: [], pinSession, unpinSession: async () => {} });
    await expect(ops.pinSession("")).resolves.toBe("unknown");
    expect(pinSession).not.toHaveBeenCalled();
  });
});

describe("/session pin and unpin", () => {
  let bridge: WeChatDSHBridge;
  let mock: ReturnType<typeof makeMockAgent>;

  beforeEach(() => {
    vi.clearAllMocks();
    mock = makeMockAgent("session-aaaaaaaa-0000-4000-8000-000000000000");
    bridge = makeBridge(mock);
  });

  type PinOutcome = "ok" | "archived" | "unknown" | "unavailable" | "failed";

  /**
   * Sessions are given distinct activity times so the recency order is
   * deterministic and DIFFERENT from the pin order — that difference is what
   * makes these tests discriminating.
   */
  function setup(
    sessions: Array<{ id: string; createdAt: number; activity?: number; cwd?: string }>,
    options: {
      pinned?: string[];
      archived?: string[];
      outcome?: PinOutcome;
      boundSessionId?: string;
      /** Simulate a host whose workspaceRegistry has no pin API at all. */
      supportsPin?: boolean;
    } = {},
  ) {
    const anyBridge = bridge as unknown as {
      state: {
        ensureUser(u: string, c: string): { userId: string; cwd: string; sessionId: string };
        update(u: string, p: unknown): void;
        getUser(u: string): { userId: string; cwd: string; sessionId: string };
      };
      ops: {
        listSessions(): Promise<Array<{ header: { id: string; createdAt: number; cwd?: string } }>>;
        lastUserMessageTime(id: string, cwd?: string, header?: unknown): Promise<number | undefined>;
        readSessionListFacts(id: string, cwd?: string, header?: unknown): Promise<unknown>;
        listPresets(): Promise<Array<{ id: string; name?: string }>>;
        readSessionTitle(id: string, cwd?: string): Promise<string | undefined>;
        supportsPin(): boolean;
        pinnedSessionIds(): readonly string[];
        archivedSessionIds(): readonly string[];
        pinSession(id: string): Promise<PinOutcome>;
        unpinSession(id: string): Promise<PinOutcome>;
      };
      handleSessionCommand(
        u: string,
        cmd:
          | { kind: "list"; scope?: "current"; limit?: number; all?: boolean }
          | { kind: "switch"; index: number }
          | { kind: "pin"; index?: number }
          | { kind: "unpin"; index?: number },
      ): Promise<void>;
    };
    const pinned = [...(options.pinned ?? [])];
    const archived = [...(options.archived ?? [])];
    const outcome = options.outcome ?? "ok";
    const pinCalls: string[] = [];
    const unpinCalls: string[] = [];
    anyBridge.ops.listSessions = async () =>
      sessions.map((s) => ({ header: { id: s.id, createdAt: s.createdAt, cwd: s.cwd ?? "C:\\work" } }));
    anyBridge.ops.lastUserMessageTime = async (id: string) =>
      sessions.find((s) => s.id === id)?.activity;
    anyBridge.ops.readSessionListFacts = async () => ({});
    anyBridge.ops.listPresets = async () => [];
    anyBridge.ops.readSessionTitle = async (id: string) => id;
    anyBridge.ops.supportsPin = () => options.supportsPin !== false;
    anyBridge.ops.pinnedSessionIds = () => pinned;
    anyBridge.ops.archivedSessionIds = () => archived;
    anyBridge.ops.pinSession = async (id: string) => {
      pinCalls.push(id);
      if (outcome === "ok") pinned.unshift(id);
      return outcome;
    };
    anyBridge.ops.unpinSession = async (id: string) => {
      unpinCalls.push(id);
      if (outcome === "ok") {
        const at = pinned.indexOf(id);
        if (at >= 0) pinned.splice(at, 1);
      }
      return outcome;
    };
    const user = anyBridge.state.ensureUser("u1", "C:\\work");
    user.sessionId = options.boundSessionId ?? "";
    return { anyBridge, user, pinned, pinCalls, unpinCalls };
  }

  function rows(text: string): string[] {
    return text.split("\n").filter((l) => /^\d+\. /.test(l));
  }

  function lastReply(): string {
    return String(sendTextMessage.mock.calls[sendTextMessage.mock.calls.length - 1]?.[1]);
  }

  // Activity: a-newest 300 > b 200 > c-oldest 100. `c-oldest` is pinned, so a
  // pure recency sort would put it LAST — every assertion below depends on the
  // pinned-first partition actually being applied.
  const THREE = [
    { id: "a-newest", createdAt: 1, activity: 300 },
    { id: "b-middle", createdAt: 2, activity: 200 },
    { id: "c-oldest", createdAt: 3, activity: 100 },
  ];

  it("sorts a pinned session ahead of a more recent unpinned one and marks it", async () => {
    const { anyBridge } = setup(THREE, { pinned: ["c-oldest"] });
    await anyBridge.handleSessionCommand("u1", { kind: "list" });
    const body = lastReply();
    const list = rows(body);
    expect(list).toHaveLength(3);
    expect(list[0]).toContain("c-oldest");
    expect(list[0]).toContain("📌");
    expect(list[1]).toContain("a-newest");
    expect(list[1]).not.toContain("📌");
    expect(list[2]).toContain("b-middle");
    expect(body).toContain("📌 置顶优先");
  });

  it("keeps plain recency order and the old header when nothing is pinned", async () => {
    const { anyBridge } = setup(THREE);
    await anyBridge.handleSessionCommand("u1", { kind: "list" });
    const body = lastReply();
    expect(rows(body).map((l) => l.replace(/^\d+\. /, "").split(" ")[0])).toEqual([
      "a-newest",
      "b-middle",
      "c-oldest",
    ]);
    expect(body).not.toContain("📌");
    expect(body).toContain("按最近活动排序");
  });

  it("numbers the pinned row 1, so /s switch 1 selects it rather than the newest", async () => {
    const { anyBridge, user } = setup(THREE, { pinned: ["c-oldest"] });
    await anyBridge.handleSessionCommand("u1", { kind: "list" });
    await anyBridge.handleSessionCommand("u1", { kind: "switch", index: 1 });
    expect(user.sessionId).toBe("c-oldest");
  });

  it("resolves /s pin <n> against the rows the user just saw", async () => {
    // Pinned-first order is [c-oldest, a-newest, b-middle], so row 2 is
    // a-newest — not what a recency-only list would show at row 2 (b-middle).
    const { anyBridge, pinCalls } = setup(THREE, { pinned: ["c-oldest"] });
    await anyBridge.handleSessionCommand("u1", { kind: "list" });
    await anyBridge.handleSessionCommand("u1", { kind: "pin", index: 2 });
    expect(pinCalls).toEqual(["a-newest"]);
    expect(lastReply()).toContain("已置顶会话");
    expect(lastReply()).toContain("a-newest");
  });

  it("acts on the bound session when no number is given", async () => {
    const { anyBridge, pinCalls } = setup(THREE, { boundSessionId: "b-middle" });
    await anyBridge.handleSessionCommand("u1", { kind: "pin" });
    expect(pinCalls).toEqual(["b-middle"]);
    expect(lastReply()).toContain("📌 已置顶会话");
  });

  it("unpins the bound session and names its full id", async () => {
    const { anyBridge, unpinCalls } = setup(THREE, {
      pinned: ["b-middle"],
      boundSessionId: "b-middle",
    });
    await anyBridge.handleSessionCommand("u1", { kind: "unpin" });
    expect(unpinCalls).toEqual(["b-middle"]);
    const body = lastReply();
    expect(body).toContain("已取消置顶会话");
    expect(body).toContain("b-middle");
  });

  it("does not rewrite the host set when the session is already pinned", async () => {
    const { anyBridge, pinCalls } = setup(THREE, {
      pinned: ["b-middle"],
      boundSessionId: "b-middle",
    });
    await anyBridge.handleSessionCommand("u1", { kind: "pin" });
    expect(pinCalls).toEqual([]);
    expect(lastReply()).toContain("已置顶");
  });

  it("refuses to pin an archived bound session", async () => {
    const { anyBridge, pinCalls } = setup(THREE, {
      archived: ["b-middle"],
      boundSessionId: "b-middle",
    });
    await anyBridge.handleSessionCommand("u1", { kind: "pin" });
    expect(pinCalls).toEqual([]);
    expect(lastReply()).toContain("已归档");
  });

  it("reports a host without the pin service instead of failing", async () => {
    const { anyBridge, pinCalls } = setup(THREE, {
      supportsPin: false,
      boundSessionId: "b-middle",
    });
    await anyBridge.handleSessionCommand("u1", { kind: "pin" });
    expect(pinCalls).toEqual([]);
    expect(lastReply()).toContain("未提供会话置顶服务");
  });

  it("does not claim 'not pinned' on a host without the pin service", async () => {
    // Without the supportsPin guard this would read an empty pin set and
    // answer "该会话未置顶", which is a wrong statement about the host.
    const { anyBridge, unpinCalls } = setup(THREE, {
      supportsPin: false,
      boundSessionId: "b-middle",
    });
    await anyBridge.handleSessionCommand("u1", { kind: "unpin" });
    expect(unpinCalls).toEqual([]);
    expect(lastReply()).toContain("未提供会话置顶服务");
    expect(lastReply()).not.toContain("未置顶");
  });

  it("maps an unknown-session rejection to a not-found reply", async () => {
    const { anyBridge } = setup(THREE, { outcome: "unknown", boundSessionId: "b-middle" });
    await anyBridge.handleSessionCommand("u1", { kind: "pin" });
    expect(lastReply()).toContain("找不到该会话");
  });

  it("rejects an out-of-range number without touching the host set", async () => {
    const { anyBridge, pinCalls } = setup(THREE);
    await anyBridge.handleSessionCommand("u1", { kind: "pin", index: 99 });
    expect(pinCalls).toEqual([]);
    expect(lastReply()).toContain("编号超出范围（1-3）");
  });

  it("tells the user to bind a session first when none is bound", async () => {
    const { anyBridge, pinCalls } = setup(THREE, { boundSessionId: "" });
    await anyBridge.handleSessionCommand("u1", { kind: "pin" });
    expect(pinCalls).toEqual([]);
    expect(lastReply()).toContain("当前没有绑定会话");
  });

  it("renders the list normally when the host exposes no pins", async () => {
    const { anyBridge } = setup(THREE);
    (anyBridge.ops as { pinnedSessionIds(): readonly string[] }).pinnedSessionIds = () => [];
    await anyBridge.handleSessionCommand("u1", { kind: "list" });
    expect(rows(lastReply())).toHaveLength(3);
    expect(lastReply()).not.toContain("📌");
  });

  it("keeps the post-pin snapshot aligned with the reordered rows", async () => {
    // After pinning a-newest the order is [a-newest, c-oldest, b-middle], so
    // `/s switch 2` must land on c-oldest.
    const { anyBridge, user } = setup(THREE, { pinned: ["c-oldest"] });
    await anyBridge.handleSessionCommand("u1", { kind: "list" });
    await anyBridge.handleSessionCommand("u1", { kind: "pin", index: 2 });
    await anyBridge.handleSessionCommand("u1", { kind: "switch", index: 2 });
    expect(user.sessionId).toBe("c-oldest");
  });
});
