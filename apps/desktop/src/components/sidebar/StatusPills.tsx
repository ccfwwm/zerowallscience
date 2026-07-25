import { useTranslation } from "react-i18next";
import type { ModelStatus, RuntimeStatus } from "@zerowall/shared";
import { useRuntimeStore } from "@/lib/runtime";
import { cn } from "@/lib/cn";

const RUNTIME_TONE: Record<RuntimeStatus, string> = {
  ready: "bg-ok",
  connecting: "bg-warn",
  error: "bg-error",
  offline: "bg-muted",
};

const MODEL_TONE: Record<ModelStatus, string> = {
  connected: "bg-ok",
  disconnected: "bg-muted",
  error: "bg-error",
};

export function StatusPills() {
  const { t } = useTranslation("nav");
  // Both live from the runtime: connection status + the configured default model.
  const runtime = useRuntimeStore((s) => s.status);
  const defaultModel = useRuntimeStore((s) => s.defaultModel);
  const model: ModelStatus = defaultModel ? "connected" : "disconnected";

  return (
    <div className="flex flex-col gap-1 text-xs text-muted">
      <Pill
        dot={RUNTIME_TONE[runtime]}
        label={t("status.runtime")}
        value={t(`status.values.${runtime}`)}
      />
      <Pill
        dot={MODEL_TONE[model]}
        label={t("status.model")}
        value={defaultModel ? defaultModel.split("/").pop()! : t("status.modelNotSet")}
      />
    </div>
  );
}

function Pill({ dot, label, value }: { dot: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 px-2">
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dot)} />
      <span className="shrink-0">{label}</span>
      <span className="ml-auto min-w-0 truncate capitalize text-text/70" title={value}>
        {value}
      </span>
    </div>
  );
}
