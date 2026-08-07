import { describe, expect, it } from "vitest";
import type { AcpHostInvoke } from "@zerowall/sdk";
import { runAcpReview } from "./review-runtime";

describe("runAcpReview", () => {
  it("uses an independent Host session and waits for its review output", async () => {
    let prompted = false;
    let eventsSent = false;
    const commands: string[] = [];
    const invoke: AcpHostInvoke = async <T>(command: string) => {
      commands.push(command);
      if (command === "acp_host_initialize") return { capabilities: {} } as T;
      if (command === "acp_host_new") {
        return {
          id: "review-session",
          resumable: false,
          binding: {
            engine: "codex",
            profile: "codex",
            model: "gpt-5",
            provider: "ai-cloud",
            variant: null,
            project_root: "C:/science",
            profile_fingerprint: "codex|ai-cloud|https://example.invalid|gpt-5",
            resolved_at: "now",
          },
        } as T;
      }
      if (command === "acp_host_prompt") {
        prompted = true;
        return undefined as T;
      }
      if (command === "acp_host_events") {
        if (!prompted || eventsSent) return [] as T;
        eventsSent = true;
        return [
          { type: "text.delta", data: { session_id: "review-session", delta: "```review\n{\"findings\":[],\"note\":\"Sound\"}\n```" } },
          { type: "session.idle", data: { session_id: "review-session" } },
        ] as T;
      }
      if (command === "acp_host_close") return undefined as T;
      throw new Error(`unexpected command: ${command}`);
    };

    const result = await runAcpReview({
      profileId: "codex",
      projectRoot: "C:/science",
      gateway: { providerId: "ai-cloud", baseUrl: "https://example.invalid", model: "gpt-5" },
    }, "inspectable result", invoke, 1);

    expect(result.status).toBe("completed");
    expect(result.output).toContain("Sound");
    expect(commands).toContain("acp_host_new");
    expect(commands).toContain("acp_host_close");
  });
});
