import { useTranslation } from "react-i18next";
import { ResearchGraphView } from "@/components/inspector/ResearchGraphView";

/**
 * The research graph for the active workspace: its artifact versions, the
 * review claims raised against them, the annotations anchored to them, and the
 * memories kept from the work — and how those relate.
 *
 * A full page rather than a side pane: the graph is project-scoped (not
 * session-scoped) and needs the width. Desktop only — the view reads the
 * workspace's local science database, so the sidebar hides this entry in the
 * gateway web client.
 */
export function GraphPage() {
  const { t } = useTranslation(["pages", "common"]);
  return (
    <div className="flex h-full flex-col">
      <div className="mx-auto w-full max-w-5xl shrink-0 px-8 pb-2 pt-6">
        <h1 className="font-serif text-xl text-text">{t("graph.title", "Research Graph")}</h1>
        <p className="mt-1 text-sm text-muted">
          {t(
            "graph.description",
            "How this project's artifacts, review claims, annotations, and memories relate.",
          )}
        </p>
      </div>
      <div className="mx-auto min-h-0 w-full max-w-5xl flex-1 px-8 pb-6">
        <div className="h-full overflow-hidden rounded-card border border-border bg-surface">
          <ResearchGraphView />
        </div>
      </div>
    </div>
  );
}
