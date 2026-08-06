import { useEffect, useState } from "react";
import { Download, Loader2, RefreshCw, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useEnvironmentUpdateStore } from "@/lib/environment-update";
import { Section } from "./Section";
import { cn } from "@/lib/cn";

export function EnvironmentUpdateCard({ envelopeJson }: { envelopeJson?: string | null } = {}) {
  const { t } = useTranslation("settings");
  const snapshot = useEnvironmentUpdateStore((s) => s.snapshot);
  const error = useEnvironmentUpdateStore((s) => s.error);
  const refresh = useEnvironmentUpdateStore((s) => s.refresh);
  const check = useEnvironmentUpdateStore((s) => s.check);
  const install = useEnvironmentUpdateStore((s) => s.install);
  const rollback = useEnvironmentUpdateStore((s) => s.rollback);
  const [busy, setBusy] = useState<"check" | "install" | "rollback" | null>(null);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const phase = snapshot?.phase ?? "idle";
  const isWorking = busy !== null || ["checking", "downloading", "verifying", "installing"].includes(phase);
  const hasEnvelope = Boolean(envelopeJson?.trim());
  const run = async (kind: "check" | "install" | "rollback") => {
    if (busy) return;
    setBusy(kind);
    try {
      if (kind === "check" && hasEnvelope) await check(envelopeJson!.trim());
      if (kind === "install" && hasEnvelope) await install(envelopeJson!.trim());
      if (kind === "rollback") await rollback();
    } finally {
      setBusy(null);
    }
  };

  const phaseLabel = t(`environmentUpdates.phase.${phase}`);
  const tone = phase === "failed" ? "text-error" : phase === "available" ? "text-accent" : "text-ok";

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
            {(snapshot?.message || error) && (
              <p className={cn("mt-2 text-xs leading-relaxed", error || phase === "failed" ? "text-error" : "text-muted")}>
                {error ?? snapshot?.message}
              </p>
            )}
            {!hasEnvelope && (
              <p className="mt-2 text-xs text-muted">{t("environmentUpdates.configurationMissing")}</p>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              className="flex h-9 items-center gap-1.5 rounded-input bg-surface-2 px-3.5 text-[13px] text-text hover:bg-border/50 disabled:text-muted"
              onClick={() => void run("check")}
              disabled={!hasEnvelope || isWorking}
            >
              {busy === "check" || phase === "checking" ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              {t("environmentUpdates.check")}
            </button>
            <button
              type="button"
              className="flex h-9 items-center gap-1.5 rounded-input bg-accent px-3.5 text-[13px] text-white hover:bg-accent/90 disabled:bg-surface-2 disabled:text-muted"
              onClick={() => void run("install")}
              disabled={!hasEnvelope || isWorking || phase !== "available"}
            >
              {busy === "install" || ["downloading", "verifying", "installing"].includes(phase) ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              {t("environmentUpdates.install")}
            </button>
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
