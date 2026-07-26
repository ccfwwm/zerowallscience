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
    it("should return empty handoff log initially", () => {
      const client = new ZeroWallClient({
        opencode: mockOpenCodeClient,
        agents: agentDefinitions,
        roleBindings,
      });

      const log = client.getHandoffLog();

      expect(log).toEqual([]);
    });
  });

  describe("session snapshots", () => {
    it("should return undefined for unknown session", () => {
      const client = new ZeroWallClient({
        opencode: mockOpenCodeClient,
        agents: agentDefinitions,
        roleBindings,
      });

      const snapshot = client.getSessionSnapshot("unknown-session");

      expect(snapshot).toBeUndefined();
    });
  });
});
