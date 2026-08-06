import { describe, expect, it, vi } from "vitest";
import { AcpHostClient, type AcpHostInvoke } from "./AcpHostClient";
import type { PromptAttachment } from "./runtime";

const launchRequest = {
  engine: "codex" as const,
  profileId: "codex",
  sessionId: "conversation-1",
  model: "gpt-5.4",
  providerId: "cloud",
  baseUrl: "https://api.example.test/v1",
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
        variant: undefined,
        profileFingerprint: "fp-1",
        credential: { keychainId: "cloud" },
      },
    });
    expect(JSON.stringify(vi.mocked(invoke).mock.calls)).not.toContain("api-key");
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

  it("rejects a silent binding change for an existing session", async () => {
    const invoke = invokeMock();
    const client = new AcpHostClient({ invoke });
    await client.launch(launchRequest);

    await expect(
      client.launch({ ...launchRequest, model: "gpt-5.5" }),
    ).rejects.toThrow("session binding conflicts on modelId");
    expect(vi.mocked(invoke).mock.calls.filter(([command]) => command === "acp_host_launch")).toHaveLength(1);
  });

  it("routes prompt, permission, cancel, and close through the same host", async () => {
    const invoke = invokeMock();
    const client = new AcpHostClient({ invoke });
    await client.launch(launchRequest);

    await client.prompt("agent-session-1", "hello");
    await client.respondPermission("agent-session-1", "permission-1", "allow_once");
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
    expect(invoke).toHaveBeenCalledWith("acp_host_cancel", { sessionId: "agent-session-1" });
    expect(invoke).toHaveBeenCalledWith("acp_host_close", { sessionId: "agent-session-1" });
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
});
