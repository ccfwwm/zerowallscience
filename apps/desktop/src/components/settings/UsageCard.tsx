import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { WorkspaceUsage } from "@zerowall/shared";
import { usageByWorkspace } from "@/lib/usage";
import { formatCount } from "@/lib/usageFormat";
import { Section } from "./Section";
import i18n from "@/i18n";

/**
 * Settings → Usage: cumulative token totals for the workspace, plus a
 * per-session table (busiest first). Pure display of what the runtime already
 * recorded — no writes — so it works over the gateway web client too (unlike
 * the desktop-only cards) and is never hidden behind `isGatewayWeb`.
 *
 * Fees are intentionally excluded. This surface reports usage, not billing.
 */
export function UsageCard() {
  const { t } = useTranslation(["usage"]);
  const [data, setData] = useState<WorkspaceUsage | null>(null);
  const locale = i18n.language;
  const count = (n: number) => formatCount(n, locale);

  useEffect(() => {
    let active = true;
    void usageByWorkspace().then((d) => {
      if (active) setData(d);
    });
    return () => {
      active = false;
    };
  }, []);

  const label = (raw: string) => (raw.trim() ? raw : t("settings.untitled"));

  return (
    <Section title={t("settings.title")} hint={t("settings.description")} flush>
      {data === null ? (
        <div className="flex items-center gap-2 px-4 py-3.5 text-[13px] text-muted">
          <Loader2 size={14} className="animate-spin" /> {t("settings.loading")}
        </div>
      ) : data.sessions.length === 0 ? (
        <div className="px-4 py-3.5">
          <div className="text-[13px] font-medium text-text">{t("settings.empty.title")}</div>
          <p className="mt-1 text-xs leading-relaxed text-muted">{t("settings.empty.body")}</p>
        </div>
      ) : (
        <div>
          {/* Cumulative token tiles collapse to two columns on phone width. */}
          <div className="grid grid-cols-2 gap-px bg-faint sm:grid-cols-3">
            <Tile label={t("settings.tiles.input")} value={count(data.total.input)} />
            <Tile label={t("settings.tiles.output")} value={count(data.total.output)} />
            <Tile label={t("settings.tiles.reasoning")} value={count(data.total.reasoning)} />
            <Tile
              label={t("settings.tiles.cached")}
              value={count(data.total.cacheRead + data.total.cacheWrite)}
            />
            <Tile label={t("settings.tiles.replies")} value={count(data.total.replies)} />
          </div>

          {/* Per-session table. Horizontally scrollable so the numeric columns
              never squeeze the session label on a phone. */}
          <div className="overflow-x-auto border-t border-faint">
            <table className="w-full min-w-[32rem] text-[13px]">
              <thead>
                <tr className="border-b border-faint text-left text-xs text-muted">
                  <th className="px-4 py-2 font-medium">{t("settings.table.session")}</th>
                  <th className="px-3 py-2 text-right font-medium tabular-nums">{t("settings.table.input")}</th>
                  <th className="px-3 py-2 text-right font-medium tabular-nums">{t("settings.table.output")}</th>
                  <th className="px-3 py-2 text-right font-medium tabular-nums">{t("settings.table.reasoning")}</th>
                  <th className="px-3 py-2 text-right font-medium tabular-nums">{t("settings.table.cached")}</th>
                  <th className="px-3 py-2 text-right font-medium tabular-nums">{t("settings.table.replies")}</th>
                </tr>
              </thead>
              <tbody>
                {data.sessions.map((s) => (
                  <tr key={s.sessionId} className="border-b border-faint last:border-0">
                    <td className="max-w-[14rem] truncate px-4 py-2 text-text">{label(s.title)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted">{count(s.input)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted">{count(s.output)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted">{count(s.reasoning)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted">
                      {count(s.cacheRead + s.cacheWrite)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted">{count(s.replies)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Section>
  );
}

/** One cumulative-total tile: a large locale-grouped number over its label.
 *  Optional `hint` renders below the label in a smaller muted style. */
function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-surface px-4 py-3">
      <div className="text-lg font-semibold tabular-nums text-text">{value}</div>
      <div className="mt-0.5 text-xs text-muted">{label}</div>
      {hint && <div className="text-xs text-muted/60">{hint}</div>}
    </div>
  );
}
