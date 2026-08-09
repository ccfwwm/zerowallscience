import { describe, expect, it, vi } from "vitest";
import {
  AcpHostClient,
  type AcpHostInvoke,
  type SkillSnapshot,
} from "./AcpHostClient";
import type { PromptAttachment } from "./runtime";

const launchRequest = {
  engine: "codex" as const,
  profileId: "codex",
  sessionId: "conversation-1",
  model: "gpt-5.4",
  providerId: "cloud",
  baseUrl: "https://api.example.test/v1",
  projectRoot: "C:/science",
  profileFingerprint: "fp-1",
  credentialRef: "cloud",
};

function invokeMock(): AcpHostInvoke {
  return vi.fn(async (command: string) => {
    if (command === "acp_host_launch") {
      return {
        id: "agent-session-1",
        binding: {
          engine: "codex",
          profile: "codex",
          model: "gpt-5.4",
          provider: "cloud",
          variant: null,
          projectRoot: "C:/science",
          profileFingerprint: "fp-1",
          resolvedAt: "123",
        },
        resumable: false,
      };
    }
    if (command === "acp_host_config") {
      return {
        id: "agent-session-1",
        binding: {
          engine: "codex",
          profile: "codex",
          model: "gpt-5.5",
          provider: "cloud",
          variant: null,
          projectRoot: "C:/science",
          profileFingerprint: "fp-1",
          resolvedAt: "123",
        },
        resumable: false,
      };
    }
    if (command === "acp_host_events") {
      return [
        { type: "text.delta", data: { session_id: "agent-session-1", delta: "hi" } },
        {
          type: "permission.requested",
          data: {
            session_id: "agent-session-1",
            request_id: "permission-1",
            options: [{ id: "allow_once", label: "Allow once" }],
          },
        },
      ];
    }
    return undefined;
  }) as AcpHostInvoke;
}

describe("AcpHostClient", () => {
  it("treats an omitted MCP allow-list as all servers at the Host boundary", async () => {
    const invoke = vi.fn(async () => ({
      id: "conversation-1",
      binding: {
        engine: "codex",
        profile: "codex",
        model: "gpt-5.4",
        provider: "cloud",
        variant: null,
        projectRoot: "C:/science",
        profileFingerprint: "fp-1",
        resolvedAt: "now",
        mcpAllowList: ["*"],
      },
      resumable: true,
    })) as AcpHostInvoke;
    const client = new AcpHostClient({ invoke });

    const session = await client.launch(launchRequest);

    expect(session.binding.mcpAllowList).toEqual(["*"]);
  });

  it("preserves an explicit empty MCP allow-list when a legacy Host response omits it", async () => {
    const invoke = vi.fn(async () => ({
      id: "conversation-1",
      binding: {
        engine: "codex",
        profile: "codex",
        model: "gpt-5.4",
        provider: "cloud",
        variant: null,
        projectRoot: "C:/science",
        profileFingerprint: "fp-1",
        resolvedAt: "now",
      },
      resumable: true,
    })) as AcpHostInvoke;
    const client = new AcpHostClient({ invoke });

    const session = await client.launch({ ...launchRequest, mcpAllowList: [] });

    expect(session.binding.mcpAllowList).toEqual([]);
  });

  it("routes desktop provider maintenance through typed Host commands", async () => {
    const invoke = vi.fn(async () => undefined) as AcpHostInvoke;
    const client = new AcpHostClient({ invoke });

    await client.clearDefaultCustomModelContextLimits();
    await client.removeLegacyProviderEntries();
    await client.ensureCustomProvidersImageCapable();

    expect(invoke).toHaveBeenNthCalledWith(1, "acp_host_clear_default_custom_model_context_limits");
    expect(invoke).toHaveBeenNthCalledWith(2, "acp_host_remove_legacy_provider_entries");
    expect(invoke).toHaveBeenNthCalledWith(3, "acp_host_ensure_custom_providers_image_capable");
  });

  it("serializes normalized capability snapshots without non-canonical skill fields", async () => {
    const skills: SkillSnapshot[] = [
      {
        id: " citation-review ",
        version: " 1.0.0 ",
        scope: "conversation",
        sha256: " abc123 ",
        description: "must not cross the Host boundary",
        location: "C:/secret/path",
      } as SkillSnapshot,
      { id: "citation-review", version: "1.0.0", scope: "conversation", sha256: "abc123" },
      { id: "analysis", version: "2", scope: "project", sha256: "def456" },
    ];
    const invoke = vi.fn(async (_command: string, args?: Record<string, unknown>) => {
      const request = args?.request as Record<string, unknown>;
      return {
        id: "conversation-1",
        binding: {
          engine: request.engine,
          profile: request.profileId,
          model: request.model,
          provider: request.providerId,
          variant: request.variant ?? null,
          projectRoot: request.projectRoot,
          profileFingerprint: request.profileFingerprint,
          resolvedAt: "now",
          mcpAllowList: request.mcpAllowList,
          skillsSnapshot: request.skillsSnapshot,
        },
        resumable: true,
      };
    }) as AcpHostInvoke;
    const client = new AcpHostClient({ invoke });

    const session = await client.launch({
      ...launchRequest,
      mcpAllowList: [" papers ", "", "datasets", "papers"],
      skillsSnapshot: skills,
    });

    expect(invoke).toHaveBeenCalledWith("acp_host_launch", {
      request: expect.objectContaining({
        mcpAllowList: ["datasets", "papers"],
        skillsSnapshot: [
          { id: "analysis", version: "2", scope: "project", sha256: "def456" },
          { id: "citation-review", version: "1.0.0", scope: "conversation", sha256: "abc123" },
        ],
      }),
    });
    const serialized = JSON.stringify(vi.mocked(invoke).mock.calls);
    expect(serialized).not.toContain("description");
    expect(serialized).not.toContain("location");
    expect(session.binding.mcpAllowList).toEqual(["datasets", "papers"]);
    expect(session.binding.skillsSnapshot).toEqual([
      { id: "analysis", version: "2", scope: "project", sha256: "def456" },
      { id: "citation-review", version: "1.0.0", scope: "conversation", sha256: "abc123" },
    ]);
  });

  it("normalizes snake_case capability bindings and ignores order-only changes", async () => {
    const invoke = vi.fn(async (_command: string, args?: Record<string, unknown>) => {
      const request = args?.request as Record<string, unknown>;
      return {
        id: "conversation-1",
        binding: {
          engine: request.engine,
          profile: request.profileId,
          model: request.model,
          provider: request.providerId,
          variant: null,
          project_root: request.projectRoot,
          profile_fingerprint: request.profileFingerprint,
          resolved_at: "now",
          mcp_allow_list: ["papers", "datasets", "papers"],
          skills_snapshot: [
            { id: "review", version: "1", scope: "conversation", sha256: "bbb" },
            { id: "search", version: "1", scope: "project", sha256: "aaa" },
          ],
        },
        resumable: true,
      };
    }) as AcpHostInvoke;
    const client = new AcpHostClient({ invoke });
    const skills: SkillSnapshot[] = [
      { id: "search", version: "1", scope: "project", sha256: "aaa" },
      { id: "review", version: "1", scope: "conversation", sha256: "bbb" },
    ];

    await client.launch({
      ...launchRequest,
      mcpAllowList: ["datasets", "papers"],
      skillsSnapshot: skills,
    });
    await expect(client.launch({
      ...launchRequest,
      mcpAllowList: ["papers", "datasets", "papers"],
      skillsSnapshot: [...skills].reverse(),
    })).resolves.toMatchObject({ id: "conversation-1" });
  });

  it("rejects changed capability contents for the same session binding", async () => {
    const invoke = vi.fn(async (_command: string, args?: Record<string, unknown>) => {
      const request = args?.request as Record<string, unknown>;
      return {
        id: "conversation-1",
        binding: {
          engine: request.engine,
          profile: request.profileId,
          model: request.model,
          provider: request.providerId,
          variant: null,
          projectRoot: request.projectRoot,
          profileFingerprint: request.profileFingerprint,
          resolvedAt: "now",
          mcpAllowList: request.mcpAllowList,
          skillsSnapshot: request.skillsSnapshot,
        },
        resumable: true,
      };
    }) as AcpHostInvoke;
    const client = new AcpHostClient({ invoke });
    await client.launch({
      ...launchRequest,
      mcpAllowList: ["papers"],
      skillsSnapshot: [{ id: "review", version: "1", scope: "conversation", sha256: "aaa" }],
    });

    await expect(client.launch({
      ...launchRequest,
      mcpAllowList: ["datasets"],
      skillsSnapshot: [{ id: "review", version: "1", scope: "conversation", sha256: "aaa" }],
    })).rejects.toThrow("session binding conflicts on mcpAllowList");
    await expect(client.launch({
      ...launchRequest,
      mcpAllowList: ["papers"],
      skillsSnapshot: [{ id: "review", version: "1", scope: "conversation", sha256: "changed" }],
    })).rejects.toThrow("session binding conflicts on skillsSnapshot");
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it.each([
    { id: "", version: "1", scope: "conversation", sha256: "abc" },
    { id: "review", version: " ", scope: "conversation", sha256: "abc" },
    { id: "review", version: "1", scope: "session", sha256: "abc" },
    { id: "review", version: "1", scope: "conversation", sha256: " " },
  ])("rejects invalid skill snapshots before invoking the Host: %o", async (skill) => {
    const invoke = vi.fn() as AcpHostInvoke;
    const client = new AcpHostClient({ invoke });

    await expect(client.launch({
      ...launchRequest,
      skillsSnapshot: [skill as SkillSnapshot],
    })).rejects.toThrow(/skill snapshot/);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("uses typed Host commands for provider control without serializing secrets", async () => {
    const invoke = vi.fn(async (command: string, args?: Record<string, unknown>) => {
      if (command === "acp_host_list_providers") {
        return [{ id: "cloud", name: "Cloud", models: [{ id: "model", name: "Model" }] }];
      }
      if (command === "acp_host_get_default_model") return "cloud/model";
      return undefined;
    }) as AcpHostInvoke;
    const client = new AcpHostClient({ invoke });

    await expect(client.listProviders()).resolves.toEqual([
      { id: "cloud", name: "Cloud", models: [{ id: "model", name: "Model" }] },
    ]);
    await expect(client.getDefaultModel()).resolves.toBe("cloud/model");
    await client.setDefaultModel("cloud/model");
    await client.addCustomProvider("research", {
      name: "Research",
      npm: "@ai-sdk/openai-compatible",
      baseURL: "https://models.example.test/v1",
      models: ["model-a"],
      contexts: { "model-a": 131072 },
    });
    await client.removeCustomProvider("research");

    expect(invoke).toHaveBeenCalledWith("acp_host_list_providers");
    expect(invoke).toHaveBeenCalledWith("acp_host_get_default_model");
    expect(invoke).toHaveBeenCalledWith("acp_host_set_default_model", { model: "cloud/model" });
    expect(invoke).toHaveBeenCalledWith("acp_host_add_custom_provider", {
      request: {
        id: "research",
        name: "Research",
        npm: "@ai-sdk/openai-compatible",
        baseUrl: "https://models.example.test/v1",
        models: ["model-a"],
        contexts: { "model-a": 131072 },
      },
    });
    expect(invoke).toHaveBeenCalledWith("acp_host_remove_custom_provider", { providerId: "research" });
    expect(JSON.stringify(invoke.mock.calls)).not.toContain("apiKey");
  });

  it("uses typed Host commands for provider catalog metadata", async () => {
    const invoke = vi.fn(async (command: string) => {
      if (command === "acp_host_list_provider_catalog") {
        return { all: [{ id: "cloud", name: "Cloud", env: ["CLOUD_KEY"] }], connected: ["cloud"] };
      }
      if (command === "acp_host_list_custom_provider_ids") return ["research"];
      return undefined;
    }) as AcpHostInvoke;
    const client = new AcpHostClient({ invoke });

    await expect(client.listProviderCatalog()).resolves.toEqual({
      all: [{ id: "cloud", name: "Cloud", env: ["CLOUD_KEY"] }],
      connected: ["cloud"],
    });
    await expect(client.listCustomProviderIds()).resolves.toEqual(["research"]);
    expect(invoke).toHaveBeenCalledWith("acp_host_list_provider_catalog");
    expect(invoke).toHaveBeenCalledWith("acp_host_list_custom_provider_ids");
  });

  it("uses typed Host commands for provider region control", async () => {
    const invoke = vi.fn(async (command: string) => {
      if (command === "acp_host_get_provider_region") return "eu-west-1";
      return undefined;
    }) as AcpHostInvoke;
    const client = new AcpHostClient({ invoke });

    await expect(client.getProviderRegion("amazon-bedrock")).resolves.toBe("eu-west-1");
    await client.setProviderRegion("amazon-bedrock", "eu-central-1");

    expect(invoke).toHaveBeenCalledWith("acp_host_get_provider_region", {
      providerId: "amazon-bedrock",
    });
    expect(invoke).toHaveBeenCalledWith("acp_host_set_provider_region", {
      providerId: "amazon-bedrock",
      region: "eu-central-1",
    });
  });

  it("uses typed Host commands for MCP control without exposing transport auth", async () => {
    const invoke = vi.fn(async (command: string) => {
      if (command === "acp_host_list_mcp_servers") {
        return [
          {
            name: "papers",
            status: "connected",
            config: { type: "local", command: ["python", "-m", "papers"], enabled: true },
          },
        ];
      }
      return undefined;
    }) as AcpHostInvoke;
    const client = new AcpHostClient({ invoke });

    await expect(client.listMcpServers()).resolves.toEqual([
      {
        name: "papers",
        status: "connected",
        config: { type: "local", command: ["python", "-m", "papers"], enabled: true },
      },
    ]);
    await client.addMcpServer("papers", {
      type: "local",
      command: ["python", "-m", "papers"],
      enabled: true,
    });
    await client.reconnectMcpServer("papers");
    await client.ensureMcpEnvironment("papers", { SAFE_MODE: "true" });
    await client.removeMcpServer("papers");

    expect(invoke).toHaveBeenCalledWith("acp_host_list_mcp_servers");
    expect(invoke).toHaveBeenCalledWith("acp_host_add_mcp_server", {
      request: {
        name: "papers",
        config: {
          type: "local",
          command: ["python", "-m", "papers"],
          enabled: true,
        },
      },
    });
    expect(invoke).toHaveBeenCalledWith("acp_host_reconnect_mcp_server", { name: "papers" });
    expect(invoke).toHaveBeenCalledWith("acp_host_ensure_mcp_environment", {
      name: "papers",
      environment: { SAFE_MODE: "true" },
    });
    expect(invoke).toHaveBeenCalledWith("acp_host_remove_mcp_server", { name: "papers" });
    expect(JSON.stringify(invoke.mock.calls)).not.toContain("Authorization");
    expect(JSON.stringify(invoke.mock.calls)).not.toContain("Basic ");
  });

  it("rejects a launched session bound to a different project root", async () => {
    const client = new AcpHostClient({ invoke: invokeMock() });

    await expect(
      client.launch({ ...launchRequest, projectRoot: "C:/other-project" }),
    ).rejects.toThrow("session binding conflicts on projectRoot");
  });

  it("rejects loading a session when its immutable request binding changed", async () => {
    const invoke = vi.fn(async (command: string) => {
      if (command === "acp_host_load") {
        return {
          id: "persisted-session",
          binding: {
            engine: "codex",
            profile: "codex",
            model: "gpt-5.4",
            provider: "cloud",
            variant: null,
            projectRoot: "C:/science",
            profileFingerprint: "fp-1",
            resolvedAt: "123",
          },
          resumable: true,
        };
      }
      return undefined;
    }) as AcpHostInvoke;
    const client = new AcpHostClient({ invoke });

    await expect(
      client.loadSession("persisted-session", {
        ...launchRequest,
        sessionId: "persisted-session",
        projectRoot: "C:/other-project",
      }),
    ).rejects.toThrow("session binding conflicts on projectRoot");
  });

  it("creates, lists, loads, and reads history for multiple isolated sessions", async () => {
    const invoke = vi.fn(async (command: string, args?: Record<string, unknown>) => {
      if (command === "acp_host_new") {
        const sessionId = (args?.request as { sessionId: string }).sessionId;
        return {
          id: sessionId,
          binding: {
            engine: "opencode",
            profile: "opencode",
            model: sessionId === "s1" ? "model-a" : "model-b",
            provider: "provider",
            variant: null,
            projectRoot: "C:/science",
            profileFingerprint: sessionId,
            resolvedAt: "now",
          },
          resumable: true,
        };
      }
      if (command === "acp_host_sessions") {
        return [
          {
            id: "s1",
            binding: {
              engine: "opencode",
              profile: "opencode",
              model: "model-a",
              provider: "provider",
              variant: null,
              projectRoot: "C:/science",
              profileFingerprint: "s1",
              resolvedAt: "now",
            },
            resumable: true,
          },
          {
            id: "s2",
            binding: {
              engine: "opencode",
              profile: "opencode",
              model: "model-b",
              provider: "provider",
              variant: null,
              projectRoot: "C:/science",
              profileFingerprint: "s2",
              resolvedAt: "now",
            },
            resumable: true,
          },
        ];
      }
      if (command === "acp_host_load") {
        const sessionId = args?.sessionId as string;
        return {
          id: sessionId,
          binding: {
            engine: "opencode",
            profile: "opencode",
            model: sessionId === "s1" ? "model-a" : "model-b",
            provider: "provider",
            variant: null,
            projectRoot: "C:/science",
            profileFingerprint: sessionId,
            resolvedAt: "now",
          },
          resumable: true,
        };
      }
      if (command === "acp_host_history") {
        return [{ role: "user", id: args?.sessionId as string, parts: [{ type: "text", text: "hello" }] }];
      }
      return undefined;
    }) as AcpHostInvoke;
    const client = new AcpHostClient({ invoke });
    const first = await client.newSession({ ...launchRequest, engine: "opencode", profileId: "opencode", sessionId: "s1", model: "model-a", providerId: "provider", profileFingerprint: "s1" });
    const second = await client.newSession({ ...launchRequest, engine: "opencode", profileId: "opencode", sessionId: "s2", model: "model-b", providerId: "provider", profileFingerprint: "s2" });
    expect(first.binding.modelId).toBe("model-a");
    expect(second.binding.modelId).toBe("model-b");
    const sessions = await client.listSessions();
    expect(sessions.map((session) => session.id)).toEqual(["s1", "s2"]);
    const loaded = await client.loadSession("s2");
    expect(loaded.binding.profileFingerprint).toBe("s2");
    await expect(client.getHistory("s1")).resolves.toEqual([
      { role: "user", id: "s1", parts: [{ type: "text", text: "hello" }] },
    ]);
    expect(invoke).toHaveBeenCalledWith("acp_host_history", { sessionId: "s1" });
  });

  it("passes a credential reference when rehydrating a persisted session", async () => {
    const invoke = vi.fn(async (command: string) => {
      if (command === "acp_host_load") {
        return {
          id: "persisted-1",
          binding: {
            engine: "opencode",
            profile: "opencode",
            model: "model-a",
            provider: "provider",
            variant: null,
            projectRoot: "C:/science",
            profileFingerprint: "fp-persisted",
            resolvedAt: "now",
          },
          resumable: true,
        };
      }
      return undefined;
    }) as AcpHostInvoke;
    const client = new AcpHostClient({ invoke });
    await client.loadSession("persisted-1", {
      ...launchRequest,
      engine: "opencode",
      profileId: "opencode",
      sessionId: "persisted-1",
      model: "model-a",
      providerId: "provider",
      credentialRef: "provider",
      profileFingerprint: "fp-persisted",
    });
    expect(invoke).toHaveBeenCalledWith("acp_host_load", {
      sessionId: "persisted-1",
      request: expect.objectContaining({
        engine: "opencode",
        profileId: "opencode",
        credential: { keychainId: "provider" },
      }),
    });
    expect(JSON.stringify(vi.mocked(invoke).mock.calls)).not.toContain("api-key");
  });

  it("discovers legacy sessions through the Host without marking them loaded", async () => {
    const invoke = vi.fn(async (command: string) => {
      if (command === "acp_host_discover") {
        return [{
          id: "legacy-1",
          title: "Legacy title",
          directory: "C:/legacy",
          parentId: "parent-1",
          created: 1,
          updated: 2,
          binding: {
            engine: "opencode",
            profile: "opencode",
            model: "model-a",
            provider: "provider",
            variant: null,
            projectRoot: "C:/science",
            profileFingerprint: "legacy-fp",
            resolvedAt: "now",
          },
          resumable: true,
        }];
      }
      return undefined;
    }) as AcpHostInvoke;
    const client = new AcpHostClient({ invoke });

    const sessions = await client.discoverSessions({
      ...launchRequest,
      engine: "opencode",
      profileId: "opencode",
      sessionId: "opencode",
      model: "model-a",
      providerId: "provider",
      credentialRef: "provider",
      profileFingerprint: "legacy-fp",
    });

    expect(sessions.map((session) => session.id)).toEqual(["legacy-1"]);
    expect(client.hasLoadedSession("legacy-1")).toBe(false);
    expect(sessions[0]).toMatchObject({
      title: "Legacy title",
      directory: "C:/legacy",
      parentId: "parent-1",
      created: 1,
      updated: 2,
    });
    expect(invoke).toHaveBeenCalledWith("acp_host_discover", {
      request: expect.objectContaining({ engine: "opencode", credential: { keychainId: "provider" } }),
    });
  });

  it("normalizes legacy snake_case session timestamps", async () => {
    const invoke = vi.fn(async (command: string) => {
      if (command === "acp_host_discover") {
        return [{
          id: "legacy-snake",
          binding: {
            engine: "opencode",
            profile: "opencode",
            model: "model-a",
            provider: "provider",
            variant: null,
            projectRoot: "C:/science",
            profileFingerprint: "fp",
            resolvedAt: "now",
          },
          resumable: true,
          created_at: 3,
          updated_at: 4,
        }];
      }
      return undefined;
    }) as AcpHostInvoke;
    const client = new AcpHostClient({ invoke });
    const sessions = await client.discoverSessions({ ...launchRequest, engine: "opencode", profileId: "opencode" });
    expect(sessions[0]).toMatchObject({ created: 3, updated: 4 });
  });

  it("keeps an existing session binding immutable when discovery returns a newer profile", async () => {
    const invoke = vi.fn(async (command: string) => {
      if (command === "acp_host_sessions") {
        return [{
          id: "persisted",
          binding: {
            engine: "opencode",
            profile: "opencode",
            model: "old-model",
            provider: "provider",
            variant: null,
            projectRoot: "C:/science",
            profileFingerprint: "old-fp",
            resolvedAt: "now",
          },
          resumable: true,
        }];
      }
      if (command === "acp_host_discover") {
        return [{
          id: "persisted",
          binding: {
            engine: "opencode",
            profile: "opencode",
            model: "new-model",
            provider: "provider",
            variant: null,
            projectRoot: "C:/science",
            profileFingerprint: "new-fp",
            resolvedAt: "later",
          },
          resumable: true,
        }];
      }
      return undefined;
    }) as AcpHostInvoke;
    const client = new AcpHostClient({ invoke });
    await client.listSessions();
    const [session] = await client.discoverSessions({ ...launchRequest, engine: "opencode", profileId: "opencode" });
    expect(session.binding.modelId).toBe("old-model");
    expect(client.getSession("persisted")?.binding.profileFingerprint).toBe("old-fp");
  });

  it("initializes an engine through the host control plane", async () => {
    const invoke = vi.fn(async (command: string) => {
      if (command === "acp_host_initialize") {
        return { capabilities: { prompt: true, permission: true } };
      }
      return undefined;
    }) as AcpHostInvoke;
    const client = new AcpHostClient({ invoke });

    await expect(client.initialize("codex")).resolves.toEqual({
      capabilities: { prompt: true, permission: true },
    });
    expect(invoke).toHaveBeenCalledWith("acp_host_initialize", { engine: "codex" });
  });

  it("launches every engine through the single host command without secret values", async () => {
    const invoke = invokeMock();
    const client = new AcpHostClient({ invoke });

    const session = await client.launch(launchRequest);

    expect(session.binding.engineId).toBe("codex");
    expect(session.binding.projectRoot).toBe("C:/science");
    expect(invoke).toHaveBeenCalledWith("acp_host_launch", {
      request: {
        engine: "codex",
        profileId: "codex",
        sessionId: "conversation-1",
        model: "gpt-5.4",
        providerId: "cloud",
        baseUrl: "https://api.example.test/v1",
        projectRoot: "C:/science",
        variant: undefined,
        profileFingerprint: "fp-1",
        credential: { keychainId: "cloud" },
      },
    });
    expect(JSON.stringify(vi.mocked(invoke).mock.calls)).not.toContain("api-key");
  });

  it("keeps an existing persisted binding when discovery reports a newer model", async () => {
    const invoke = vi.fn(async (command: string) => {
      if (command === "acp_host_sessions") return [{
        id: "shared",
        title: "Persisted",
        binding: { engine: "opencode", profile: "opencode", model: "old-model", provider: "cloud", variant: null, projectRoot: "C:/science", profileFingerprint: "old-fp", resolvedAt: "now" },
        resumable: true,
      }];
      if (command === "acp_host_discover") return [{
        id: "shared",
        title: "Remote",
        binding: { engine: "opencode", profile: "opencode", model: "new-model", provider: "cloud", variant: null, projectRoot: "C:/science", profileFingerprint: "new-fp", resolvedAt: "now" },
        resumable: true,
      }];
      return undefined;
    }) as AcpHostInvoke;
    const client = new AcpHostClient({ invoke });
    await client.listSessions();
    const discovered = await client.discoverSessions({ ...launchRequest, engine: "opencode", profileId: "opencode" });
    expect(discovered[0].binding.modelId).toBe("old-model");
    expect(discovered[0].title).toBe("Remote");
  });

  it("normalizes vendor-neutral host events", async () => {
    const client = new AcpHostClient({ invoke: invokeMock() });
    await client.launch(launchRequest);

    await expect(client.drainEvents("agent-session-1")).resolves.toEqual([
      { type: "text.delta", sessionId: "agent-session-1", delta: "hi" },
      {
        type: "permission.requested",
        sessionId: "agent-session-1",
        requestId: "permission-1",
        action: "agent",
        resources: [],
        options: [{ id: "allow_once", label: "Allow once" }],
      },
    ]);
  });

  it("normalizes structured question requests without losing request ids or options", async () => {
    const invoke = vi.fn(async (command: string) => {
      if (command === "acp_host_launch") return invokeMock()(command);
      if (command === "acp_host_events") {
        return [{
          type: "question.requested",
          data: {
            session_id: "agent-session-1",
            request_id: "question-1",
            questions: [{
              question: "Continue the analysis?",
              header: "Next step",
              options: [{ label: "Continue", description: "Run the next stage" }],
              multiple: false,
              custom: true,
            }],
          },
        }];
      }
      return undefined;
    }) as AcpHostInvoke;
    const client = new AcpHostClient({ invoke });
    await client.launch(launchRequest);

    await expect(client.drainEvents("agent-session-1")).resolves.toEqual([{
      type: "question.requested",
      sessionId: "agent-session-1",
      requestId: "question-1",
      questions: [{
        question: "Continue the analysis?",
        header: "Next step",
        options: [{ label: "Continue", description: "Run the next stage" }],
        multiple: false,
        custom: true,
      }],
    }]);
  });

  it("normalizes rich tool updates and artifact paths for the desktop reducer", async () => {
    const invoke = vi.fn(async (command: string) => {
      if (command === "acp_host_launch") return invokeMock()(command);
      if (command === "acp_host_events") {
        return [
          {
            type: "tool.updated",
            data: {
              session_id: "agent-session-1",
              tool_call_id: "tool-1",
              status: "completed",
              title: "Write report",
              tool: "edit",
              input: { filePath: "reports/final.md" },
              output: "done",
              diff: "+ result",
              started_at: 10,
              ended_at: 20,
            },
          },
          {
            type: "artifact.created",
            data: { session_id: "agent-session-1", artifact_id: "reports/final.md" },
          },
        ];
      }
      return undefined;
    }) as AcpHostInvoke;
    const client = new AcpHostClient({ invoke });
    await client.launch(launchRequest);

    await expect(client.drainEvents("agent-session-1")).resolves.toEqual([
      {
        type: "tool.updated",
        sessionId: "agent-session-1",
        toolCallId: "tool-1",
        status: "completed",
        title: "Write report",
        tool: "edit",
        input: { filePath: "reports/final.md" },
        output: "done",
        diff: "+ result",
        startedAt: 10,
        endedAt: 20,
      },
      {
        type: "artifact.created",
        sessionId: "agent-session-1",
        artifactId: "reports/final.md",
      },
    ]);
  });

  it("rejects a silent binding change for an existing session", async () => {
    const invoke = invokeMock();
    const client = new AcpHostClient({ invoke });
    await client.launch(launchRequest);

    await expect(
      client.launch({ ...launchRequest, model: "gpt-5.5" }),
    ).rejects.toThrow("session binding conflicts on modelId");
    expect(vi.mocked(invoke).mock.calls.filter(([command]) => command === "acp_host_launch")).toHaveLength(1);
  });

  it("routes prompt, permission, question replies, cancel, and close through the same host", async () => {
    const invoke = invokeMock();
    const client = new AcpHostClient({ invoke });
    await client.launch(launchRequest);

    await client.prompt("agent-session-1", "hello");
    await client.respondPermission("agent-session-1", "permission-1", "allow_once");
    await client.respondQuestion("agent-session-1", "question-1", [["Continue"]]);
    await client.respondQuestion("agent-session-1", "question-2", null);
    await client.cancel("agent-session-1");
    await client.close("agent-session-1");

    expect(invoke).toHaveBeenCalledWith("acp_host_prompt", {
      sessionId: "agent-session-1",
      prompt: "hello",
    });
    expect(invoke).toHaveBeenCalledWith("acp_host_permission", {
      sessionId: "agent-session-1",
      requestId: "permission-1",
      optionId: "allow_once",
    });
    expect(invoke).toHaveBeenCalledWith("acp_host_question", {
      sessionId: "agent-session-1",
      requestId: "question-1",
      answers: [["Continue"]],
    });
    expect(invoke).toHaveBeenCalledWith("acp_host_question", {
      sessionId: "agent-session-1",
      requestId: "question-2",
      answers: null,
    });
    expect(invoke).toHaveBeenCalledWith("acp_host_cancel", { sessionId: "agent-session-1" });
    expect(invoke).toHaveBeenCalledWith("acp_host_close", { sessionId: "agent-session-1" });
  });

  it("resumes a persisted session through the host lifecycle command", async () => {
    const invoke = vi.fn(async (command: string, args?: Record<string, unknown>) => {
      if (command === "acp_host_resume") {
        return {
          id: args?.sessionId,
          binding: {
            engine: "codex",
            profile: "codex",
            model: "gpt-5.4",
            provider: "cloud",
            variant: null,
            projectRoot: "C:/science",
            profileFingerprint: "fp-1",
            resolvedAt: "123",
          },
          state: "ready",
          resumable: true,
        };
      }
      return undefined;
    }) as AcpHostInvoke;
    const client = new AcpHostClient({ invoke });

    await expect(client.resumeSession("persisted-session")).resolves.toEqual(
      expect.objectContaining({ id: "persisted-session", state: "ready", resumable: true }),
    );
    expect(invoke).toHaveBeenCalledWith("acp_host_resume", {
      sessionId: "persisted-session",
    });
    expect(client.hasLoadedSession("persisted-session")).toBe(true);
  });

  it("sets a session mode through the host lifecycle command", async () => {
    const invoke = invokeMock();
    const client = new AcpHostClient({ invoke });
    await client.launch(launchRequest);
    invoke.mockClear();

    await client.setMode("agent-session-1", "planning");

    expect(invoke).toHaveBeenCalledWith("acp_host_mode", {
      sessionId: "agent-session-1",
      mode: "planning",
    });
  });

  it("rejects a mode change for a session that is not loaded", async () => {
    const invoke = invokeMock();
    const client = new AcpHostClient({ invoke });

    await expect(client.setMode("missing-session", "planning")).rejects.toThrow(
      "session missing-session is not registered",
    );
    expect(invoke).not.toHaveBeenCalled();
  });

  it("routes structured prompt attachments through the host without changing the session binding", async () => {
    const invoke = invokeMock();
    const client = new AcpHostClient({ invoke });
    await client.launch(launchRequest);
    const attachments: PromptAttachment[] = [
      { filename: "figure.png", mime: "image/png", base64: "cGl4ZWxz" },
      {
        filename: "notes.txt",
        mime: "text/plain",
        base64: "bm90ZXM=",
        extractedText: "sample notes",
      },
    ];

    await client.prompt("agent-session-1", "analyze", attachments);

    expect(invoke).toHaveBeenCalledWith("acp_host_prompt", {
      sessionId: "agent-session-1",
      prompt: "analyze",
      attachments,
    });
  });

  it("routes pre-prompt session config changes through the host and refreshes the binding", async () => {
    const invoke = invokeMock();
    const client = new AcpHostClient({ invoke });
    await client.launch(launchRequest);

    await expect(client.setConfig("agent-session-1", { model: "gpt-5.5" })).resolves.toEqual(
      expect.objectContaining({
        id: "agent-session-1",
        binding: expect.objectContaining({ modelId: "gpt-5.5" }),
      }),
    );
    expect(invoke).toHaveBeenCalledWith("acp_host_config", {
      sessionId: "agent-session-1",
      config: { model: "gpt-5.5" },
    });
  });

  it("preserves the host session state returned by session listings", async () => {
    const invoke = vi.fn(async (command: string) => {
      if (command === "acp_host_sessions") {
        return [{
          id: "closed-session",
          binding: {
            engine: "codex",
            profile: "codex",
            model: "gpt-5.4",
            provider: "cloud",
            variant: null,
            projectRoot: "C:/science",
            profileFingerprint: "fp-1",
            resolvedAt: "123",
          },
          state: "closed",
          resumable: false,
        }];
      }
      return undefined;
    }) as AcpHostInvoke;
    const client = new AcpHostClient({ invoke });

    await expect(client.listSessions()).resolves.toEqual([
      expect.objectContaining({ id: "closed-session", state: "closed", resumable: false }),
    ]);
  });

  it("stops polling after delivering a terminal event sequence", async () => {
    let eventPolls = 0;
    const invoke = vi.fn(async (command: string) => {
      if (command === "acp_host_launch") {
        return {
          id: "agent-session-1",
          binding: {
            engine: "codex",
            profile: "codex",
            model: "gpt-5.4",
            provider: "cloud",
            variant: null,
            projectRoot: "C:/science",
            profileFingerprint: "fp-1",
            resolvedAt: "123",
          },
          state: "ready",
          resumable: false,
        };
      }
      if (command === "acp_host_events") {
        eventPolls += 1;
        return [
          { type: "error", data: { session_id: "agent-session-1", message: "adapter crashed" } },
          { type: "session.closed", data: { session_id: "agent-session-1" } },
        ];
      }
      return undefined;
    }) as AcpHostInvoke;
    const client = new AcpHostClient({ invoke, pollIntervalMs: 1 });
    await client.launch(launchRequest);
    const events: string[] = [];
    let stop = () => {};
    try {
      await new Promise<void>((resolve) => {
        stop = client.subscribe("agent-session-1", (event) => {
          events.push(event.type);
          if (event.type === "session.closed") resolve();
        });
      });
      await new Promise((resolve) => setTimeout(resolve, 15));
      expect(events).toEqual(["error", "session.closed"]);
      expect(eventPolls).toBe(1);
      expect(client.getSession("agent-session-1")?.state).toBe("closed");
      expect(client.hasLoadedSession("agent-session-1")).toBe(false);
    } finally {
      stop();
    }
  });

  it("emits one error and stops when event polling fails", async () => {
    let eventPolls = 0;
    const invoke = vi.fn(async (command: string) => {
      if (command === "acp_host_launch") {
        return {
          id: "agent-session-1",
          binding: {
            engine: "codex",
            profile: "codex",
            model: "gpt-5.4",
            provider: "cloud",
            variant: null,
            projectRoot: "C:/science",
            profileFingerprint: "fp-1",
            resolvedAt: "123",
          },
          state: "ready",
          resumable: false,
        };
      }
      if (command === "acp_host_events") {
        eventPolls += 1;
        throw new Error("host unavailable");
      }
      return undefined;
    }) as AcpHostInvoke;
    const client = new AcpHostClient({ invoke, pollIntervalMs: 1 });
    await client.launch(launchRequest);
    const errors: string[] = [];
    let stop = () => {};
    try {
      await new Promise<void>((resolve) => {
        stop = client.subscribe("agent-session-1", (event) => {
          if (event.type === "error") {
            errors.push(event.message);
            resolve();
          }
        });
      });
      await new Promise((resolve) => setTimeout(resolve, 15));
      expect(errors).toEqual(["host unavailable"]);
      expect(eventPolls).toBe(1);
      expect(client.getSession("agent-session-1")?.state).toBe("error");
    } finally {
      stop();
    }
  });
});
