import { describe, expect, it } from "vitest";
import type { AcpHostInvoke } from "@zerowall/sdk";
import { createAcpHostRuntimeDeps } from "./acp-host-runtime";

function fakeInvoke(): AcpHostInvoke {
  return async <T = unknown>(command: string): Promise<T> => {
    if (command === "acp_host_initialize") {
      return { capabilities: { prompt: true, permission: true } } as T;
    }
    if (command === "acp_host_launch") {
      return {
        id: "host-session-1",
        binding: {
          engine: "codex",
          profile: "codex",
          model: "gpt-5.4",
          provider: "cloud",
          variant: null,
          projectRoot: "C:/science",
          profileFingerprint: "codex:fp",
          resolvedAt: "now",
        },
        resumable: false,
      } as T;
    }
    if (command === "acp_host_config") {
      return {
        id: "host-session-1",
        binding: {
          engine: "codex",
          profile: "codex",
          model: "gpt-5.4",
          provider: "cloud",
          variant: null,
          projectRoot: "C:/science",
          profileFingerprint: "codex:fp",
          resolvedAt: "now",
        },
        resumable: false,
      } as T;
    }
    if (command === "acp_host_events") {
      return [] as T;
    }
    return undefined as T;
  };
}

describe("ACP Host runtime adapter", () => {
  it("uses one Host lifecycle for launch, prompt, cancel, and shutdown", async () => {
    const calls: string[] = [];
    const invoke = (async (command: string, args?: Record<string, unknown>) => {
      calls.push(`${command}:${JSON.stringify(args ?? {})}`);
      return fakeInvoke()(command, args);
    }) as AcpHostInvoke;
    const deps = createAcpHostRuntimeDeps(invoke);
    const unlisten = await deps.subscribe({});
    const status = await deps.launch({
      profileId: "codex",
      conversationId: "conversation-1",
      gateway: { providerId: "cloud", baseUrl: "https://api.example.test/v1", model: "gpt-5.4" },
    });
    await deps.prompt("hello");
    await deps.cancel();
    await deps.shutdown();
    unlisten();

    expect(status.phase).toBe("ready");
    expect(calls.map((call) => call.split(":", 1)[0])).toEqual([
      "acp_host_initialize",
      "acp_host_launch",
      "acp_host_events",
      "acp_host_prompt",
      "acp_host_cancel",
      "acp_host_sessions",
      "acp_host_close",
    ]);
  });

  it("launches OpenCode through the same Host commands", async () => {
    const calls: Array<[string, Record<string, unknown> | undefined]> = [];
    const invoke = (async <T = unknown>(command: string, args?: Record<string, unknown>) => {
      calls.push([command, args]);
      if (command === "acp_host_initialize") {
        return { capabilities: { prompt: true } } as T;
      }
      if (command === "acp_host_launch") {
        return {
          id: "opencode-session-1",
          binding: {
            engine: "opencode",
            profile: "opencode",
            model: "gpt-5.4",
            provider: "cloud",
            variant: null,
            projectRoot: "C:/science",
            profileFingerprint: "opencode:fp",
            resolvedAt: "now",
          },
          resumable: false,
        } as T;
      }
      return undefined as T;
    }) as AcpHostInvoke;
    const deps = createAcpHostRuntimeDeps(invoke);

    await deps.launch({
      profileId: "opencode",
      conversationId: "conversation-1",
      gateway: { providerId: "cloud", baseUrl: "http://127.0.0.1:4096", model: "gpt-5.4" },
    });

    expect(calls[0]).toEqual(["acp_host_initialize", { engine: "opencode" }]);
    expect(calls[1]?.[0]).toBe("acp_host_launch");
    expect(calls[1]?.[1]).toMatchObject({
      request: { engine: "opencode", profileId: "opencode", sessionId: "conversation-1" },
    });
  });

  it.each(["codex", "claude-code", "acp:codex"])(
    "starts a fresh OpenCode session instead of loading legacy ACP id %s",
    async (legacyId) => {
      const calls: Array<[string, Record<string, unknown> | undefined]> = [];
      const invoke = (async <T = unknown>(command: string, args?: Record<string, unknown>) => {
        calls.push([command, args]);
        if (command === "acp_host_initialize") return { capabilities: { prompt: true } } as T;
        if (command === "acp_host_launch") {
          return {
            id: "opencode-session-1",
            binding: {
              engine: "opencode",
              profile: "opencode",
              model: "gpt-5.4",
              provider: "cloud",
              variant: null,
              projectRoot: "C:/science",
              profileFingerprint: "opencode:fp",
              resolvedAt: "now",
            },
            resumable: false,
          } as T;
        }
        return undefined as T;
      }) as AcpHostInvoke;
      const deps = createAcpHostRuntimeDeps(invoke);

      await deps.launch({
        profileId: "opencode",
        conversationId: legacyId,
        gateway: { providerId: "cloud", baseUrl: "http://127.0.0.1:4096", model: "gpt-5.4" },
      });

      expect(calls.find(([command]) => command === "acp_host_launch")?.[1]).toMatchObject({
        request: { sessionId: "opencode" },
      });
    },
  );

  it("merges persisted and discovered OpenCode sessions with metadata and persisted precedence", async () => {
    const calls: Array<[string, Record<string, unknown> | undefined]> = [];
    const invoke = (async <T = unknown>(command: string, args?: Record<string, unknown>) => {
      calls.push([command, args]);
      if (command === "acp_host_initialize") return { capabilities: { prompt: true } } as T;
      if (command === "acp_host_launch") return {
        id: "active",
        binding: { engine: "opencode", profile: "opencode", model: "new-model", provider: "cloud", variant: null, projectRoot: "C:/science", profileFingerprint: "fp", resolvedAt: "now" },
        resumable: false,
      } as T;
      if (command === "acp_host_sessions") return [{
        id: "shared", title: "Persisted", directory: "C:/persisted", updated: 10,
        binding: { engine: "opencode", profile: "opencode", model: "old-model", provider: "cloud", variant: null, projectRoot: "C:/science", profileFingerprint: "old-fp", resolvedAt: "now" }, resumable: true,
      }] as T;
      if (command === "acp_host_discover") return [
        { id: "shared", title: "Remote title", directory: "C:/remote", updated: 20, binding: { engine: "opencode", profile: "opencode", model: "new-model", provider: "cloud", variant: null, projectRoot: "C:/science", profileFingerprint: "fp", resolvedAt: "now" }, resumable: true },
        { id: "remote", title: "Remote only", directory: "C:/remote", created: 1, updated: 2, binding: { engine: "opencode", profile: "opencode", model: "new-model", provider: "cloud", variant: null, projectRoot: "C:/science", profileFingerprint: "fp", resolvedAt: "now" }, resumable: true },
      ] as T;
      return undefined as T;
    }) as AcpHostInvoke;
    const deps = createAcpHostRuntimeDeps(invoke);
    await deps.launch({ profileId: "opencode", conversationId: "active", gateway: { providerId: "cloud", baseUrl: "http://127.0.0.1:4096", model: "new-model" } });
    const sessions = await deps.listSessions?.();
    expect(sessions).toEqual([
      { id: "shared", title: "Persisted", directory: "C:/persisted", parentId: undefined, created: undefined, updated: 10 },
      { id: "remote", title: "Remote only", directory: "C:/remote", parentId: undefined, created: 1, updated: 2 },
    ]);
  });

  it("loads a discovered session with only a credential reference", async () => {
    const calls: Array<[string, Record<string, unknown> | undefined]> = [];
    const invoke = (async <T = unknown>(command: string, args?: Record<string, unknown>) => {
      calls.push([command, args]);
      if (command === "acp_host_initialize") return { capabilities: { prompt: true } } as T;
      if (command === "acp_host_launch") return {
        id: "active", binding: { engine: "opencode", profile: "opencode", model: "model", provider: "cloud", variant: null, projectRoot: "C:/science", profileFingerprint: "fp", resolvedAt: "now" }, resumable: false,
      } as T;
      if (command === "acp_host_sessions") return [] as T;
      if (command === "acp_host_discover") return [{
        id: "remote", title: "Remote", binding: { engine: "opencode", profile: "opencode", model: "model", provider: "cloud", variant: null, projectRoot: "C:/science", profileFingerprint: "fp", resolvedAt: "now" }, resumable: true,
      }] as T;
      if (command === "acp_host_load") return {
        id: "remote", binding: { engine: "opencode", profile: "opencode", model: "model", provider: "cloud", variant: null, projectRoot: "C:/science", profileFingerprint: "fp", resolvedAt: "now" }, resumable: true,
      } as T;
      if (command === "acp_host_events") return [] as T;
      return undefined as T;
    }) as AcpHostInvoke;
    const deps = createAcpHostRuntimeDeps(invoke);
    await deps.launch({ profileId: "opencode", conversationId: "active", gateway: { providerId: "cloud", baseUrl: "http://127.0.0.1:4096", model: "model" } });
    await deps.listSessions?.();
    await deps.activateSession?.("remote");
    const load = calls.find(([command]) => command === "acp_host_load");
    expect(load?.[1]).toMatchObject({ sessionId: "remote", request: { credential: { keychainId: "cloud" } } });
    expect(JSON.stringify(load)).not.toContain("api-key");
  });
});
