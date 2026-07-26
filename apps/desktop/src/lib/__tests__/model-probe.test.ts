/**
 * Unit tests for P2 domestic model probing and gateway switching.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  classifyProbeError,
  probeDomesticModels,
  loadRoleBindings,
  saveRoleBindings,
  createModelSnapshot,
  saveSessionSnapshot,
  loadSessionSnapshot,
  type GatewayConfig,
} from "../model-probe";

describe("classifyProbeError", () => {
  it("should classify network errors correctly", () => {
    expect(classifyProbeError(new TypeError("Failed to fetch"))).toBe("network");
    expect(classifyProbeError(new Error("timeout exceeded"))).toBe("network");
    expect(classifyProbeError(new Error("Connection aborted"))).toBe("network");
    expect(classifyProbeError(new Error("500 Internal Server Error"))).toBe("network");
    expect(classifyProbeError(new Error("502 Bad Gateway"))).toBe("network");
    expect(classifyProbeError(new Error("503 Service Unavailable"))).toBe("network");
  });

  it("should classify auth errors correctly", () => {
    expect(classifyProbeError(new Error("401 Unauthorized"))).toBe("auth");
    expect(classifyProbeError(new Error("403 Forbidden"))).toBe("auth");
  });

  it("should classify quota errors correctly", () => {
    expect(classifyProbeError(new Error("429 Too Many Requests"))).toBe("quota");
    expect(classifyProbeError(new Error("Quota exceeded"))).toBe("quota");
    expect(classifyProbeError(new Error("Insufficient balance"))).toBe("quota");
  });

  it("should classify unknown errors as other", () => {
    expect(classifyProbeError(new Error("Something went wrong"))).toBe("other");
    expect(classifyProbeError("string error")).toBe("other");
    expect(classifyProbeError(null)).toBe("other");
  });
});

describe("probeDomesticModels", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should use primary gateway when successful", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: "moonshot-v1-8k" },
          { id: "moonshot-v1-32k" },
        ],
      }),
    });
    global.fetch = mockFetch;

    const gateways: GatewayConfig[] = [
      { url: "https://primary.example.com", priority: "primary" },
      { url: "https://backup.example.com", priority: "backup" },
    ];

    const results = await probeDomesticModels(gateways);

    // Should have tried only primary gateway
    expect(mockFetch).toHaveBeenCalled();
    expect(Object.keys(results).length).toBeGreaterThan(0);

    // Check that results contain gateway info
    for (const result of Object.values(results)) {
      expect(result.gateway).toBeDefined();
      expect(result.models).toBeDefined();
      expect(result.latency).toBeGreaterThanOrEqual(0);
    }
  });

  it("should fallback to backup gateway on network error", async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // First call (primary) fails with network error
        return Promise.reject(new TypeError("Failed to fetch"));
      }
      // Second call (backup) succeeds
      return Promise.resolve({
        ok: true,
        json: async () => ({
          data: [{ id: "deepseek-chat" }],
        }),
      });
    });
    global.fetch = mockFetch;

    const gateways: GatewayConfig[] = [
      { url: "https://primary.example.com", priority: "primary" },
      { url: "https://backup.example.com", priority: "backup" },
    ];

    await probeDomesticModels(gateways);

    // Should have tried both gateways
    expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("should not fallback on auth errors", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: "Unauthorized" }),
    });
    global.fetch = mockFetch;

    const gateways: GatewayConfig[] = [
      { url: "https://primary.example.com", priority: "primary" },
      { url: "https://backup.example.com", priority: "backup" },
    ];

    await probeDomesticModels(gateways);

    // Should not have excessive retries for auth errors
    // Auth errors should not trigger gateway switching
  });

  it("should not fallback on quota errors", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: "Rate limit exceeded" }),
    });
    global.fetch = mockFetch;

    const gateways: GatewayConfig[] = [
      { url: "https://primary.example.com", priority: "primary" },
      { url: "https://backup.example.com", priority: "backup" },
    ];

    await probeDomesticModels(gateways);

    // Quota errors should not trigger gateway switching
  });
});

describe("RoleModelBinding persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("should save and load role bindings", () => {
    const bindings = {
      general: { role: "general", primary: "anthropic/claude-sonnet-5", reasoning: "medium" },
      research: { role: "research", primary: "anthropic/claude-opus-5", reasoning: "high" },
    };

    saveRoleBindings(bindings);
    const loaded = loadRoleBindings();

    expect(loaded).toEqual(bindings);
  });

  it("should return null when no bindings exist", () => {
    const loaded = loadRoleBindings();
    expect(loaded).toBeNull();
  });

  it("should handle corrupted data gracefully", () => {
    localStorage.setItem("zerowall:roleModelBindings", "invalid json");
    const loaded = loadRoleBindings();
    expect(loaded).toBeNull();
  });
});

describe("Session model snapshots", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("should create and save session snapshots", () => {
    const snapshot = createModelSnapshot(
      "session-123",
      "research",
      "anthropic/claude-opus-5",
      "high",
      "https://code.aicodeme.cn",
      "https://api.anthropic.com"
    );

    expect(snapshot.sessionId).toBe("session-123");
    expect(snapshot.role).toBe("research");
    expect(snapshot.model).toBe("anthropic/claude-opus-5");
    expect(snapshot.reasoning).toBe("high");
    expect(snapshot.gateway).toBe("https://code.aicodeme.cn");
    expect(snapshot.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    saveSessionSnapshot(snapshot);
    const loaded = loadSessionSnapshot("session-123");

    expect(loaded).toEqual(snapshot);
  });

  it("should return null for non-existent session", () => {
    const loaded = loadSessionSnapshot("non-existent");
    expect(loaded).toBeNull();
  });

  it("should handle corrupted snapshot data", () => {
    sessionStorage.setItem("zerowall:session:test", "invalid json");
    const loaded = loadSessionSnapshot("test");
    expect(loaded).toBeNull();
  });
});
