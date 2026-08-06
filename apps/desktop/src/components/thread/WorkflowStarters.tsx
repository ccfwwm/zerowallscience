import { useTranslation } from "react-i18next";
import { BookOpen, ChevronRight, FileText, FlaskConical, Search } from "lucide-react";
export interface WorkflowStarter {
  id: string;
  workflowId: string;
  icon: React.ReactNode;
  /** Sent to the agent as-is — content, not UI copy, so it is never translated.
   *  The card's display title/description live in `session:starters.<id>.*`. */
  prompt: string;
}

/** The four shipped workflows are a compact on-ramp for a new research session. */
export const WORKFLOW_STARTERS: WorkflowStarter[] = [
  {
    id: "literature",
    workflowId: "literature-evidence-review",
    icon: <BookOpen size={17} strokeWidth={1.8} />,
    prompt: "Run the literature evidence review workflow for this research question.",
  },
  {
    id: "search",
    workflowId: "paper-search-deduplication",
    icon: <Search size={17} strokeWidth={1.8} />,
    prompt: "Run the paper search and deduplication workflow.",
  },
  {
    id: "reproducible",
    workflowId: "reproducible-experiment",
    icon: <FlaskConical size={17} strokeWidth={1.8} />,
    prompt: "Run the reproducible experiment workflow for this analysis.",
  },
  {
    id: "report",
    workflowId: "report-generation",
    icon: <FileText size={17} strokeWidth={1.8} />,
    prompt: "Run the report generation workflow from the selected evidence.",
  },
];

/**
 * Empty-session welcome: a quiet, centered composition in the app's paper
 * aesthetic. The workflow rows are an optional on-ramp, not a dashboard.
 */
export function WorkflowStarters({ onPick }: { onPick: (starter: WorkflowStarter) => void }) {
  const { t } = useTranslation(["session", "common"]);
  // Card copy is looked up per starter id at `session:starters.<id>.{title,
  // description}`. t()'s generated key type rejects a dynamic template, so we
  // read through a plain string signature — the card grid is data-driven off
  // WORKFLOW_STARTERS, so re-adding a starter needs no change here.
  const tk = t as (key: string) => string;

  return (
    <div className="flex min-h-[62vh] flex-col items-center justify-center">
      <div className="w-full max-w-[500px]">
        <div className="text-center">
          <div className="text-[10.5px] font-medium uppercase tracking-[0.2em] text-muted">
            {t("starters.newSession")}
          </div>
          <h2 className="mt-2.5 font-serif text-[26px] leading-tight text-text">
            {t("starters.heading")}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">{t("starters.subheading")}</p>
        </div>

        {WORKFLOW_STARTERS.length > 0 && (
          <div className="mt-7 overflow-hidden rounded-card border border-border bg-surface shadow-card">
            {WORKFLOW_STARTERS.map((s) => (
              <button
                key={s.id}
                onClick={() => onPick(s)}
                className="group flex w-full items-center gap-3.5 border-t border-border px-4 py-3.5 text-left transition-colors first:border-t-0 hover:bg-surface-2"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2 text-accent ring-1 ring-border transition-colors group-hover:bg-surface">
                  {s.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-medium text-text">
                    {tk(`starters.${s.id}.title`)}
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-muted">
                    {tk(`starters.${s.id}.description`)}
                  </span>
                </span>
                <ChevronRight
                  size={16}
                  className="shrink-0 text-muted/60 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-muted"
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
