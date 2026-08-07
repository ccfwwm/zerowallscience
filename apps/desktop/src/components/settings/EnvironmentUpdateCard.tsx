import { useEffect, useState } from "react";
import { Download, Loader2, RefreshCw, RotateCcw, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useEnvironmentUpdateStore } from "@/lib/environment-update";
import { Section } from "./Section";
import { cn } from "@/lib/cn";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index];
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${unit}`;
}

function isCancellablePhase(phase: string): boolean {
  return ["downloading", "verifying", "installing"].includes(phase);
}

export function EnvironmentUpdateCard() {
  const { t } = useTranslation("settings");
  const snapshot = useEnvironmentUpdateStore((s) => s.snapshot);
  const envelopeJson = useEnvironmentUpdateStore((s) => s.envelopeJson);
  const error = useEnvironmentUpdateStore((s) => s.error);
  const refresh = useEnvironmentUpdateStore((s) => s.refresh);
  const check = useEnvironmentUpdateStore((s) => s.check);
  const install = useEnvironmentUpdateStore((s) => s.install);
  const cancel = useEnvironmentUpdateStore((s) => s.cancel);
  const rollback = useEnvironmentUpdateStore((s) => s.rollback);
  const [busy, setBusy] = useState<"check" | "install" | "rollback" | null>(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const phase = snapshot?.phase ?? "idle";
  const isWorking = busy !== null || ["checking", "downloading", "verifying", "installing"].includes(phase);
  const run = async (kind: "check" | "install" | "rollback") => {
    if (busy) return;
    setBusy(kind);
    try {
      if (kind === "check") await check();
      if (kind === "install") await install();
      if (kind === "rollback") await rollback();
    } finally {
      setBusy(null);
    }
  };

  const phaseLabel = t(`environmentUpdates.phase.${phase}`);
  const rawMessage = error ?? snapshot?.message;
  const message = rawMessage === "Environment update cancelled."
    ? t("environmentUpdates.cancelledMessage")
    : rawMessage === "Cancelling environment update..."
      ? t("environmentUpdates.cancellingMessage")
      : rawMessage;
  const tone = phase === "failed" ? "text-error" : phase === "available" ? "text-accent" : "text-ok";
  const downloadedBytes = snapshot?.downloadedBytes ?? 0;
  const totalBytes = snapshot?.totalBytes ?? null;
  const progress = totalBytes && totalBytes > 0
    ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100))
    : null;
  const canCancel = isCancellablePhase(phase);
  const canContinue = phase === "available" && downloadedBytes > 0;

  useEffect(() => {
    if (!canCancel) setCancelling(false);
  }, [canCancel]);

  const cancelDownload = async () => {
    if (cancelling || !canCancel) return;
    setCancelling(true);
    const next = await cancel();
    if (!next || !isCancellablePhase(next.phase)) setCancelling(false);
  };

  return (
    <Section title={t("environmentUpdates.title")} hint={t("environmentUpdates.hint")} flush>
      <div className="divide-y divide-faint">
        <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 text-[13px]">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("h-1.5 w-1.5 rounded-full bg-current", tone)} />
              <span className="font-medium text-text">{phaseLabel}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
              <span>{t("environmentUpdates.currentVersion", { version: snapshot?.currentVersion ?? "—" })}</span>
              <span>{t("environmentUpdates.targetVersion", { version: snapshot?.targetVersion ?? "—" })}</span>
              {snapshot?.previousVersion && (
                <span>{t("environmentUpdates.previousVersion", { version: snapshot.previousVersion })}</span>
              )}
            </div>
            {message && (
              <p className={cn("mt-2 text-xs leading-relaxed", error || phase === "failed" ? "text-error" : "text-muted")}>
                {message}
              </p>
            )}
            {(phase === "downloading" || downloadedBytes > 0) && (
              <div className="mt-3 max-w-[360px]">
                <div className="mb-1.5 flex items-center justify-between gap-4 text-xs text-muted">
                  <span className="truncate">
                    {snapshot?.currentComponent
                      ? t("environmentUpdates.currentComponent", { component: snapshot.currentComponent })
                      : t("environmentUpdates.preparingDownload")}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {progress !== null && <span className="mr-2">{progress}%</span>}
                    {totalBytes
                      ? `${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}`
                      : formatBytes(downloadedBytes)}
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-label={t("environmentUpdates.downloadProgress")}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progress ?? undefined}
                  className="h-1.5 overflow-hidden rounded-full bg-surface-2"
                >
                  <div
                    className={cn("h-full bg-accent transition-[width]", progress === null && "w-1/3 animate-pulse")}
                    style={progress === null ? undefined : { width: `${progress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              className="flex h-9 items-center gap-1.5 rounded-input bg-surface-2 px-3.5 text-[13px] text-text hover:bg-border/50 disabled:text-muted"
              onClick={() => void run("check")}
              disabled={isWorking}
            >
              {busy === "check" || phase === "checking" ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              {t("environmentUpdates.check")}
            </button>
            <button
              type="button"
              className="flex h-9 items-center gap-1.5 rounded-input bg-accent px-3.5 text-[13px] text-white hover:bg-accent/90 disabled:bg-surface-2 disabled:text-muted"
              onClick={() => void run("install")}
              disabled={!envelopeJson || isWorking || phase !== "available"}
            >
              {busy === "install" || ["downloading", "verifying", "installing"].includes(phase) ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              {t(canContinue ? "environmentUpdates.continueInstall" : "environmentUpdates.install")}
            </button>
            {canCancel && (
              <button
                type="button"
                className="flex h-9 items-center gap-1.5 rounded-input border border-border px-3.5 text-[13px] text-text hover:bg-surface-2 disabled:text-muted"
                onClick={() => void cancelDownload()}
                disabled={cancelling}
              >
                {cancelling ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
                {t("environmentUpdates.cancel")}
              </button>
            )}
            <button
              type="button"
              className="flex h-9 items-center gap-1.5 rounded-input border border-border px-3.5 text-[13px] text-text hover:bg-surface-2 disabled:text-muted"
              onClick={() => void run("rollback")}
              disabled={!snapshot?.previousVersion || isWorking}
            >
              {busy === "rollback" ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
              {t("environmentUpdates.rollback")}
            </button>
          </div>
        </div>
      </div>
    </Section>
  );
}
