import { create } from "zustand";
import { appUpdateCancel, appUpdateStatus, downloadUpdate, latestRelease, type AppUpdatePhase } from "./tauri";

// The public downloads repo that actually holds the releases (see build.yml).
const RELEASE_URL = "https://api.github.com/repos/ccfwwm/zerowallscience-releases/releases/latest";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const ENABLED_KEY = "zerowall.update.enabled";
const BADGE_KEY = "zerowall.update.badge";
const DISMISSED_KEY = "zerowall.update.dismissed";
const LAST_CHECKED_KEY = "zerowall.update.lastCheckedAt";
const LATEST_KEY = "zerowall.update.latest";

export interface UpdateInfo {
  version: string;
  url: string;
  name: string | null;
  publishedAt: string | null;
  assetUrl?: string | null;
  assetName?: string | null;
  assetSha256?: string | null;
}

interface GitHubRelease {
  tag_name?: string;
  html_url?: string;
  name?: string | null;
  published_at?: string | null;
  draft?: boolean;
  prerelease?: boolean;
  assets?: Array<{ browser_download_url?: string; name?: string; digest?: string | null }>;
}

type CheckStatus = "idle" | "checking" | "ready" | "error";
export type DownloadStatus = "idle" | "downloading" | "ready" | "error";

export interface AppUpdateActivitySnapshot {
  agentTurns: number;
  workflowRuns: number;
  mcpMutations: number;
  runActivities: number;
}

export type AppUpdateBlockReason = "agent-turn" | "workflow-run" | "mcp-mutation" | "run-activity";

export function appUpdateBlockedReason(activity: AppUpdateActivitySnapshot): AppUpdateBlockReason | null {
  if (activity.agentTurns > 0) return "agent-turn";
  if (activity.workflowRuns > 0) return "workflow-run";
  if (activity.mcpMutations > 0) return "mcp-mutation";
  if (activity.runActivities > 0) return "run-activity";
  return null;
}

interface UpdateState {
  enabled: boolean;
  badgeEnabled: boolean;
  dismissedVersion: string | null;
  lastCheckedAt: number | null;
  latest: UpdateInfo | null;
  status: CheckStatus;
  error: string | null;
  currentVersion: string;
  hasUpdate: boolean;
  showBadge: boolean;
  downloadStatus: DownloadStatus;
  downloadedPath: string | null;
  appUpdatePhase: AppUpdatePhase;
  downloadedBytes: number;
  totalBytes: number | null;
  setEnabled: (enabled: boolean) => void;
  setBadgeEnabled: (enabled: boolean) => void;
  dismissBadge: () => void;
  check: (opts?: { manual?: boolean; now?: number }) => Promise<void>;
  maybeAutoCheck: () => Promise<void>;
  download: (activity?: AppUpdateActivitySnapshot) => Promise<string | null>;
  cancelDownload: () => Promise<void>;
  refreshDownloadStatus: () => Promise<void>;
}

function readBool(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  const v = window.localStorage.getItem(key);
  if (v === "1") return true;
  if (v === "0") return false;
  return fallback;
}

function readNumber(key: string): number | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function readLatest(): UpdateInfo | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LATEST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UpdateInfo;
    return parsed?.version && parsed?.url ? parsed : null;
  } catch {
    return null;
  }
}

function persistLatest(latest: UpdateInfo | null): void {
  if (typeof window === "undefined") return;
  if (latest) window.localStorage.setItem(LATEST_KEY, JSON.stringify(latest));
  else window.localStorage.removeItem(LATEST_KEY);
}

function setLocal(key: string, value: string | null): void {
  if (typeof window === "undefined") return;
  if (value === null) window.localStorage.removeItem(key);
  else window.localStorage.setItem(key, value);
}

export function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/i, "").split(/[+-]/)[0] ?? "";
}

export function compareVersions(a: string, b: string): number {
  const pa = normalizeVersion(a).split(".").map((x) => Number.parseInt(x, 10));
  const pb = normalizeVersion(b).split(".").map((x) => Number.parseInt(x, 10));
  for (let i = 0; i < Math.max(pa.length, pb.length, 3); i++) {
    const da = Number.isFinite(pa[i]) ? pa[i] : 0;
    const db = Number.isFinite(pb[i]) ? pb[i] : 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

export function isNewerVersion(candidate: string, current: string): boolean {
  return compareVersions(candidate, current) > 0;
}

export function shouldAutoCheck(lastCheckedAt: number | null, now: number): boolean {
  return !lastCheckedAt || now - lastCheckedAt >= CHECK_INTERVAL_MS;
}

export function shouldShowUpdateBadge(args: {
  enabled: boolean;
  badgeEnabled: boolean;
  latest: UpdateInfo | null;
  currentVersion: string;
  dismissedVersion: string | null;
}): boolean {
  if (!args.enabled || !args.badgeEnabled || !args.latest) return false;
  if (!isNewerVersion(args.latest.version, args.currentVersion)) return false;
  return normalizeVersion(args.latest.version) !== normalizeVersion(args.dismissedVersion ?? "");
}

function derive(base: Pick<UpdateState, "enabled" | "badgeEnabled" | "latest" | "currentVersion" | "dismissedVersion">) {
  const hasUpdate = Boolean(base.latest && isNewerVersion(base.latest.version, base.currentVersion));
  const showBadge = shouldShowUpdateBadge(base);
  return { hasUpdate, showBadge };
}

async function fetchLatestRelease(): Promise<UpdateInfo> {
  const native = await latestRelease();
  if (native) return native;

  const res = await fetch(RELEASE_URL, {
    headers: {
      Accept: "application/vnd.github+json",
    },
  });
  if (!res.ok) throw new Error(`GitHub returned ${res.status}`);
  const json = (await res.json()) as GitHubRelease;
  const version = json.tag_name?.trim();
  const url = json.html_url?.trim();
  if (!version || !url) throw new Error("GitHub release response was incomplete");
  return {
    version,
    url,
    name: json.name ?? null,
    publishedAt: json.published_at ?? null,
    assetUrl: json.assets?.[0]?.browser_download_url ?? null,
    assetName: json.assets?.[0]?.name ?? null,
    assetSha256: json.assets?.[0]?.digest?.replace(/^sha256:/, "") ?? null,
  };
}

const initial = {
  enabled: readBool(ENABLED_KEY, true),
  badgeEnabled: readBool(BADGE_KEY, true),
  dismissedVersion: typeof window === "undefined" ? null : window.localStorage.getItem(DISMISSED_KEY),
  lastCheckedAt: readNumber(LAST_CHECKED_KEY),
  latest: readLatest(),
  currentVersion: __APP_VERSION__,
};

const EMPTY_ACTIVITY: AppUpdateActivitySnapshot = {
  agentTurns: 0,
  workflowRuns: 0,
  mcpMutations: 0,
  runActivities: 0,
};

export const useUpdateStore = create<UpdateState>((set, get) => ({
  ...initial,
  status: "idle",
  downloadStatus: "idle",
  downloadedPath: null,
  appUpdatePhase: "idle" as AppUpdatePhase,
  downloadedBytes: 0,
  totalBytes: null,
  error: null,
  ...derive(initial),
  setEnabled: (enabled) => {
    setLocal(ENABLED_KEY, enabled ? "1" : "0");
    set((s) => ({ enabled, ...derive({ ...s, enabled }) }));
  },
  setBadgeEnabled: (badgeEnabled) => {
    setLocal(BADGE_KEY, badgeEnabled ? "1" : "0");
    set((s) => ({ badgeEnabled, ...derive({ ...s, badgeEnabled }) }));
  },
  dismissBadge: () => {
    const dismissedVersion = get().latest?.version ?? null;
    setLocal(DISMISSED_KEY, dismissedVersion);
    set((s) => ({ dismissedVersion, ...derive({ ...s, dismissedVersion }) }));
  },
  check: async (opts) => {
    const manual = opts?.manual ?? false;
    const now = opts?.now ?? Date.now();
    const s = get();
    if (!manual) {
      if (!s.enabled) return;
      if (!shouldAutoCheck(s.lastCheckedAt, now)) return;
    }
    set({ status: "checking", error: null });
    try {
      const latest = await fetchLatestRelease();
      setLocal(LAST_CHECKED_KEY, String(now));
      persistLatest(latest);
      set((cur) => ({
        latest,
        lastCheckedAt: now,
        status: "ready",
        error: null,
        ...derive({ ...cur, latest }),
      }));
    } catch (e) {
      setLocal(LAST_CHECKED_KEY, String(now));
      set({
        lastCheckedAt: now,
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },
  maybeAutoCheck: () => get().check({ manual: false }),
  download: async (activity = EMPTY_ACTIVITY) => {
    const blocked = appUpdateBlockedReason(activity);
    if (blocked) {
      set({ error: `application update blocked by ${blocked}` });
      return null;
    }
    const latest = get().latest;
    if (!latest?.assetUrl || !latest.assetName) {
      set({ downloadStatus: "error", error: "No downloadable installer is available for this platform." });
      return null;
    }
    if (!latest.assetSha256) {
      set({ downloadStatus: "error", error: "The installer has no published SHA-256 digest." });
      return null;
    }
    set({ downloadStatus: "downloading", error: null });
    let stopped = false;
    const poll = async () => {
      if (stopped) return;
      try {
        const snapshot = await appUpdateStatus();
        if (snapshot) {
          set({
            appUpdatePhase: snapshot.phase,
            downloadedBytes: snapshot.downloadedBytes,
            totalBytes: snapshot.totalBytes,
            downloadedPath: snapshot.targetPath ?? get().downloadedPath,
          });
        }
      } catch {
        // The download command remains authoritative; status polling is best effort.
      }
      if (!stopped) window.setTimeout(() => void poll(), 250);
    };
    void poll();
    try {
      const path = await downloadUpdate(latest.assetUrl, latest.assetName, latest.assetSha256);
      set({ downloadStatus: "ready", appUpdatePhase: "ready", downloadedPath: path, error: null });
      return path;
    } catch (error) {
      const snapshot = await appUpdateStatus().catch(() => null);
      set({
        downloadStatus: snapshot?.phase === "idle" ? "idle" : "error",
        appUpdatePhase: snapshot?.phase ?? "failed",
        downloadedBytes: snapshot?.downloadedBytes ?? get().downloadedBytes,
        totalBytes: snapshot?.totalBytes ?? get().totalBytes,
        error: snapshot?.message ?? (error instanceof Error ? error.message : String(error)),
      });
      return null;
    } finally {
      stopped = true;
    }
  },
  cancelDownload: async () => {
    try {
      const snapshot = await appUpdateCancel();
      set({
        appUpdatePhase: snapshot.phase,
        downloadedBytes: snapshot.downloadedBytes,
        totalBytes: snapshot.totalBytes,
        error: snapshot.message,
      });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  },
  refreshDownloadStatus: async () => {
    try {
      const snapshot = await appUpdateStatus();
      if (snapshot) set({ appUpdatePhase: snapshot.phase, downloadedBytes: snapshot.downloadedBytes, totalBytes: snapshot.totalBytes, downloadedPath: snapshot.targetPath ?? get().downloadedPath });
    } catch {
      // Browser mode and older hosts do not expose native update status.
    }
  },
}));
