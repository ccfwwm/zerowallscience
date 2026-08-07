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
  it("maps a stable profile and gateway metadata to snake_case", async () => {
    invoke.mockResolvedValue({ phase: "ready", profile_id: "codex" });

    await acpLaunch({
      profileId: "codex",
      projectRoot: "C:/science",
      gateway: { providerId: "zerowall-1", baseUrl: "https://gw/v1", model: "gpt-5.6-terra" },
    });

    expect(invoke).toHaveBeenCalledWith("acp_launch", {
      request: {
        profile_id: "codex",
        project_root: "C:/science",
        gateway: { provider_id: "zerowall-1", base_url: "https://gw/v1", model: "gpt-5.6-terra" },
      },
    });
  });

  it("passes gateway platform metadata without accepting a command", async () => {
    invoke.mockResolvedValue({ phase: "ready", profile_id: "claude-code" });

    await acpLaunch({
      profileId: "claude-code",
      projectRoot: "C:/science",
      gateway: {
        providerId: "zerowall-2",
        baseUrl: "https://gw/v1",
        model: "claude-opus-5",
        platform: "anthropic",
      },
    });

    expect(invoke).toHaveBeenCalledWith("acp_launch", {
      request: {
        profile_id: "claude-code",
        project_root: "C:/science",
        gateway: {
          provider_id: "zerowall-2",
          base_url: "https://gw/v1",
          model: "claude-opus-5",
          platform: "anthropic",
        },
      },
    });
  });

  it("throws off-desktop and never invokes", async () => {
    tauriFlag.value = false;
    await expect(
      acpLaunch({
        profileId: "x",
        projectRoot: "C:/science",
        gateway: { providerId: "p", baseUrl: "https://gw", model: "m" },
      }),
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
    await expect(acpStatus()).resolves.toEqual({ phase: "idle", profile_id: null, runtime_info: null, last_error: null });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("acpShutdown returns idle without invoking", async () => {
    tauriFlag.value = false;
    await expect(acpShutdown()).resolves.toEqual({ phase: "idle", profile_id: null, runtime_info: null, last_error: null });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("reply wrappers no-op off-desktop", async () => {
    tauriFlag.value = false;
    await acpReplyPermission(1, "x");
    await acpReplyExec(1, true);
    expect(invoke).not.toHaveBeenCalled();
  });
});
