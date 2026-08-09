import { beforeEach, describe, expect, it } from "vitest";
import {
  pendingProviders,
  queuePendingProvider,
  removePendingProvider,
} from "./pending-providers";

describe("pending custom providers", () => {
  beforeEach(() => window.localStorage.clear());

  it("stores only non-secret provider metadata and replaces the same id", () => {
    queuePendingProvider({
      id: "lab",
      options: {
        name: "Lab",
        npm: "@ai-sdk/openai-compatible",
        baseURL: "https://example.test/v1",
        models: ["model-a"],
        contexts: { "model-a": 128_000 },
      },
    });
    queuePendingProvider({
      id: "lab",
      options: {
        name: "Lab Updated",
        npm: "@ai-sdk/openai-compatible",
        baseURL: "https://example.test/v1",
        models: ["model-b"],
      },
    });

    expect(pendingProviders()).toEqual([
      expect.objectContaining({
        id: "lab",
        options: expect.objectContaining({ name: "Lab Updated", models: ["model-b"] }),
      }),
    ]);
    expect(JSON.stringify(pendingProviders())).not.toMatch(/apiKey|secret|credential/i);
  });

  it("removes a provider after the runtime applies it", () => {
    queuePendingProvider({
      id: "local",
      options: {
        name: "Local",
        npm: "@ai-sdk/openai-compatible",
        baseURL: "http://127.0.0.1:11434/v1",
        models: ["local-model"],
      },
    });

    removePendingProvider("local");
    expect(pendingProviders()).toEqual([]);
  });
});
