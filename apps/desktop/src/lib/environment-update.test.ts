import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EnvironmentUpdateSnapshot } from "./tauri";
import { useEnvironmentUpdateStore } from "./environment-update";

const native = vi.hoisted(() => ({
  manifest: vi.fn(),
  check: vi.fn(),
  install: vi.fn(),
  rollback: vi.fn(),
  status: vi.fn(),
}));

vi.mock("./tauri", () => ({
  environmentUpdateManifest: native.manifest,
  environmentUpdateCheck: native.check,
  environmentUpdateInstall: native.install,
  environmentUpdateRollback: native.rollback,
  environmentUpdateStatus: native.status,
}));

import {
  environmentUpdateBlockedReason,
  environmentUpdateStatusLabel,
  type EnvironmentActivitySnapshot,
  type EnvironmentUpdatePhase,
} from "./environment-update";

const available: EnvironmentUpdateSnapshot = {
  phase: "available",
  currentVersion: "1.0.0",
  previousVersion: null,
  targetVersion: "1.1.0",
  message: null,
};

beforeEach(() => {
  native.manifest.mockReset();
  native.check.mockReset();
  native.install.mockReset();
  native.rollback.mockReset();
  native.status.mockReset();
  useEnvironmentUpdateStore.setState({ snapshot: null, envelopeJson: null, error: null });
});

describe("environment update guard", () => {
  const idle: EnvironmentActivitySnapshot = {
    agentTurns: 0,
    workflowRuns: 0,
    mcpMutations: 0,
    runActivities: 0,
  };

  it("allows an update when no protected activity is active", () => {
    expect(environmentUpdateBlockedReason(idle)).toBeNull();
  });

  it("blocks an active agent turn before checking other activities", () => {
    expect(environmentUpdateBlockedReason({ ...idle, agentTurns: 1 })).toBe("agent-turn");
  });

  it("blocks an active workflow, mutation MCP lane, or run activity", () => {
    expect(environmentUpdateBlockedReason({ ...idle, workflowRuns: 1 })).toBe("workflow-run");
    expect(environmentUpdateBlockedReason({ ...idle, mcpMutations: 1 })).toBe("mcp-mutation");
    expect(environmentUpdateBlockedReason({ ...idle, runActivities: 1 })).toBe("run-activity");
  });
});

describe("environment update phase labels", () => {
  it.each<EnvironmentUpdatePhase>([
    "idle",
    "checking",
    "available",
    "downloading",
    "verifying",
    "installing",
    "restart-required",
    "failed",
    "rolled-back",
  ])("has a stable label for %s", (phase) => {
    expect(environmentUpdateStatusLabel(phase)).toBeTruthy();
  });
});

describe("environment update store", () => {
  it("loads the target-specific signed manifest before checking", async () => {
    native.manifest.mockResolvedValue("signed-envelope");
    native.check.mockResolvedValue(available);

    await useEnvironmentUpdateStore.getState().check();

    expect(native.manifest).toHaveBeenCalledTimes(1);
    expect(native.check).toHaveBeenCalledWith("signed-envelope");
    expect(useEnvironmentUpdateStore.getState().envelopeJson).toBe("signed-envelope");
  });

  it("does not invoke native install while a protected activity is active", async () => {
    useEnvironmentUpdateStore.setState({ envelopeJson: "signed" });
    const result = await useEnvironmentUpdateStore.getState().install({
      agentTurns: 1,
      workflowRuns: 0,
      mcpMutations: 0,
      runActivities: 0,
    });
    expect(result).toBeNull();
    expect(native.install).not.toHaveBeenCalled();
    expect(useEnvironmentUpdateStore.getState().error).toContain("agent-turn");
  });

  it("stores the native snapshot after a successful install", async () => {
    useEnvironmentUpdateStore.setState({ envelopeJson: "signed" });
    native.install.mockResolvedValue(available);
    await useEnvironmentUpdateStore.getState().install();
    expect(native.install).toHaveBeenCalledWith("signed");
    expect(useEnvironmentUpdateStore.getState().snapshot).toEqual(available);
    expect(useEnvironmentUpdateStore.getState().error).toBeNull();
  });

  it("requires a checked manifest before install", async () => {
    const result = await useEnvironmentUpdateStore.getState().install();
    expect(result).toBeNull();
    expect(native.install).not.toHaveBeenCalled();
    expect(useEnvironmentUpdateStore.getState().error).toContain("Check for environment updates first");
  });
});
