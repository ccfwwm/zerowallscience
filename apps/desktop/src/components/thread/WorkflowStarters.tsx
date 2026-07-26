import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, FileSearch, FlaskConical, FolderOpen, LineChart } from "lucide-react";
import { installExample, isTauri } from "@/lib/tauri";
import { isGatewayWeb } from "@/lib/webMode";
import { toast } from "@/lib/toast";

export interface WorkflowStarter {
  id: string;
  icon: React.ReactNode;
  /** Sent to the agent as-is — content, not UI copy, so it is never translated.
   *  The card's display title/description live in `session:starters.<id>.*`. */
  prompt: string;
  /** Side effect to run before sending the prompt (e.g. install example files). */
  prepare?: () => Promise<void>;
}

/**
 * The bundled example projects. Each one's README carries its own suggested
 * workflow, so the prompt points the agent there rather than restating the
 * analysis — one place to keep correct instead of two.
 *
 * A picker rather than five more rows on the welcome screen: the starters list
 * is an on-ramp, and eight rows stops being one.
 */
export const EXAMPLE_PROJECTS: { id: string; dir: string; prompt: string }[] = [
  {
    id: "climate",
    dir: "climate-trends",
    prompt:
      "Analyze the real climate dataset at climate-trends/data/gistemp_global_means.csv " +
      "(NASA GISTEMP v4 global land–ocean temperature anomalies in °C vs the 1951–1980 mean; " +
      "the header is on line 2 and missing values are `***` — see climate-trends/README.md). " +
      "Load the annual J-D series, quantify the warming rate (°C/decade) over the full record and " +
      "over 1975–present, compare decadal means, save one publication-quality figure as " +
      "climate-trends/warming_trend.png, and write climate-trends/report.md citing the dataset " +
      "source — every number must come from the code you ran.",
  },
  {
    id: "crispr",
    dir: "crispr-screen",
    prompt:
      "Work through the pooled CRISPR knockout screen in crispr-screen/. Read " +
      "crispr-screen/README.md first — it states that the data is simulated, names the " +
      "generative model, and gives the suggested workflow. Follow that workflow: normalize " +
      "counts, score genes against an empirical null built from the non-targeting guides, " +
      "apply Benjamini-Hochberg, and call hits at FDR < 0.05. Report recall and precision " +
      "against crispr-screen/data/simulation_truth.csv, save a volcano plot, and write " +
      "crispr-screen/report.md. Every number must come from the code you ran, and the report " +
      "must say the data is simulated.",
  },
  {
    id: "enzyme",
    dir: "enzyme-engineering",
    prompt:
      "Work through the enzyme variant landscape in enzyme-engineering/. Read " +
      "enzyme-engineering/README.md first — it states that the data is simulated and gives the " +
      "suggested workflow. Fit both an additive and an epistatic model with cross-validation, " +
      "report how much the pairwise terms add, check the recovered single-mutation effects " +
      "against enzyme-engineering/data/simulation_truth.csv, and rank the unmeasured double " +
      "mutants you would build next. Save a figure and write enzyme-engineering/report.md. " +
      "Every number must come from the code you ran, and the report must say the data is simulated.",
  },
  {
    id: "extremophile",
    dir: "extremophile",
    prompt:
      "Work through the microbial growth curves in extremophile/. Read extremophile/README.md " +
      "first — it states that the data is simulated and gives the suggested workflow. Fit " +
      "logistic growth per curve to get growth rates, then fit a cardinal-temperature model to " +
      "those rates for each strain. Report which curves could not be fitted and why, compare the " +
      "recovered optima against extremophile/data/simulation_truth.csv, save a figure, and write " +
      "extremophile/report.md. Every number must come from the code you ran, and the report must " +
      "say the data is simulated.",
  },
  {
    id: "immunotherapy",
    dir: "immunotherapy",
    prompt:
      "Work through the biomarker cohort in immunotherapy/. Read immunotherapy/README.md " +
      "FIRST and heed it: the patients are simulated, none of them are real people, and nothing " +
      "you produce is clinical evidence — say so in your report. Then follow the suggested " +
      "workflow: fit a logistic response model with cross-validated AUC, compare the " +
      "coefficients against immunotherapy/data/simulation_truth.csv, and split the cohort on the " +
      "median OUT-OF-FOLD score for a Kaplan-Meier and log-rank comparison (scoring patients " +
      "with a model that saw them inflates the separation). Contrast it with a TMB-only split. " +
      "Save a figure and write immunotherapy/report.md; every number must come from the code you ran.",
  },
];

/** One-click full-workflow prompts (P0-1): a single request that carries the
 *  agent through data → code → figure → report, all inside the app. */
export const WORKFLOW_STARTERS: WorkflowStarter[] = [
  {
    id: "demo",
    icon: <FlaskConical size={17} strokeWidth={1.75} />,
    prompt:
      "Run a complete demo analysis end to end: simulate a small dose–response dataset in Python, " +
      "analyze it (fit + summary statistics), save one publication-quality figure as demo_analysis/figure1.png, " +
      "and write demo_analysis/report.md summarizing the findings — every number in the report must come from " +
      "the code you ran. Keep all files in the workspace.",
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
    id: "audit",
    icon: <FileSearch size={17} strokeWidth={1.75} />,
    prompt:
      "Use the traceability-review skill to audit the report or manuscript in my workspace: resolve every " +
      "citation, flag numbers with no traceable source, and check figures against the code that generated them. " +
      "Ask me which document to audit if there is more than one candidate.",
  },
  {
    id: "examples",
    icon: <FolderOpen size={17} strokeWidth={1.75} />,
    // Opens the example picker instead of sending a prompt; the chosen example
    // supplies its own. See `WorkflowStarters`.
    prompt: "",
  },
];

/**
 * Empty-session welcome: a quiet, centered composition in the app's paper
 * aesthetic. The conversation is the point, so the copy invites a message
 * first; the starters below are an optional on-ramp, not a dashboard.
 */
export function WorkflowStarters({ onPick }: { onPick: (prompt: string) => void }) {
  const { t } = useTranslation(["session", "common"]);
  // Which list is showing: the starters, or the example projects behind the
  // "examples" row. A local toggle, not a route — this is a transient choice on
  // an empty session, and it should not survive a navigation.
  const [showExamples, setShowExamples] = useState(false);
  // Display copy per starter id — t()'s generated key type rejects a dynamic
  // `starters.${id}.title` template, so each card's copy is looked up by id
  // from this literal-keyed map instead.
  const starterCopy: Record<string, { title: string; description: string }> = {
    demo: { title: t("starters.demo.title"), description: t("starters.demo.description") },
    analyze: { title: t("starters.analyze.title"), description: t("starters.analyze.description") },
    audit: { title: t("starters.audit.title"), description: t("starters.audit.description") },
    examples: { title: t("starters.examples.title"), description: t("starters.examples.description") },
  };
  const exampleCopy: Record<string, { title: string; description: string }> = {
    climate: { title: t("examples.climate.title"), description: t("examples.climate.description") },
    crispr: { title: t("examples.crispr.title"), description: t("examples.crispr.description") },
    enzyme: { title: t("examples.enzyme.title"), description: t("examples.enzyme.description") },
    extremophile: {
      title: t("examples.extremophile.title"),
      description: t("examples.extremophile.description"),
    },
    immunotherapy: {
      title: t("examples.immunotherapy.title"),
      description: t("examples.immunotherapy.description"),
    },
  };

  // Installing an example unpacks bundle resources through the `install_example`
  // Tauri command, which the web client cannot reach and the gateway does not
  // expose. Sending the prompt anyway would point the agent at files that were
  // never unpacked, so the row is hidden in web mode rather than shipped broken.
  const visibleStarters = isGatewayWeb
    ? WORKFLOW_STARTERS.filter((s) => s.id !== "examples")
    : WORKFLOW_STARTERS;

  /** Install an example's files, then hand its prompt to the composer. */
  const pickExample = (dir: string, prompt: string) => {
    void (async () => {
      try {
        if (isTauri) await installExample(dir);
      } catch (e) {
        toast.error(
          t("starters.error.setup", { message: e instanceof Error ? e.message : String(e) }),
        );
        return;
      }
      onPick(prompt);
    })();
  };

  return (
    <div className="flex min-h-[62vh] flex-col items-center justify-center">
      <div className="w-full max-w-[500px]">
        <div className="text-center">
          <div className="text-[10.5px] font-medium uppercase tracking-[0.2em] text-muted">
            {t("starters.newSession")}
          </div>
          <h2 className="mt-2.5 font-serif text-[26px] leading-tight text-text">
            {showExamples ? t("examples.heading") : t("starters.heading")}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {showExamples ? t("examples.subheading") : t("starters.subheading")}
          </p>
        </div>

        {showExamples ? (
          <>
            <div className="mt-7 overflow-hidden rounded-card border border-border bg-surface shadow-card">
              {EXAMPLE_PROJECTS.map((e) => (
                <button
                  key={e.id}
                  onClick={() => pickExample(e.dir, e.prompt)}
                  className="group flex w-full items-center gap-3.5 border-t border-border px-4 py-3.5 text-left transition-colors first:border-t-0 hover:bg-surface-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-medium text-text">
                      {exampleCopy[e.id]?.title}
                    </span>
                    <span className="mt-0.5 block text-xs leading-snug text-muted">
                      {exampleCopy[e.id]?.description}
                    </span>
                  </span>
                  <ChevronRight
                    size={16}
                    className="shrink-0 text-muted/60 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-muted"
                  />
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowExamples(false)}
              className="mt-3 flex items-center gap-1.5 text-xs text-muted hover:text-text"
            >
              <ChevronLeft size={13} /> {t("examples.back")}
            </button>
          </>
        ) : (
          <div className="mt-7 overflow-hidden rounded-card border border-border bg-surface shadow-card">
            {visibleStarters.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                if (s.id === "examples") {
                  setShowExamples(true);
                  return;
                }
                void (async () => {
                  try {
                    await s.prepare?.();
                  } catch (e) {
                    toast.error(
                      t("starters.error.setup", {
                        message: e instanceof Error ? e.message : String(e),
                      }),
                    );
                    return;
                  }
                  onPick(s.prompt);
                })();
              }}
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
        )}
      </div>
    </div>
  );
}
