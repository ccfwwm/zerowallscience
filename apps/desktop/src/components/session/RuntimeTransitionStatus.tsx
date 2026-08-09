import type { RuntimeStatus } from "@zerowall/shared";
import { Loader2, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";

export function shouldShowEnvironmentTransition(status: RuntimeStatus, switching: boolean) {
  return status === "connecting" && !switching;
}

export function RuntimeTransitionStatus({
  kind,
  compact = false,
}: {
  kind: "environment" | "selection";
  compact?: boolean;
}) {
  const { t } = useTranslation("session");
  const label = kind === "environment"
    ? t("live.runtime.preparing")
    : t("live.runtime.switchingSelection");

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center border border-border/80 bg-surface/95 text-muted shadow-card backdrop-blur-sm",
        compact
          ? "gap-2 rounded-full px-3 py-2 text-xs"
          : "w-[min(360px,calc(100%-32px))] flex-col gap-3 rounded-card px-6 py-5 text-sm",
      )}
    >
      <span className="relative flex h-7 w-7 shrink-0 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-accent/15" />
        <Loader2 size={compact ? 15 : 20} className="relative animate-spin text-accent" />
      </span>
      <span className="font-medium text-text">{label}</span>
      <span
        data-runtime-progress
        className={cn(
          "relative overflow-hidden rounded-full bg-surface-3",
          compact ? "h-1 w-20" : "h-1 w-full",
        )}
      >
        <span className="runtime-progress-bar absolute inset-y-0 w-2/5 rounded-full bg-accent" />
      </span>
    </div>
  );
}

export function RuntimeUnavailableStatus({
  detail,
  onRetry,
}: {
  detail?: string | null;
  onRetry: () => void;
}) {
  const { t } = useTranslation("session");
  return (
    <div className="w-[min(360px,calc(100%-32px))] rounded-card border border-border bg-surface px-6 py-5 text-center shadow-card">
      <div className="text-sm font-medium text-text">{t("live.runtime.unavailable")}</div>
      {detail && <p className="mt-2 line-clamp-3 text-xs leading-5 text-muted">{detail}</p>}
      <button
        type="button"
        onClick={onRetry}
        className="mx-auto mt-4 inline-flex items-center gap-2 rounded-input border border-border px-3 py-2 text-xs font-medium text-text hover:bg-surface-2"
      >
        <RotateCcw size={14} />
        {t("live.runtime.retry")}
      </button>
    </div>
  );
}
