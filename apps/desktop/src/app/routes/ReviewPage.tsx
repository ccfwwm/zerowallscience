import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, PlayCircle, RotateCcw, ShieldCheck, X } from "lucide-react";
import { RESOLUTION_ACTIONS, type FindingLevel, type ResolutionAction } from "@zerowall/shared";
import {
  listReviews,
  reopenClaim,
  resolveClaim,
  type StoredReviewFinding,
  type StoredReviewRun,
} from "@/lib/review";
import { PaneTitlebarInset } from "@/components/inspector/RightPane";
import { useRuntimeStore } from "@/lib/runtime";
import { isGatewayWeb } from "@/lib/webMode";
import { cn } from "@/lib/cn";
import i18n from "@/i18n";

const BADGE: Record<FindingLevel, string> = {
  warn: "bg-warn/15 text-warn ring-warn/30",
  ok: "bg-ok/15 text-ok ring-ok/30",
  error: "bg-error/15 text-error ring-error/30",
};

const REVIEW_ENGINES = [
  { id: "codex", label: "Codex" },
  { id: "claude-code", label: "Claude Code" },
  { id: "opencode", label: "OpenCode" },
] as const;

/**
 * The persisted review ledger — every ```review``` run this session filed into
 * the M006 store, newest first, with each finding's verdict, evidence, and
 * resolution state. Read-only browsing of what the inline cards already showed,
 * plus the same resolve/reopen controls so a finding can be judged from here.
 *
 * Desktop only: the science database is a file inside the workspace, so
 * `listReviews` returns null over the gateway web client and the view shows its
 * unavailable state instead of an empty list that never fills.
 */
function ReviewView({ sessionId }: { sessionId?: string }) {
  const { t } = useTranslation(["review", "session", "common"]);
  const [runs, setRuns] = useState<StoredReviewRun[] | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading");
  const activeEngine = useRuntimeStore((s) => s.acpProfileId);
  const activeModel = useRuntimeStore((s) => s.defaultModel);
  const providers = useRuntimeStore((s) => s.providers);
  const runReview = useRuntimeStore((s) => s.runReview);
  const [reviewEngine, setReviewEngine] = useState(activeEngine ?? "opencode");
  const [reviewModel, setReviewModel] = useState(activeModel ?? "");
  const models = providers.flatMap((provider) => provider.models.map((model) => ({
    id: `${provider.id}/${model.id}`,
    label: `${provider.name} / ${model.name}`,
  })));

  const reload = useCallback(() => {
    if (!sessionId) {
      setRuns([]);
      setState("ready");
      return;
    }
    let cancelled = false;
    void listReviews(sessionId).then((rows) => {
      if (cancelled) return;
      if (rows === null) {
        setState("unavailable");
        return;
      }
      setRuns(rows);
      setState("ready");
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => reload(), [reload]);

  const onClaimChanged = () => reload();

  const runSelectedReview = () => {
    if (sessionId) void runReview(sessionId, reviewEngine, reviewModel || undefined);
  };

  if (state === "unavailable") {
    return <p className="mt-8 text-center text-sm text-muted">{t("unavailable")}</p>;
  }
  if (state === "loading") {
    return (
      <div className="mt-8 flex items-center gap-2 text-sm text-muted">
        <Loader2 size={15} className="animate-spin" /> {t("loading")}
      </div>
    );
  }
  if (!runs || runs.length === 0) {
    return (
      <div className="mt-8 rounded-input border border-dashed border-border bg-surface px-4 py-8 text-center">
        <ShieldCheck size={22} className="mx-auto text-muted" strokeWidth={1.5} />
        <p className="mt-2 text-sm font-medium text-text">{t("empty.title")}</p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-muted">{t("empty.body")}</p>
        <ReviewSelection
          engine={reviewEngine}
          model={reviewModel}
          models={models}
          onEngineChange={setReviewEngine}
          onModelChange={setReviewModel}
        />
        {sessionId && (
          <button
            className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:opacity-90"
            onClick={runSelectedReview}
          >
            <PlayCircle size={13} /> {t("runReview")}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mt-1 space-y-5">
      <ReviewSelection
        engine={reviewEngine}
        model={reviewModel}
        models={models}
        onEngineChange={setReviewEngine}
        onModelChange={setReviewModel}
      />
      <button
        className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:opacity-90"
        onClick={runSelectedReview}
      >
        <PlayCircle size={13} /> {t("runReview")}
      </button>
      {runs.map((run) => (
        <section key={run.runId}>
          <div className="sticky top-0 z-10 flex items-center gap-2 bg-bg/95 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted backdrop-blur">
            <span>{t("runOn", { when: absoluteTs(run.createdAt) })}</span>
            <span className="text-muted/70">{t("findingCount", { count: run.findings.length })}</span>
          </div>
          <ul className="mt-1 space-y-3">
            {run.findings.map((f) => (
              <FindingRow key={f.claimId} finding={f} onChanged={onClaimChanged} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** One persisted finding: badge, title, evidence, and its resolve/reopen
 *  control — the same four-verdict flow the inline card offers, driven off the
 *  stored claim rather than a live ```review``` block. */
function FindingRow({ finding, onChanged }: { finding: StoredReviewFinding; onChanged: () => void }) {
  const { t } = useTranslation(["review", "session", "common"]);
  const [busy, setBusy] = useState(false);

  const run = async (call: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await call();
      onChanged();
    } catch {
      // Leave the current state; the finding itself is unaffected.
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="space-y-1.5 rounded-card border border-border bg-surface px-3 py-2.5">
      <div className="flex flex-wrap items-start gap-2">
        <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium ring-1", BADGE[finding.level as FindingLevel] ?? BADGE.warn)}>
          {t(`session:reviewer.badge.${finding.level}`)}
        </span>
        {finding.checkKind && finding.checkKind !== "review" && (
          <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs text-muted ring-1 ring-border">{finding.checkKind}</span>
        )}
        <span className="text-sm font-medium text-text">{finding.title}</span>
      </div>
      {finding.evidence && (
        <p className="whitespace-pre-wrap font-mono text-[12.5px] leading-relaxed text-muted">{finding.evidence}</p>
      )}

      {finding.status === "resolved" ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded bg-surface-2 px-1.5 py-0.5 text-muted ring-1 ring-border">
            {t("session:reviewer.resolve.resolved", {
              action: t(`session:reviewer.resolve.action.${finding.resolution ?? "verified"}`),
            })}
          </span>
          <button
            className="inline-flex items-center gap-1 text-muted hover:text-text disabled:opacity-60"
            aria-label={t("session:reviewer.resolve.reopenAria", { title: finding.title })}
            disabled={busy}
            onClick={() => void run(() => reopenClaim(finding.claimId))}
          >
            <RotateCcw size={12} /> {t("session:reviewer.resolve.reopen")}
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select
            className="rounded-input border border-border bg-surface-2 px-1.5 py-1 text-xs text-text disabled:opacity-60"
            aria-label={t("session:reviewer.resolve.aria", { title: finding.title })}
            value=""
            disabled={busy}
            onChange={(e) => {
              const action = e.target.value as ResolutionAction;
              if (action) void run(() => resolveClaim(finding.claimId, action));
            }}
          >
            <option value="">{t("session:reviewer.resolve.prompt")}</option>
            {RESOLUTION_ACTIONS.map((action) => (
              <option key={action} value={action}>
                {t(`session:reviewer.resolve.action.${action}`)}
              </option>
            ))}
          </select>
          {finding.resolution && (
            <span className="text-muted">
              {t("session:reviewer.resolve.previously", {
                action: t(`session:reviewer.resolve.action.${finding.resolution}`),
              })}
            </span>
          )}
        </div>
      )}
    </li>
  );
}

/** Global Review view (sidebar) — the focused session's persisted review runs.
 *  Hidden entirely over the web client, where the science DB is unreachable. */
export function ReviewPage() {
  const { t } = useTranslation(["review", "common"]);
  const currentId = useRuntimeStore((s) => s.currentId);
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-8 py-8">
        <header className="mb-4 flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-input bg-accent/10 text-accent">
            <ShieldCheck size={17} strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-serif text-xl leading-tight text-text">{t("title")}</h1>
            <p className="mt-0.5 text-sm text-muted">{t("description")}</p>
          </div>
        </header>
        {currentId ? (
          <ReviewView sessionId={currentId} />
        ) : (
          <p className="mt-8 text-center text-sm text-muted">{t("noSession")}</p>
        )}
      </div>
    </div>
  );
}

/** Per-session Review pane (session header toggle) — this session's persisted
 *  review runs, beside the chat, with a button to run a fresh review. */
export function ReviewPane({
  sessionId,
  onClose,
  controls,
}: {
  sessionId: string;
  onClose: () => void;
  controls?: React.ReactNode;
}) {
  const { t } = useTranslation(["review", "common"]);
  return (
    <div className="flex h-full flex-col border-l border-border bg-surface">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <PaneTitlebarInset />
        <ShieldCheck size={14} strokeWidth={1.5} className="shrink-0 text-text" />
        <span className="text-sm font-medium text-text">{t("title")}</span>
        <div className="flex-1" />
        {controls}
        <button className="text-text hover:opacity-60" aria-label={t("closeAria")} onClick={onClose}>
          <X size={14} strokeWidth={1.5} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        <ReviewView sessionId={sessionId} />
      </div>
    </div>
  );
}

function ReviewSelection({
  engine,
  model,
  models,
  onEngineChange,
  onModelChange,
}: {
  engine: string;
  model: string;
  models: Array<{ id: string; label: string }>;
  onEngineChange: (value: string) => void;
  onModelChange: (value: string) => void;
}) {
  const { t } = useTranslation("review");

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
      <label className="inline-flex items-center gap-1.5">
        <span>{t("selection.engine")}</span>
        <select
          aria-label={t("selection.engine")}
          value={engine}
          onChange={(event) => onEngineChange(event.target.value)}
          className="rounded-input border border-border bg-surface-2 px-2 py-1 text-xs text-text"
        >
          {REVIEW_ENGINES.map((item) => (
            <option key={item.id} value={item.id}>{item.label}</option>
          ))}
        </select>
      </label>
      <label className="inline-flex items-center gap-1.5">
        <span>{t("selection.model")}</span>
        <select
          aria-label={t("selection.model")}
          value={model}
          onChange={(event) => onModelChange(event.target.value)}
          className="max-w-[240px] rounded-input border border-border bg-surface-2 px-2 py-1 text-xs text-text"
        >
          <option value="">{t("selection.defaultModel")}</option>
          {models.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>
    </div>
  );
}

// Guard against a stray import in web builds: the whole feature is desktop-only.
export const REVIEW_ENABLED = !isGatewayWeb;

function absoluteTs(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(i18n.language, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
