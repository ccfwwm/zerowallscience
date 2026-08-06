import { describe, expect, it } from "vitest";
import { ReviewSessionRunner, type ReviewHost, type ReviewRunRequest } from "./review-session";

const request: ReviewRunRequest = {
  launch: {
    engine: "codex",
    profileId: "review-profile",
    sessionId: "source-session",
    model: "gpt-5",
    providerId: "ai-cloud",
    baseUrl: "https://example.invalid",
    profileFingerprint: "fp-1",
    credentialRef: "keychain:review",
  },
  prompt: "Review the artifact.",
  rawOutput: "artifact output",
};

function fakeHost() {
  let listener: Parameters<ReviewHost["subscribe"]>[1] | null = null;
  const permissions: Array<{ requestId: string; optionId: string | null }> = [];
  const host: ReviewHost = {
    newSession: async (launch) => ({
      id: "review-session",
      binding: {
        engineId: launch.engine,
        profileId: launch.profileId,
        modelId: launch.model,
        providerId: launch.providerId,
        variant: launch.variant ?? null,
        projectRoot: "workspace",
        profileFingerprint: launch.profileFingerprint,
        resolvedAt: "now",
      },
      state: "ready",
      resumable: false,
    }),
    subscribe: (_sessionId, next) => {
      listener = next;
      return () => {
        listener = null;
      };
    },
    prompt: async () => {
      listener?.({
        type: "permission.requested",
        sessionId: "review-session",
        requestId: "p-1",
        action: "shell.exec",
        resources: ["python analysis.py"],
        options: [
          { id: "allow-once", label: "Allow once" },
          { id: "deny", label: "Deny" },
        ],
      });
      listener?.({ type: "text.delta", sessionId: "review-session", delta: "Review complete" });
      listener?.({ type: "session.idle", sessionId: "review-session" });
    },
    respondPermission: async (_sessionId, requestId, optionId) => permissions.push({ requestId, optionId }),
    cancel: async () => undefined,
    close: async () => undefined,
  };
  return { host, permissions };
}

describe("ReviewSessionRunner", () => {
  it("runs an isolated read-only ACP session and denies mutation permissions", async () => {
    const { host, permissions } = fakeHost();
    const result = await new ReviewSessionRunner(host).run(request);

    expect(result.status).toBe("completed");
    expect(result.sessionId).toBe("review-session");
    expect(result.output).toBe("Review complete");
    expect(result.engine).toBe("codex");
    expect(result.model).toBe("gpt-5");
    expect(permissions).toEqual([{ requestId: "p-1", optionId: "deny" }]);
  });

  it("returns Unreviewable without launching when no raw inspectable output exists", async () => {
    const { host } = fakeHost();
    let launches = 0;
    const wrapped: ReviewHost = { ...host, newSession: async (...args) => { launches += 1; return host.newSession(...args); } };

    const result = await new ReviewSessionRunner(wrapped).run({ ...request, rawOutput: "  " });

    expect(result.status).toBe("unreviewable");
    expect(result.verdict).toBe("Unreviewable");
    expect(launches).toBe(0);
  });

  it("cancels and reports a timed-out review", async () => {
    const { host } = fakeHost();
    const idleHost: ReviewHost = {
      ...host,
      prompt: async () => undefined,
    };
    const result = await new ReviewSessionRunner(idleHost).run({ ...request, timeoutMs: 1 });

    expect(result.status).toBe("timed-out");
    expect(result.timeoutMs).toBe(1);
  });
});
