import { describe, it, expect, vi, beforeEach } from "vitest";
import { ZeroWallClient } from "./ZeroWallClient";
import type { OpenCodeClient } from "./OpenCodeClient";
import type { AgentDefinition } from "../../shared/src/agents";
import type { AgentRole, RoleModelBinding } from "../../shared/src/models";

// Mock OpenCodeClient
const createMockOpenCodeClient = (): OpenCodeClient => ({
  connect: vi.fn().mockResolvedValue(undefined),
  close: vi.fn(),
  getStatus: vi.fn().mockReturnValue("ready"),
  onStatus: vi.fn().mockReturnValue(() => {}),
  onEvent: vi.fn().mockReturnValue(() => {}),
  createSession: vi.fn().mockResolvedValue("session-123"),
  listSessions: vi.fn().mockResolvedValue([]),
  deleteSession: vi.fn().mockResolvedValue(undefined),
  getMessages: vi.fn().mockResolvedValue([]),
  sendPrompt: vi.fn().mockResolvedValue(undefined),
  abortSession: vi.fn().mockResolvedValue(undefined),
  revert: vi.fn().mockResolvedValue(undefined),
  unrevert: vi.fn().mockResolvedValue(undefined),
  listSkills: vi.fn().mockResolvedValue([]),
  listAgents: vi.fn().mockResolvedValue([]),
  listCommands: vi.fn().mockResolvedValue([]),
  getDefaultModel: vi.fn().mockResolvedValue("anthropic/claude-opus-5"),
  setDefaultModel: vi.fn().mockResolvedValue(undefined),
  runShell: vi.fn().mockResolvedValue(undefined),
  runCommand: vi.fn().mockResolvedValue(undefined),
  listQuestions: vi.fn().mockResolvedValue([]),
  listPermissions: vi.fn().mockResolvedValue([]),
  answerQuestion: vi.fn().mockResolvedValue(undefined),
  rejectQuestion: vi.fn().mockResolvedValue(undefined),
  replyPermission: vi.fn().mockResolvedValue(undefined),
  listProviders: vi.fn().mockResolvedValue([
    { id: "anthropic", name: "Anthropic", models: [] },
    { id: "kimi", name: "Kimi", models: [] },
  ]),
} as any);

const createMockAgent = (id: string, role: AgentRole): AgentDefinition => ({
  id,
  version: 1,
  name: `${role} Agent`,
  role,
  description: `Test ${role} agent`,
  capabilities: {
    tools: ["*"],
    integrations: [],
    reasoning: "high",
  },
  permissions: {
    mode: "approve",
    allowedTools: ["*"],
    blockedTools: [],
  },
});

describe("ZeroWallClient", () => {
  let mockOpenCodeClient: OpenCodeClient;
  let agentDefinitions: Map<string, AgentDefinition>;
  let roleBindings: Record<AgentRole, RoleModelBinding>;

  beforeEach(() => {
    mockOpenCodeClient = createMockOpenCodeClient();
    agentDefinitions = new Map([
      ["general", createMockAgent("general", "general")],
      ["research", createMockAgent("research", "research")],
      ["code", createMockAgent("code", "code")],
      ["data", createMockAgent("data", "data")],
    ]);
    roleBindings = {
      general: { primary: "anthropic/claude-opus-5", fallback: "kimi/moonshot-v1", reasoning: "high" },
      research: { primary: "anthropic/claude-opus-5", fallback: "kimi/moonshot-v1", reasoning: "max" },
      code: { primary: "anthropic/claude-opus-5", fallback: "kimi/moonshot-v1", reasoning: "high" },
      data: { primary: "anthropic/claude-opus-5", fallback: "kimi/moonshot-v1", reasoning: "high" },
    };
  });

  describe("initialization", () => {
    it("should create ZeroWallClient with agents and bindings", () => {
      const client = new ZeroWallClient({
        opencode: mockOpenCodeClient,
        agents: agentDefinitions,
        roleBindings,
      });

      expect(client).toBeDefined();
    });

    it("should initialize with empty bindings when not provided", () => {
      const client = new ZeroWallClient({
        opencode: mockOpenCodeClient,
        agents: agentDefinitions,
      });

      expect(client).toBeDefined();
    });

    it("accepts the neutral transport option for the Gateway Web facade", async () => {
      const client = new ZeroWallClient({
        transport: mockOpenCodeClient,
        agents: agentDefinitions,
        roleBindings,
      });

      await client.connect();

      expect(mockOpenCodeClient.listProviders).toHaveBeenCalledOnce();
    });
  });

  describe("provider refresh", () => {
    it("should refresh available providers", async () => {
      const client = new ZeroWallClient({
        opencode: mockOpenCodeClient,
        agents: agentDefinitions,
        roleBindings,
      });

      await client.refreshProviders();

      expect(mockOpenCodeClient.listProviders).toHaveBeenCalled();
    });
  });

  describe("configure", () => {
    it("sends through the transport it was re-pointed at", async () => {
      const client = new ZeroWallClient({
        opencode: mockOpenCodeClient,
        agents: agentDefinitions,
        roleBindings,
      });
      // A reconnect builds a new OpenCodeClient and closes the old one.
      const reconnected = createMockOpenCodeClient();
      client.configure({ opencode: reconnected });

      await client.sendPrompt("session-123", "Hello");

      expect(reconnected.sendPrompt).toHaveBeenCalled();
      expect(mockOpenCodeClient.sendPrompt).not.toHaveBeenCalled();
    });

    it("keeps the handoff log and snapshots across a reconfigure", () => {
      const client = new ZeroWallClient({
        opencode: mockOpenCodeClient,
        agents: agentDefinitions,
        roleBindings,
      });
      client.recordTurn("session-123", "research", "anthropic/claude-opus-5");

      client.configure({
        opencode: createMockOpenCodeClient(),
        agents: agentDefinitions,
        roleBindings,
        providers: ["anthropic"],
      });

      // The session is still open, so the next turn must not log a second
      // "user-selected" opening for it.
      expect(client.recordTurn("session-123", "research")).toBeUndefined();
      expect(client.getHandoffLog()).toHaveLength(1);
      expect(client.getSessionSnapshot("session-123")).toBeDefined();
    });
  });

  describe("AgentRuntime interface", () => {
    it("should forward connect to OpenCodeClient", async () => {
      const client = new ZeroWallClient({
        opencode: mockOpenCodeClient,
        agents: agentDefinitions,
        roleBindings,
      });

      await client.connect();

      expect(mockOpenCodeClient.listProviders).toHaveBeenCalled();
    });

    it("should forward createSession to OpenCodeClient", async () => {
      const client = new ZeroWallClient({
        opencode: mockOpenCodeClient,
        agents: agentDefinitions,
        roleBindings,
      });

      const sessionId = await client.createSession();

      expect(sessionId).toBe("session-123");
      expect(mockOpenCodeClient.createSession).toHaveBeenCalled();
    });

    it("should forward sendPrompt to OpenCodeClient", async () => {
      const client = new ZeroWallClient({
        opencode: mockOpenCodeClient,
        agents: agentDefinitions,
        roleBindings,
      });

      await client.sendPrompt("session-123", "Hello", "general", "anthropic/claude-opus-5");

      expect(mockOpenCodeClient.sendPrompt).toHaveBeenCalledWith(
        "session-123",
        "Hello",
        "general",
        "anthropic/claude-opus-5",
        undefined,
        undefined,
      );
    });

    it("should forward listSessions to OpenCodeClient", async () => {
      const client = new ZeroWallClient({
        opencode: mockOpenCodeClient,
        agents: agentDefinitions,
        roleBindings,
      });

      const sessions = await client.listSessions();

      expect(sessions).toEqual([]);
      expect(mockOpenCodeClient.listSessions).toHaveBeenCalled();
    });
  });

  describe("handoff logging", () => {
    const newClient = () =>
      new ZeroWallClient({
        opencode: mockOpenCodeClient,
        agents: agentDefinitions,
        roleBindings,
      });

    it("should return empty handoff log initially", () => {
      const client = newClient();

      const log = client.getHandoffLog();

      expect(log).toEqual([]);
    });

    it("logs a user-initiated handoff on a session's first turn", () => {
      const client = newClient();

      const handoff = client.recordTurn("session-123", "research", "anthropic/claude-opus-5");

      expect(handoff).toMatchObject({
        fromAgent: null,
        toAgent: "research",
        sessionId: "session-123",
        reason: "user-selected",
        model: "anthropic/claude-opus-5",
      });
      expect(client.getHandoffLog()).toHaveLength(1);
    });

    it("logs nothing when a later turn stays with the same agent", () => {
      const client = newClient();

      client.recordTurn("session-123", "research", "anthropic/claude-opus-5");
      const repeat = client.recordTurn("session-123", "research", "anthropic/claude-opus-5");

      expect(repeat).toBeUndefined();
      expect(client.getHandoffLog()).toHaveLength(1);
    });

    it("logs an agent → agent handoff when the role changes mid-session", () => {
      const client = newClient();

      client.recordTurn("session-123", "research", "anthropic/claude-opus-5");
      const handoff = client.recordTurn("session-123", "code", "anthropic/claude-sonnet-5");

      expect(handoff).toMatchObject({
        fromAgent: "research",
        toAgent: "code",
        sessionId: "session-123",
        reason: "role-routing",
        model: "anthropic/claude-sonnet-5",
      });
      expect(client.getHandoffLog().map((h) => h.toAgent)).toEqual(["research", "code"]);
    });

    it("keeps each session's handoff chain independent", () => {
      const client = newClient();

      client.recordTurn("session-a", "research", "anthropic/claude-opus-5");
      const handoff = client.recordTurn("session-b", "code", "anthropic/claude-sonnet-5");

      // session-b's first turn is still user-initiated — session-a's agent
      // must not leak in as the source.
      expect(handoff?.fromAgent).toBeNull();
    });

    it("falls back to the role binding when the caller sends no model", () => {
      const client = newClient();
      client.configure({ providers: ["anthropic"] });

      const handoff = client.recordTurn("session-123", "code");

      expect(handoff?.model).toBe("anthropic/claude-opus-5");
    });

    it("falls back to the binding's backup slot when the primary provider is gone", () => {
      const client = newClient();
      client.configure({ providers: ["kimi"] });

      const handoff = client.recordTurn("session-123", "code");

      expect(handoff?.model).toBe("kimi/moonshot-v1");
    });

    it("logs nothing for a role no loaded agent serves", () => {
      const client = new ZeroWallClient({
        opencode: mockOpenCodeClient,
        agents: new Map(),
        roleBindings,
      });

      expect(client.recordTurn("session-123", "research", "anthropic/claude-opus-5")).toBeUndefined();
      expect(client.getHandoffLog()).toEqual([]);
    });

    it("hands back a copy of the log, so callers cannot mutate it", () => {
      const client = newClient();
      client.recordTurn("session-123", "research", "anthropic/claude-opus-5");

      client.getHandoffLog().push({} as any);

      expect(client.getHandoffLog()).toHaveLength(1);
    });
  });

  describe("session snapshots", () => {
    const newClient = () =>
      new ZeroWallClient({
        opencode: mockOpenCodeClient,
        agents: agentDefinitions,
        roleBindings,
      });

    it("should return undefined for unknown session", () => {
      const client = newClient();

      const snapshot = client.getSessionSnapshot("unknown-session");

      expect(snapshot).toBeUndefined();
    });

    it("pins the snapshot on the first turn, with the role's reasoning effort", () => {
      const client = newClient();

      client.recordTurn("session-123", "research", "anthropic/claude-opus-5");

      expect(client.getSessionSnapshot("session-123")).toMatchObject({
        sessionId: "session-123",
        role: "research",
        model: "anthropic/claude-opus-5",
        reasoning: "max",
      });
    });

    it("keeps the creation-time snapshot when the role changes mid-session", () => {
      const client = newClient();

      client.recordTurn("session-123", "research", "anthropic/claude-opus-5");
      client.recordTurn("session-123", "code", "anthropic/claude-sonnet-5");

      // Reproducibility: the snapshot records what the session was created
      // with; the switch is captured in the handoff log instead.
      expect(client.getSessionSnapshot("session-123")).toMatchObject({
        role: "research",
        model: "anthropic/claude-opus-5",
      });
    });
  });
});
