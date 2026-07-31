import { afterEach, describe, expect, it, vi } from "vitest";

// The core module is dynamically imported inside each wrapper; mock it so we can
// assert the exact command name + args shape the Tauri contract requires.
const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

// `isTauri` gates every wrapper. Flip it per-describe by re-mocking ./tauri.
const tauriFlag = vi.hoisted(() => ({ value: true }));
vi.mock("./tauri", () => ({
  get isTauri() {
    return tauriFlag.value;
  },
  logDebug: vi.fn(),
}));

import {
  acpLaunch,
  acpReplyExec,
  acpReplyPermission,
  acpShutdown,
  acpStatus,
} from "./acp";

afterEach(() => {
  vi.clearAllMocks();
  tauriFlag.value = true;
});

describe("acpLaunch arg mapping", () => {
  it("maps secret refs to snake_case and defaults optional fields", async () => {
    invoke.mockResolvedValue({ running: true, profile_id: "codex" });

    await acpLaunch({
      id: "codex",
      label: "Codex",
      command: "codex",
      secrets: [{ envVar: "OPENAI_API_KEY", providerId: "openai" }],
    });

    expect(invoke).toHaveBeenCalledWith("acp_launch", {
      request: {
        id: "codex",
        label: "Codex",
        command: "codex",
        args: [],
        env: [],
        secrets: [{ env_var: "OPENAI_API_KEY", provider_id: "openai" }],
      },
    });
  });

  it("passes through non-secret env and args verbatim", async () => {
    invoke.mockResolvedValue({ running: true, profile_id: "claude-code" });

    await acpLaunch({
      id: "claude-code",
      label: "Claude Code",
      command: "claude-code",
      args: ["--acp"],
      env: [["ANTHROPIC_MODEL", "claude-opus-4-8"]],
    });

    expect(invoke).toHaveBeenCalledWith("acp_launch", {
      request: {
        id: "claude-code",
        label: "Claude Code",
        command: "claude-code",
        args: ["--acp"],
        env: [["ANTHROPIC_MODEL", "claude-opus-4-8"]],
        secrets: [],
      },
    });
  });

  it("throws off-desktop and never invokes", async () => {
    tauriFlag.value = false;
    await expect(
      acpLaunch({ id: "x", label: "X", command: "x" }),
    ).rejects.toThrow(/desktop/);
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe("reply wrappers", () => {
  it("forwards permission replies with camelCase params", async () => {
    await acpReplyPermission(7, "allow-once");
    expect(invoke).toHaveBeenCalledWith("acp_reply_permission", {
      permissionId: 7,
      optionId: "allow-once",
    });
  });

  it("forwards a null option id (reject) unchanged", async () => {
    await acpReplyPermission(9, null);
    expect(invoke).toHaveBeenCalledWith("acp_reply_permission", {
      permissionId: 9,
      optionId: null,
    });
  });

  it("forwards exec approvals with camelCase params", async () => {
    await acpReplyExec(3, false);
    expect(invoke).toHaveBeenCalledWith("acp_reply_exec", { execId: 3, allow: false });
  });
});

describe("off-desktop behavior", () => {
  it("acpStatus returns an idle status without invoking", async () => {
    tauriFlag.value = false;
    await expect(acpStatus()).resolves.toEqual({ running: false, profile_id: null });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("acpShutdown returns idle without invoking", async () => {
    tauriFlag.value = false;
    await expect(acpShutdown()).resolves.toEqual({ running: false, profile_id: null });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("reply wrappers no-op off-desktop", async () => {
    tauriFlag.value = false;
    await acpReplyPermission(1, "x");
    await acpReplyExec(1, true);
    expect(invoke).not.toHaveBeenCalled();
  });
});
