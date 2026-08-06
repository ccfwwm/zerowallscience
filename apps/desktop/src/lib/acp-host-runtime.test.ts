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
      "acp_host_close",
    ]);
  });
});
