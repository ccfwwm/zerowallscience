import { useTranslation } from "react-i18next";
import {
  BookOpenCheck,
  ChevronRight,
  FileSearch,
  FlaskConical,
  LineChart,
} from "lucide-react";
export interface WorkflowStarter {
  id: string;
  icon: React.ReactNode;
  /** Sent to the agent as-is — content, not UI copy, so it is never translated.
   *  The card's display title/description live in `session:starters.<id>.*`. */
  prompt: string;
}

/**
 * The default on-ramp: one row per capability that is ZeroWall's own, not a
 * bundled dataset.
 *
 * This list used to lead with five example projects. They demoed the product
 * with other people's data instead of showing what it does — a reproducible
 * run with a provenance record, literature that resolves to real citations,
 * and an audit that catches numbers with no traceable source. Each prompt
 * exercises a first-party skill from `runtime/skills/` that ships enabled.
 */
export const WORKFLOW_STARTERS: WorkflowStarter[] = [
  {
    id: "reproducible",
    icon: <FlaskConical size={17} strokeWidth={1.75} />,
    prompt:
      "Run a complete analysis end to end in this workspace: simulate a small dose–response dataset " +
      "in Python with a fixed seed, fit it, and save one figure as analysis/figure1.png using the " +
      "publication-figures skill. Then write analysis/report.md. Apply the stats-integrity skill to " +
      "check the statistics, record the environment (interpreter and package versions) alongside the " +
      "results, and make every number in the report traceable to the code that produced it. " +
      "Keep all files in the workspace.",
  },
  {
    id: "analyze",
    icon: <LineChart size={17} strokeWidth={1.75} />,
    prompt:
      "Analyze the data file I added to the workspace end to end: explore it, run the analysis in code, " +
      "save at least one figure as a PNG, and write report.md with the findings — every number traced to " +
      "the code that produced it. Ask me which file to use if there is more than one candidate.",
  },
  {
    id: "literature",
    icon: <BookOpenCheck size={17} strokeWidth={1.75} />,
    prompt:
      "Use the literature-review skill to survey the topic I name next. Search the literature through the " +
      "enabled connectors, build an evidence table with one row per paper (claim, method, sample size, " +
      "limitation), resolve every citation to a real DOI or arXiv id, and write literature/review.md. " +
      "Say explicitly which claims you could not source. Ask me for the topic first.",
  },
  {
    id: "audit",
    icon: <FileSearch size={17} strokeWidth={1.75} />,
    prompt:
      "Use the traceability-review skill to audit the report or manuscript in my workspace: resolve every " +
      "citation, flag numbers with no traceable source, and check figures against the code that generated them. " +
      "Ask me which document to audit if there is more than one candidate.",
  },
];

/**
 * Empty-session welcome: a quiet, centered composition in the app's paper
 * aesthetic. The conversation is the point, so the copy invites a message
 * first; the starters below are an optional on-ramp, not a dashboard.
 */
export function WorkflowStarters({ onPick }: { onPick: (prompt: string) => void }) {
  const { t } = useTranslation(["session", "common"]);
  // Display copy per starter id — t()'s generated key type rejects a dynamic
  // `starters.${id}.title` template, so each card's copy is looked up by id
  // from this literal-keyed map instead.
  const starterCopy: Record<string, { title: string; description: string }> = {
    reproducible: {
      title: t("starters.reproducible.title"),
      description: t("starters.reproducible.description"),
    },
    analyze: { title: t("starters.analyze.title"), description: t("starters.analyze.description") },
    literature: {
      title: t("starters.literature.title"),
      description: t("starters.literature.description"),
    },
    audit: { title: t("starters.audit.title"), description: t("starters.audit.description") },
  };

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

        <div className="mt-7 overflow-hidden rounded-card border border-border bg-surface shadow-card">
          {WORKFLOW_STARTERS.map((s) => (
            <button
              key={s.id}
              onClick={() => onPick(s.prompt)}
              className="group flex w-full items-center gap-3.5 border-t border-border px-4 py-3.5 text-left transition-colors first:border-t-0 hover:bg-surface-2"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2 text-accent ring-1 ring-border transition-colors group-hover:bg-surface">
                {s.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-medium text-text">
                  {starterCopy[s.id]?.title}
                </span>
                <span className="mt-0.5 block text-xs leading-snug text-muted">
                  {starterCopy[s.id]?.description}
                </span>
              </span>
              <ChevronRight
                size={16}
                className="shrink-0 text-muted/60 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-muted"
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
