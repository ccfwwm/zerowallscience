import { useEffect, useState, type ReactNode } from "react";
import { Download, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useEnvironmentUpdateStore } from "@/lib/environment-update";
import { useRuntimeStore } from "@/lib/runtime";
import { isTauri } from "@/lib/tauri";
import { isGatewayWeb } from "@/lib/webMode";

export function DesktopEnvironmentGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation("settings");
  const snapshot = useEnvironmentUpdateStore((state) => state.snapshot);
  const error = useEnvironmentUpdateStore((state) => state.error);
  const refresh = useEnvironmentUpdateStore((state) => state.refresh);
  const check = useEnvironmentUpdateStore((state) => state.check);
  const install = useEnvironmentUpdateStore((state) => state.install);
  const agentTurns = useRuntimeStore((state) => Object.keys(state.runningSessions).length);
  const workflowRuns = useRuntimeStore(
    (state) =>
      Object.values(state.workflowRuns).filter((run) =>
        ["pending", "running", "paused"].includes(run.state),
      ).length,
  );
  const [loaded, setLoaded] = useState(!isTauri || isGatewayWeb);
  const [busy, setBusy] = useState(false);
  const [bypassed, setBypassed] = useState(false);

  useEffect(() => {
    if (!isTauri || isGatewayWeb) return;
    let active = true;
    void refresh().finally(() => {
      if (active) setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [refresh]);

  if (!isTauri || isGatewayWeb || bypassed || snapshot?.currentVersion) {
    return <>{children}</>;
  }

  if (!loaded) return <div className="h-screen w-screen bg-bg" />;

  const installEnvironment = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const checked = await check();
      if (!checked || checked.phase !== "available") return;
      const installed = await install({
        agentTurns,
        workflowRuns,
        mcpMutations: 0,
        runActivities: 0,
      });
      if (!installed?.currentVersion) return;
      await useRuntimeStore.getState().bootstrap();
      setBypassed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex h-screen w-screen items-center justify-center bg-bg px-8 text-text">
      <div className="w-full max-w-[420px]">
        {/* eslint-disable-next-line i18next/no-literal-string -- product brand name is locale-independent */}
        <div className="mb-9 text-sm font-semibold tracking-normal text-text">ZeroWall Science</div>
        <h1 className="text-3xl font-semibold leading-tight tracking-normal">
          {t("environmentUpdates.setupTitle")}
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted">{t("environmentUpdates.setupHint")}</p>
        {error && <p className="mt-4 text-sm leading-6 text-error">{error}</p>}
        <button
          type="button"
          onClick={() => void installEnvironment()}
          disabled={busy}
          className="mt-8 flex h-11 w-full items-center justify-center gap-2 rounded-input bg-accent px-4 text-sm font-medium text-accent-fg transition-colors hover:bg-accent/90 disabled:bg-surface-2 disabled:text-muted"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
          {busy
            ? t("environmentUpdates.setupPreparing")
            : t("environmentUpdates.setupInstall")}
        </button>
        <button
          type="button"
          onClick={() => setBypassed(true)}
          disabled={busy}
          className="mt-3 h-10 w-full text-sm text-muted transition-colors hover:text-text disabled:text-muted"
        >
          {t("environmentUpdates.setupSkip")}
        </button>
      </div>
    </main>
  );
}
