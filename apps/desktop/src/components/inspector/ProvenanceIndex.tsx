import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileClock, Loader2, Search, ShieldAlert, Terminal } from "lucide-react";
import { provenanceSummary, type ArtifactSummary } from "@/lib/provenance";
import { ProvenancePanel } from "./ProvenancePanel";
import { cn } from "@/lib/cn";
import i18n from "@/i18n";

/**
 * The project-wide provenance index: every artifact that has recorded history,
 * newest activity first, with the per-artifact History expandable in place.
 *
 * `ProvenancePanel` answers "where did THIS file come from?", but it needs a
 * path you already have — which means an artifact nobody thought to open had no
 * way of being noticed. This answers the project-level question instead: what
 * in this workspace is traceable, and what is not.
 *
 * The two untraceable states are called out rather than left to be inferred
 * from an absence: a version with no recorded environment cannot be placed on a
 * machine, and a file with no run behind it can only be reproduced from its
 * recorded code.
 */
export function ProvenanceIndex() {
  const { t } = useTranslation(["inspector", "common"]);
  const [rows, setRows] = useState<ArtifactSummary[] | null>(null);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void provenanceSummary().then((r) => {
      if (!cancelled) setRows(r);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const shown = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    return q ? rows.filter((r) => r.path.toLowerCase().includes(q)) : rows;
  }, [rows, search]);

  if (rows === null) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-muted">
        <Loader2 size={15} className="animate-spin" /> {t("provenance.loadingHistory")}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="p-4 text-sm text-muted">
        {t(
          "provenance.indexEmpty",
          "No artifact in this workspace has recorded provenance yet. History is recorded when the agent writes a file.",
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col">
      {/* Search is worth its space only once the list outgrows a glance. */}
      {rows.length > 6 && (
        <div className="shrink-0 border-b border-border p-2.5">
          <div className="flex items-center gap-2 rounded-input border border-border bg-surface px-2.5 py-1.5">
            <Search size={13} className="shrink-0 text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("provenance.indexSearchPlaceholder", "Filter by path")}
              aria-label={t("provenance.indexSearchPlaceholder", "Filter by path")}
              className="min-w-0 flex-1 bg-transparent text-xs text-text outline-none placeholder:text-muted"
            />
          </div>
        </div>
      )}

      <ul className="min-h-0 flex-1 overflow-y-auto">
        {shown.map((a) => {
          const isOpen = open === a.path;
          return (
            <li key={a.path} className="border-b border-border last:border-b-0">
              <button
                className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-surface-2"
                onClick={() => setOpen(isOpen ? null : a.path)}
                aria-expanded={isOpen}
              >
                <FileClock size={14} className="mt-0.5 shrink-0 text-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-xs text-text" title={a.path}>
                    {a.path}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
                    <span>{t("provenance.indexVersions", { count: a.versions })}</span>
                    <span className="font-mono">{a.tools.join(" · ")}</span>
                    {a.fromRun && (
                      <span
                        className="flex items-center gap-1 text-text"
                        title={t(
                          "provenance.indexFromRunTitle",
                          "A version was produced by executing code, so it has a re-runnable recipe.",
                        )}
                      >
                        <Terminal size={10} /> {t("provenance.indexFromRun", "run-backed")}
                      </span>
                    )}
                    {!a.envComplete && (
                      <span
                        className="flex items-center gap-1 text-warn"
                        title={t(
                          "provenance.indexEnvGapTitle",
                          "At least one version recorded no environment, so it cannot be placed on a machine.",
                        )}
                      >
                        <ShieldAlert size={10} /> {t("provenance.indexEnvGap", "environment gap")}
                      </span>
                    )}
                  </span>
                </span>
                <span className="shrink-0 text-[11px] text-muted">{formatTs(a.lastTs)}</span>
              </button>
              {/* `language` is left unset below: the panel treats it as optional
                  and CodeViewer falls back to plain highlighting. Guessing a
                  language from the extension here would duplicate what the file
                  preview already derives from the file itself. */}
              {isOpen && (
                <div className={cn("border-t border-border bg-surface-2/40")}>
                  <ProvenancePanel path={a.path} />
                </div>
              )}
            </li>
          );
        })}
        {shown.length === 0 && (
          <li className="px-3 py-4 text-xs text-muted">
            {t("provenance.indexNoMatch", "No artifact path matches that filter.")}
          </li>
        )}
      </ul>
    </div>
  );
}

function formatTs(ts: number): string {
  return new Date(ts * 1000).toLocaleString(i18n.language, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
