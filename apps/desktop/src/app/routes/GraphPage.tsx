import { useTranslation } from "react-i18next";
import { ResearchGraphView } from "@/components/inspector/ResearchGraphView";
import { ProvenanceIndex } from "@/components/inspector/ProvenanceIndex";
import { isGatewayWeb } from "@/lib/webMode";

/**
 * The project-level view of the work: how the pieces relate (the research
 * graph) and where each artifact came from (the provenance index).
 *
 * A full page rather than a side pane: both views are project-scoped (not
 * session-scoped) and need the width. Desktop only — the graph reads the
 * workspace's local science database and the index reads
 * `.zerowall/provenance.jsonl`, so the sidebar hides this entry in the gateway
 * web client.
 *
 * The two are on one page because they answer halves of the same question.
 * The graph shows what relates to what; the index shows what is traceable and
 * what has a gap. Split across two routes, a user checking reproducibility
 * would have to know to visit both.
 */
export function GraphPage() {
  const { t } = useTranslation(["pages", "inspector", "common"]);
  // The sidebar hides this entry in the web client, but the route is still
  // reachable by URL. Without this, a web visitor would get an empty graph and
  // "no artifact has recorded provenance" — which asserts the project is empty
  // when the truth is that this client cannot read it.
  if (isGatewayWeb) {
    return (
      <div className="mx-auto w-full max-w-5xl px-8 py-6">
        <h1 className="font-serif text-xl text-text">{t("graph.title", "Research Graph")}</h1>
        <p className="mt-3 text-sm text-muted">
          {t(
            "graph.desktopOnly",
            "The research graph and provenance index read the workspace's local database and files, which the web client has no route to. Open this project in the desktop app to see them.",
          )}
        </p>
      </div>
    );
  }
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-8 py-6">
        <h1 className="font-serif text-xl text-text">{t("graph.title", "Research Graph")}</h1>
        <p className="mt-1 text-sm text-muted">
          {t(
            "graph.description",
            "How this project's artifacts, review claims, annotations, and memories relate.",
          )}
        </p>
        <div className="mt-4 h-[420px] overflow-hidden rounded-card border border-border bg-surface">
          <ResearchGraphView />
        </div>

        <h2 className="mt-8 font-serif text-lg text-text">
          {t("graph.provenanceTitle", "Artifact provenance")}
        </h2>
        <p className="mt-1 text-sm text-muted">
          {t(
            "graph.provenanceDescription",
            "Every artifact with recorded history, newest first. Expand one to see the code, environment, and conversation behind each version.",
          )}
        </p>
        <div className="mt-4 max-h-[520px] overflow-hidden rounded-card border border-border bg-surface">
          <ProvenanceIndex />
        </div>
      </div>
    </div>
  );
}
