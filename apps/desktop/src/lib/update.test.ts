import { beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({
  cancel: vi.fn(),
  download: vi.fn(),
  latest: vi.fn(async () => null),
  status: vi.fn(),
}));

vi.mock("./tauri", () => ({
  appUpdateCancel: native.cancel,
  appUpdateStatus: native.status,
  downloadUpdate: native.download,
  latestRelease: native.latest,
}));

import {
  appUpdateBlockedReason,
  compareVersions,
  isNewerVersion,
  shouldAutoCheck,
  shouldShowUpdateBadge,
  useUpdateStore,
  type UpdateInfo,
} from "./update";

const latest: UpdateInfo = {
  version: "v0.1.8",
  url: "https://github.com/ccfwwm/zerowallscience/releases/tag/v0.1.8",
  name: "v0.1.8",
  publishedAt: "2026-07-09T00:00:00Z",
};

describe("version comparison", () => {
  it("compares v-prefixed semver versions", () => {
    expect(compareVersions("v0.1.8", "0.1.7")).toBe(1);
    expect(compareVersions("0.1.7", "v0.1.7")).toBe(0);
    expect(compareVersions("0.2.0", "0.10.0")).toBe(-1);
  });

  it("detects newer versions only", () => {
    expect(isNewerVersion("v0.1.8", "0.1.7")).toBe(true);
    expect(isNewerVersion("v0.1.7", "0.1.7")).toBe(false);
    expect(isNewerVersion("v0.1.6", "0.1.7")).toBe(false);
  });
});

describe("update check policy", () => {
  it("checks automatically at most once per 24 hours", () => {
    const now = 1_000_000_000;
    expect(shouldAutoCheck(null, now)).toBe(true);
    expect(shouldAutoCheck(now - 23 * 60 * 60 * 1000, now)).toBe(false);
    expect(shouldAutoCheck(now - 24 * 60 * 60 * 1000, now)).toBe(true);
  });

  it("allows update badge suppression without disabling checks", () => {
    expect(
      shouldShowUpdateBadge({
        enabled: true,
        badgeEnabled: true,
        latest,
        currentVersion: "0.1.7",
        dismissedVersion: null,
      }),
    ).toBe(true);
    expect(
      shouldShowUpdateBadge({
        enabled: true,
        badgeEnabled: false,
        latest,
        currentVersion: "0.1.7",
        dismissedVersion: null,
      }),
    ).toBe(false);
    expect(
      shouldShowUpdateBadge({
        enabled: true,
        badgeEnabled: true,
        latest,
        currentVersion: "0.1.7",
        dismissedVersion: "0.1.8",
      }),
    ).toBe(false);
  });
});

describe("update store", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    native.cancel.mockReset();
    native.download.mockReset();
    native.latest.mockReset().mockResolvedValue(null);
    native.status.mockReset();
    useUpdateStore.setState({
      enabled: true,
      badgeEnabled: true,
      dismissedVersion: null,
      lastCheckedAt: null,
      latest: null,
      status: "idle",
      error: null,
      currentVersion: "0.1.7",
      hasUpdate: false,
      showBadge: false,
      downloadStatus: "idle",
      downloadedBytes: 0,
      totalBytes: null,
      downloadedPath: null,
    });
  });

  it("manual checks bypass the 24 hour throttle", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: "v0.1.8",
        html_url: latest.url,
        name: latest.name,
        published_at: latest.publishedAt,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    useUpdateStore.setState({ lastCheckedAt: 1000 });
    await useUpdateStore.getState().check({ manual: true, now: 2000 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(useUpdateStore.getState().hasUpdate).toBe(true);
    expect(useUpdateStore.getState().showBadge).toBe(true);
  });

  it("blocks application updates while an agent turn or workflow is active", () => {
    expect(appUpdateBlockedReason({ agentTurns: 1, workflowRuns: 0, mcpMutations: 0, runActivities: 0 })).toBe("agent-turn");
    expect(appUpdateBlockedReason({ agentTurns: 0, workflowRuns: 1, mcpMutations: 0, runActivities: 0 })).toBe("workflow-run");
    expect(appUpdateBlockedReason({ agentTurns: 0, workflowRuns: 0, mcpMutations: 0, runActivities: 0 })).toBeNull();
  });

  it("keeps the partial download available after cancellation so retry can resume", async () => {
    native.cancel.mockResolvedValue({
      phase: "downloading",
      message: "Cancelling application update...",
      downloadedBytes: 512,
      totalBytes: 1024,
      targetPath: null,
    });
    useUpdateStore.setState({ downloadStatus: "downloading", downloadedBytes: 256, totalBytes: 1024 });

    await useUpdateStore.getState().cancelDownload();

    expect(native.cancel).toHaveBeenCalledOnce();
    expect(useUpdateStore.getState().downloadStatus).toBe("downloading");
    expect(useUpdateStore.getState().downloadedBytes).toBe(512);
  });
});
