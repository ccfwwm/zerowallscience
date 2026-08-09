import { ArrowLeft, Cloud, Settings2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Sub2ApiCard } from "@/components/settings/Sub2ApiCard";

export function AuthPage() {
  const navigate = useNavigate();
  const { t } = useTranslation("settings");
  const enterWorkbench = () => navigate("/live", { replace: true });

  return (
    <main className="grid h-screen min-h-[620px] grid-cols-[minmax(320px,0.88fr)_minmax(460px,1.12fr)] bg-bg text-text">
      <section className="relative flex flex-col justify-between overflow-hidden border-r border-border bg-surface px-12 py-10">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-input bg-text text-bg">
            <Cloud size={18} strokeWidth={1.8} />
          </span>
          <span className="text-sm font-semibold">ZeroWall Science</span>
        </div>

        <div className="max-w-md pb-10">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            ZeroWall: Science Without Walls.
          </p>
          <h1 className="text-[42px] font-semibold leading-[1.12] tracking-normal">
            {t("account.title")}
          </h1>
          <p className="mt-5 max-w-sm text-[15px] leading-7 text-muted">
            {t("account.hint")}
          </p>
        </div>

        <span className="text-xs text-muted">Local-first research workbench</span>
      </section>

      <section className="flex items-center justify-center px-12 py-10">
        <div className="w-full max-w-[430px]">
          <div className="mb-7">
            <h2 className="text-2xl font-semibold tracking-normal">{t("account.title")}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">{t("account.hint")}</p>
          </div>

          <Sub2ApiCard bare onLogin={enterWorkbench} />

          <div className="my-7 flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-border" />
            <span>{t("providers.customEndpoint")}</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <button
            type="button"
            onClick={() => navigate("/settings/models?add=provider")}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-input border border-border bg-surface text-sm font-medium text-text transition-colors hover:bg-surface-2"
          >
            <Settings2 size={16} />
            {t("providers.customEndpoint")}
          </button>
          <button
            type="button"
            onClick={enterWorkbench}
            className="mt-3 flex h-10 w-full items-center justify-center gap-2 text-sm text-muted transition-colors hover:text-text"
          >
            <ArrowLeft size={15} />
            {t("nav.back")}
          </button>
        </div>
      </section>
    </main>
  );
}
