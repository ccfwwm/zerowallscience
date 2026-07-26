import { memo, useEffect, useMemo, useState } from "react";
import { ChevronDown, RotateCcw, ShieldCheck, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { RESOLUTION_ACTIONS, type FindingLevel, type ResolutionAction, type ReviewerBlock } from "@zerowall/shared";
import { cn } from "@/lib/cn";
import {
  canPersistReview,
  reopenClaim,
  resolveClaim,
  syncReview,
  type StoredFinding,
  type StoredReview,
} from "@/lib/review";

const BADGE: Record<FindingLevel, { className: string }> = {
  warn: { className: "bg-warn/15 text-warn ring-warn/30" },
  ok: { className: "bg-ok/15 text-ok ring-ok/30" },
  error: { className: "bg-error/15 text-error ring-error/30" },
};

/** Structured reviewer findings. Dismissal is a session-local reading aid —
 *  the underlying review text stays in the conversation. Resolution is the
 *  opposite: it is persisted to the workspace's science database (M006), so a
 *  finding stays resolved across restarts and can be reopened. */
export const ReviewerCard = memo(function ReviewerCard({
  block,
  sessionId,
}: {
  block: ReviewerBlock;
  /** The session this card's thread belongs to. Claims hang off a session row,
   *  so persistence needs it; findings are matched to stored claims by
   *  position. Passed down rather than read from the focused-session global —
   *  a tiled pane showing a background session must file its claims under that
   *  session, not under whichever pane happens to have focus. Persistence is
   *  off when absent (an unsent draft has no session row yet). */
  sessionId?: string | null;
}) {
  const { t } = useTranslation(["session", "common"]);
  const [open, setOpen] = useState(true);
  const [dismissed, setDismissed] = useState<ReadonlySet<number>>(new Set());
  const visible = block.findings
    .map((f, i) => [f, i] as const)
    .filter(([, i]) => !dismissed.has(i));

  const [stored, setStored] = useState<StoredReview | null>(null);
  const persistable = canPersistReview && !!sessionId && block.findings.length > 0;

  // The thread rebuilds its block objects as a message streams, so depending on
  // the object identity would re-hit the database on every event. The review's
  // content is what identifies the stored run, so depend on that instead.
  const body = useMemo(() => JSON.stringify(block), [block]);

  useEffect(() => {
    if (!persistable || !sessionId) return;
    let cancelled = false;
    void (async () => {
      try {
        const review = await syncReview(sessionId, JSON.parse(body) as ReviewerBlock);
        if (!cancelled) setStored(review);
      } catch {
        // Persistence is an enhancement over the rendered review: the findings
        // are already in the conversation, so a failed write leaves a read-only
        // card rather than an error state.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [persistable, sessionId, body]);

  return (
    <div className="rounded-card border border-border bg-surface shadow-card">
      <button
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <ShieldCheck size={16} className="text-muted" />
        <span className="text-sm font-medium text-text">{t("reviewer.heading")}</span>
        <span className="text-sm text-muted">
          {t("reviewer.findingCount", { count: visible.length })}
          {dismissed.size > 0 && ` ${t("reviewer.dismissedCount", { count: dismissed.size })}`}
        </span>
        <ChevronDown
          size={16}
          className={cn("ml-auto text-muted transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="space-y-3 px-4 pb-4">
          {visible.map(([f, i]) => {
            const badge = BADGE[f.level];
            return (
              <div key={i} className="group space-y-1.5">
                <div className="flex flex-wrap items-start gap-2">
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-xs font-medium ring-1",
                      badge.className,
                    )}
                  >
                    {t(`reviewer.badge.${f.level}`)}
                  </span>
                  {(f.tag || f.check) && (
                    <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs text-muted ring-1 ring-border">
                      {f.tag ?? (f.check ? t(`reviewer.checkTag.${f.check}`) : "")}
                    </span>
                  )}
                  <span className="text-sm font-medium text-text">{f.title}</span>
                  <button
                    className="ml-auto shrink-0 text-muted opacity-0 hover:text-text group-hover:opacity-100"
                    aria-label={t("reviewer.dismissAria", { title: f.title })}
                    title={t("reviewer.dismissTitle")}
                    onClick={() => setDismissed(new Set([...dismissed, i]))}
                  >
                    <X size={14} />
                  </button>
                </div>
                {f.evidence && (
                  <p className="whitespace-pre-wrap font-mono text-[12.5px] leading-relaxed text-muted">
                    {f.evidence}
                  </p>
                )}
                <ResolutionControls
                  claim={stored?.findings[i]}
                  title={f.title}
                  onChanged={setStored}
                />
              </div>
            );
          })}
          {visible.length === 0 && block.findings.length > 0 && (
            <p className="text-sm text-muted">{t("reviewer.allDismissed")}</p>
          )}
          {block.note && <p className="text-sm text-muted">{block.note}</p>}
        </div>
      )}
    </div>
  );
});

/**
 * Resolve / reopen one finding. Renders nothing until the claim is persisted,
 * which is also how the card stays read-only in the gateway web client — the
 * science database is a file inside the workspace, unreachable over HTTP, so
 * `syncReview` never returns there.
 *
 * Wraps at phone width: the label, the control and the reopen button are
 * separate flex children rather than one row.
 */
function ResolutionControls({
  claim,
  title,
  onChanged,
}: {
  claim: StoredFinding | undefined;
  title: string;
  onChanged: (review: StoredReview) => void;
}) {
  const { t } = useTranslation(["session", "common"]);
  const [busy, setBusy] = useState(false);
  if (!claim) return null;

  const run = async (call: () => Promise<StoredReview | null>) => {
    setBusy(true);
    try {
      const review = await call();
      if (review) onChanged(review);
    } catch {
      // Leave the current state visible; the finding itself is unaffected.
    } finally {
      setBusy(false);
    }
  };

  if (claim.status === "resolved") {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded bg-surface-2 px-1.5 py-0.5 text-muted ring-1 ring-border">
          {t("reviewer.resolve.resolved", {
            action: t(`reviewer.resolve.action.${claim.resolution ?? "verified"}`),
          })}
        </span>
        <button
          className="inline-flex items-center gap-1 text-muted hover:text-text disabled:opacity-60"
          aria-label={t("reviewer.resolve.reopenAria", { title })}
          disabled={busy}
          onClick={() => void run(() => reopenClaim(claim.claimId))}
        >
          <RotateCcw size={12} /> {t("reviewer.resolve.reopen")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <select
        className="rounded-input border border-border bg-surface-2 px-1.5 py-1 text-xs text-text disabled:opacity-60"
        aria-label={t("reviewer.resolve.aria", { title })}
        value=""
        disabled={busy}
        onChange={(e) => {
          const action = e.target.value as ResolutionAction;
          if (action) void run(() => resolveClaim(claim.claimId, action));
        }}
      >
        <option value="">{t("reviewer.resolve.prompt")}</option>
        {RESOLUTION_ACTIONS.map((action) => (
          <option key={action} value={action}>
            {t(`reviewer.resolve.action.${action}`)}
          </option>
        ))}
      </select>
      {claim.resolution && (
        // Reopened: the last verdict is history worth showing, and it explains
        // why the claim is open again rather than never judged.
        <span className="text-muted">
          {t("reviewer.resolve.previously", {
            action: t(`reviewer.resolve.action.${claim.resolution}`),
          })}
        </span>
      )}
    </div>
  );
}
