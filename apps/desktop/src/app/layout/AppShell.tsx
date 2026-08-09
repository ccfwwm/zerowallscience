import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation } from "react-router-dom";
import { Download, Loader2, PanelLeft, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { CommandPalette } from "@/components/command-palette/CommandPalette";
import { PaneDragGhost } from "@/components/session/PaneDragGhost";
import { Toaster } from "@/components/ui/Toaster";
import { useRuntimeStore } from "@/lib/runtime";
import { runtimeActivitySnapshot } from "@/lib/runtime-activity";
import { ensureDefaultConnectors, ensureSetupProgressListener, healJupyterMcpEnv } from "@/lib/setup";
import { useOverlayTitlebar, useUiStore } from "@/lib/store";
import { overlayTitlebarStyle } from "@/lib/titlebar";
import { ensureJupyter, isTauri, openDownloadedUpdate, openExternal, watchFullscreen } from "@/lib/tauri";
import { useUpdateStore } from "@/lib/update";
import { isGatewayWeb, gatewayToken, setUnauthorizedHandler } from "@/lib/webMode";
import { WebTokenGate } from "@/components/web/WebTokenGate";
import { DesktopLoginGate } from "@/components/auth/DesktopLoginGate";
import { DesktopEnvironmentGate } from "@/components/environment/DesktopEnvironmentGate";
import { useEnvironmentUpdateStore } from "@/lib/environment-update";
import { WorkflowRunApprovalDialog } from "@/components/workflow/WorkflowRunApprovalDialog";
import { WorkflowAgentPermissionDialog } from "@/components/workflow/WorkflowAgentPermissionDialog";
import { useIsMobile } from "@/lib/useIsMobile";

export function AppShell() {
  const { t } = useTranslation("nav");
  const { sidebarCollapsed, setSidebarCollapsed } = useUiStore();
  const isMobile = useIsMobile();
  // Gateway web client: hold the app behind a token gate until authenticated.
  const [webReady, setWebReady] = useState(!isGatewayWeb || !!gatewayToken());
  const [updateOpen, setUpdateOpen] = useState(false);
  const updateAvailable = useUpdateStore((s) => s.hasUpdate);
  const latestUpdate = useUpdateStore((s) => s.latest);
  const downloadedPath = useUpdateStore((s) => s.downloadedPath);
  const downloadStatus = useUpdateStore((s) => s.downloadStatus);
  const download = useUpdateStore((s) => s.download);
  const cancelDownload = useUpdateStore((s) => s.cancelDownload);
  const downloadedBytes = useUpdateStore((s) => s.downloadedBytes);
  const totalBytes = useUpdateStore((s) => s.totalBytes);
  const agentTurns = useRuntimeStore((s) => Object.keys(s.runningSessions).length);
  const workflowRuns = useRuntimeStore((s) => Object.values(s.workflowRuns).filter((run) => ["pending", "running", "paused", "failed"].includes(run.state)).length);
  const mcpMutations = useRuntimeStore((s) => runtimeActivitySnapshot(s).mcpMutations);
  const runActivities = useRuntimeStore((s) => runtimeActivitySnapshot(s).runActivities);
  const environmentVersion = useEnvironmentUpdateStore((s) => s.snapshot?.currentVersion ?? null);

  useEffect(() => {
    if (updateAvailable && !import.meta.env.TEST) setUpdateOpen(true);
  }, [updateAvailable]);

  // Cmd/Ctrl+B toggles the sidebar, matching the button's tooltip. Not in
  // settings: there the sidebar IS the settings navigation (with the only way
  // back to the app), so it must not collapse.
  const inSettings = useLocation().pathname.startsWith("/settings");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        if (!window.location.pathname.startsWith("/settings"))
          useUiStore.getState().toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // In the packaged desktop app, auto-start the bundled OpenCode and connect,
  // and bring the Jupyter server back up if the user enabled it before.
  useEffect(() => {
    if (isGatewayWeb && !webReady) return; // wait for the token gate
    // The runtime is supplied by the separately installed environment bundle.
    // Do not ask Tauri to spawn it while the first-run environment gate is
    // still checking or when the user explicitly chose to continue without it.
    if (isTauri && !isGatewayWeb && !environmentVersion) return;
    void useRuntimeStore.getState().bootstrap();
    void ensureJupyter();
    // One app-lifetime listener for uv provisioning progress, so a running
    // download's live output survives navigating between pages.
    ensureSetupProgressListener();
    if (!import.meta.env.TEST) {
      void useUpdateStore.getState().maybeAutoCheck();
    }
  }, [webReady, environmentVersion]);

  // First run: bring the default connectors up once the sidecar is actually
  // answering. Doing this at mount would race the runtime — the setup store
  // needs a client to read the existing MCP config, and without one it would
  // reinstall connectors the user already has.
  const runtimeReady = useRuntimeStore((s) => s.status) === "ready";
  useEffect(() => {
    if (runtimeReady && !import.meta.env.TEST) {
      ensureDefaultConnectors(environmentVersion ?? "legacy");
      // Heal pre-fix Jupyter MCP entries so they stop starting a kernel at
      // launch (which blocked the handshake and showed the server "failed").
      void healJupyterMcpEnv();
    }
  }, [environmentVersion, runtimeReady]);

  // Web client: if the gateway rejects the token (rotated/revoked), drop back
  // to the token gate instead of looping on a failed connection.
  useEffect(() => {
    if (!isGatewayWeb) return;
    setUnauthorizedHandler(() => setWebReady(false));
    return () => setUnauthorizedHandler(null);
  }, []);

  // Mobile: the sidebar is an overlay drawer — keep it closed by default and
  // close it after navigating (tapping a session or nav item). Keyed on
  // location.key, not pathname: tapping "New" while already on /live pushes
  // the same path, and the drawer must still close.
  const locationKey = useLocation().key;
  useEffect(() => {
    if (isMobile) setSidebarCollapsed(true);
  }, [isMobile, locationKey, setSidebarCollapsed]);

  // Track native fullscreen: macOS hides the traffic lights there, so headers
  // must drop their traffic-light inset (see useOverlayTitlebar).
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void watchFullscreen((fs) => useUiStore.getState().setIsFullscreen(fs)).then((u) => {
      if (cancelled) u();
      else unlisten = u;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // External links open in the system browser. Navigating the webview away
  // from the app would strand the user — there is no back button.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest?.("a[href]");
      const href = anchor?.getAttribute("href") ?? "";
      if (/^https?:\/\//i.test(href)) {
        e.preventDefault();
        void openExternal(href);
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  // The session pages' own header doubles as the titlebar when the sidebar is
  // collapsed; every other route gets this fallback strip so the macOS traffic
  // lights don't overlap content, the window stays draggable, and the sidebar
  // can be re-expanded. Live and example sessions share the same one-row header
  // — without this the example page would stack this strip on top of its own
  // header and read as a double-height bar.
  const isMac = navigator.userAgent.includes("Mac");
  const overlayTitlebar = useOverlayTitlebar();
  const pathname = useLocation().pathname;
  const pageOwnsTitlebar = pathname.startsWith("/live") || pathname.startsWith("/example");

  if (isGatewayWeb && !webReady) {
    return <WebTokenGate onConnect={() => setWebReady(true)} />;
  }

  return (
    <DesktopEnvironmentGate>
      <DesktopLoginGate>
        {/* The window background lives on <main>, not the shell: under vibrancy
            the area behind the (translucent) sidebar must stay transparent. */}
        <div className="flex h-screen w-screen overflow-hidden text-text">
      <Sidebar project={{ id: "", name: "", sessions: [] }} />
      {/* Mobile: dim + close the overlay drawer by tapping outside it. */}
      {isMobile && !sidebarCollapsed && (
        <div
          className="fixed inset-0 z-30 bg-black/40"
          onClick={() => setSidebarCollapsed(true)}
          aria-hidden
        />
      )}
      <main className="flex min-w-0 flex-1 flex-col bg-bg">
        {/* Mobile top bar: a hamburger to open the drawer. Skipped on pages that
            own their header (live/example sessions already render a toggle) so
            the two don't stack. */}
        {isMobile && !pageOwnsTitlebar && (
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-2">
            <button
              onClick={() => setSidebarCollapsed(false)}
              aria-label={t("sidebar.expand")}
              className="rounded p-2 text-text hover:bg-surface-2"
            >
              <PanelLeft size={18} strokeWidth={1.5} />
            </button>
          </div>
        )}
        {/* Titlebar strip for pages that don't own one: keeps the whole top
            of the content area draggable under the macOS overlay titlebar,
            and hosts the expand button while the sidebar is collapsed. */}
        {!isMobile && !pageOwnsTitlebar && (overlayTitlebar || (sidebarCollapsed && !inSettings)) && (
          <div
            data-tauri-drag-region={overlayTitlebar || undefined}
            style={
              overlayTitlebar
                ? overlayTitlebarStyle(sidebarCollapsed && !inSettings)
                : undefined
            }
            className={cn("flex shrink-0 items-center", !overlayTitlebar && "h-12 pl-2")}
          >
            {sidebarCollapsed && !inSettings && (
              <button
                onClick={() => setSidebarCollapsed(false)}
                aria-label={t("sidebar.expand")}
                title={t("sidebar.expandTitle", { shortcut: isMac ? "⌘B" : "Ctrl+B" })}
                className="fade-in rounded p-1 text-text hover:bg-surface-2"
              >
                <PanelLeft size={14} strokeWidth={1.5} />
              </button>
            )}
          </div>
        )}
        <div className="min-h-0 flex-1">
          <Outlet />
        </div>
      </main>
      <CommandPalette />
      <Toaster />
      <PaneDragGhost />
      <WorkflowRunApprovalDialog />
      <WorkflowAgentPermissionDialog />
      {updateOpen && latestUpdate && (
        <UpdateDialog
          latest={latestUpdate}
          status={downloadStatus}
          downloadedPath={downloadedPath}
          onDownload={() => void download({ agentTurns, workflowRuns, mcpMutations, runActivities })}
          onCancel={() => void cancelDownload()}
          downloadedBytes={downloadedBytes}
          totalBytes={totalBytes}
          onOpen={() => downloadedPath && void openDownloadedUpdate(downloadedPath)}
          onClose={() => setUpdateOpen(false)}
        />
      )}
        </div>
      </DesktopLoginGate>
    </DesktopEnvironmentGate>
  );
}

function UpdateDialog({ latest, status, downloadedPath, downloadedBytes, totalBytes, onDownload, onCancel, onOpen, onClose }: {
  latest: { version: string; assetName?: string | null; notes?: string | null };
  status: "idle" | "downloading" | "ready" | "error";
  downloadedPath: string | null;
  downloadedBytes: number;
  totalBytes: number | null;
  onDownload: () => void;
  onCancel: () => void;
  onOpen: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation(["settings"]);
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/35 p-6">
      <section role="dialog" aria-modal="true" aria-label={t("updates.title")} className="w-full max-w-md rounded-card border border-border bg-surface p-5 shadow-xl">
        <div className="flex items-start gap-3">
          <Download size={18} className="mt-0.5 text-accent" />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-text">{t("updates.available")}</h2>
            <p className="mt-1 text-sm text-muted">{t("updates.latestVersion", { version: latest.version })}</p>
            {latest.assetName && <p className="mt-1 truncate font-mono text-xs text-muted">{latest.assetName}</p>}
            {latest.notes && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-text">{latest.notes}</p>}
          </div>
          <button aria-label={t("updates.close")} onClick={onClose} className="text-muted hover:text-text"><X size={15} /></button>
        </div>
        {status === "downloading" && (
          <div className="mt-4 space-y-2">
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-accent transition-[width]"
                style={{ width: totalBytes && totalBytes > 0 ? `${Math.min(100, (downloadedBytes / totalBytes) * 100)}%` : "35%" }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted">
              <span>{totalBytes ? `${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}` : formatBytes(downloadedBytes)}</span>
              <button onClick={onCancel} className="rounded px-2 py-1 hover:bg-surface-2">{t("updates.cancelDownload")}</button>
            </div>
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md px-3 py-1.5 text-xs text-muted hover:bg-surface-2">{t("updates.later")}</button>
          {status === "ready" && downloadedPath ? (
            <button onClick={onOpen} className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg"><Download size={13} /> {t("updates.openInstaller")}</button>
          ) : (
            <button onClick={onDownload} className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg disabled:opacity-60" disabled={status === "downloading"}>
              {status === "downloading" ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              {status === "downloading" ? t("updates.downloading") : t("updates.download")}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
