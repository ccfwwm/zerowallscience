import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { isTauri, sub2apiAccount, sub2apiRestoreSession } from "@/lib/tauri";
import { isGatewayWeb } from "@/lib/webMode";
import { Sub2ApiCard } from "@/components/settings/Sub2ApiCard";

const SKIP_KEY = "zerowall:loginSkipped";

/**
 * Desktop-only first-launch login gate.
 *
 * On the first app launch (no prior Sub2API session and no skip flag in
 * localStorage), shows a full-screen welcome card with the Sub2ApiCard sign-in
 * form and a "Skip for now" button. Once the user signs in or skips, the
 * children are rendered and all subsequent launches go straight through.
 *
 * Web clients and non-Tauri environments skip this gate entirely.
 */
export function DesktopLoginGate({ children }: { children: ReactNode }) {
  // "null" = still loading; true = gate passed; false = must show gate.
  const [ready, setReady] = useState<boolean | null>(
    !isTauri || isGatewayWeb ? true : null,
  );
  const { t } = useTranslation(["settings"]);

  useEffect(() => {
    if (!isTauri || isGatewayWeb) return;

    // Already skipped in a previous session — pass through.
    if (localStorage.getItem(SKIP_KEY)) {
      setReady(true);
      return;
    }

    let active = true;
    void (async () => {
      try {
        const live = await sub2apiAccount();
        const account = live ?? (await sub2apiRestoreSession());
        if (active) setReady(Boolean(account));
      } catch {
        if (active) setReady(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Still checking — render nothing (flash-free: the check is ~1 IPC call).
  if (ready === null) return null;

  // Gate passed — render the app.
  if (ready) return <>{children}</>;

  const skip = () => {
    localStorage.setItem(SKIP_KEY, "1");
    setReady(true);
  };

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-bg p-6 text-text">
      <div className="w-full max-w-md rounded-card border border-border bg-surface p-7 shadow-xl">
        <h1 className="text-lg font-semibold">{t("sub2api.welcomeTitle")}</h1>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          {t("sub2api.welcomeHint")}
        </p>

        <div className="mt-5">
          <Sub2ApiCard onLogin={() => setReady(true)} bare />
        </div>

        <button
          type="button"
          onClick={skip}
          className="mt-4 w-full text-center text-sm text-muted transition-colors hover:text-text"
        >
          {t("sub2api.skipForNow")}
        </button>
      </div>
    </div>
  );
}
