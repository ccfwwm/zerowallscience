import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  CheckCircle2,
  CircleAlert,
  FlaskConical,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  X,
} from "lucide-react";
import { BUILTIN_WORKFLOWS, type WorkflowRun } from "@zerowall/sdk";
import { useRuntimeStore } from "@/lib/runtime";
import { workflowActionsForState, type WorkflowAction } from "@/lib/workflow-controls";
import { isGatewayWeb } from "@/lib/webMode";
import { cn } from "@/lib/cn";

const ACTION_ICONS: Record<WorkflowAction, React.ReactNode> = {
  pause: <Pause size={13} />,
  resume: <Play size={13} />,
  retry: <RotateCcw size={13} />,
  cancel: <X size={13} />,
};

export function WorkflowsPage() {
  const { t } = useTranslation("pages");
  const currentId = useRuntimeStore((s) => s.currentId);
  const runs = useRuntimeStore((s) => s.workflowRuns);
  const startWorkflow = useRuntimeStore((s) => s.startWorkflow);
  const pauseWorkflow = useRuntimeStore((s) => s.pauseWorkflow);
  const resumeWorkflow = useRuntimeStore((s) => s.resumeWorkflow);
  const retryWorkflow = useRuntimeStore((s) => s.retryWorkflow);
  const cancelWorkflow = useRuntimeStore((s) => s.cancelWorkflow);
  const [starting, setStarting] = useState<string | null>(null);
  const [busyRun, setBusyRun] = useState<string | null>(null);

  const start = async (workflowId: string) => {
    if (starting || isGatewayWeb) return;
    setStarting(workflowId);
    try {
      await startWorkflow(workflowId, currentId ?? undefined);
    } finally {
      setStarting(null);
    }
  };

  const control = async (run: WorkflowRun, action: WorkflowAction) => {
    if (busyRun || isGatewayWeb) return;
    setBusyRun(run.id);
    try {
      if (action === "pause") await pauseWorkflow(run.id);
      else if (action === "resume") await resumeWorkflow(run.id);
      else if (action === "retry") await retryWorkflow(run.id);
      else await cancelWorkflow(run.id);
    } finally {
      setBusyRun(null);
    }
  };

  const recentRuns = Object.values(runs).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-8 py-8">
        <header className="mb-6 flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-input bg-accent/10 text-accent">
            <FlaskConical size={17} strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-serif text-xl leading-tight text-text">{t("workflows.title")}</h1>
            <p className="mt-0.5 text-sm text-muted">{t("workflows.description")}</p>
          </div>
        </header>

        <section aria-labelledby="workflow-library-heading">
          <div id="workflow-library-heading" className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
            {t("workflows.library")}
          </div>
          <div className="overflow-hidden rounded-card border border-border bg-surface shadow-card">
            {BUILTIN_WORKFLOWS.map((workflow) => (
              <div key={workflow.id} className="flex items-center gap-3 border-t border-border px-4 py-3 first:border-t-0">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-input bg-surface-2 text-accent">
                  <FlaskConical size={15} />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">{workflow.name}</span>
                <span className="shrink-0 text-xs text-muted">{t("workflows.nodeCount", { count: workflow.nodes.length })}</span>
                <button
                  type="button"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-input bg-accent px-2.5 py-1.5 text-xs font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
                  aria-label={t("workflows.run")}
                  disabled={starting !== null || isGatewayWeb}
                  onClick={() => void start(workflow.id)}
                >
                  {starting === workflow.id ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                  {t("workflows.run")}
                </button>
              </div>
            ))}
          </div>
          {isGatewayWeb && <p className="mt-2 text-xs text-muted">{t("workflows.desktopOnly")}</p>}
        </section>

        <section className="mt-8" aria-labelledby="workflow-runs-heading">
          <div id="workflow-runs-heading" className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
            {t("workflows.runs")}
          </div>
          {recentRuns.length === 0 ? (
            <div className="rounded-card border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
              {t("workflows.empty")}
            </div>
          ) : (
            <div className="space-y-2">
              {recentRuns.map((run) => (
                <WorkflowRunRow key={run.id} run={run} busy={busyRun === run.id} onAction={(action) => void control(run, action)} t={t} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function WorkflowRunRow({
  run,
  busy,
  onAction,
  t,
}: {
  run: WorkflowRun;
  busy: boolean;
  onAction: (action: WorkflowAction) => void;
  t: TFunction<"pages">;
}) {
  const nodes = Object.values(run.nodes);
  const completed = nodes.filter((node) => node.state === "completed").length;
  const actions = workflowActionsForState(run.state);
  const statusIcon = run.state === "completed" ? <CheckCircle2 size={14} /> : run.state === "failed" ? <CircleAlert size={14} /> : <Loader2 size={14} className={run.state === "running" ? "animate-spin" : undefined} />;
  return (
    <article className="rounded-card border border-border bg-surface px-4 py-3 shadow-card">
      <div className="flex items-center gap-2">
        <span className={cn("shrink-0", run.state === "failed" ? "text-error" : run.state === "completed" ? "text-ok" : "text-accent")}>
          {statusIcon}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">{run.name}</span>
        <span className="shrink-0 text-xs text-muted">{t(`workflows.status.${run.state}`)}</span>
        <span className="shrink-0 text-xs tabular-nums text-muted">{t("workflows.completed", { completed, total: nodes.length })}</span>
        {actions.map((action) => (
          <button
            key={action}
            type="button"
            className="rounded p-1 text-muted hover:bg-surface-2 hover:text-text disabled:opacity-50"
            aria-label={t(`workflows.action.${action}`)}
            title={t(`workflows.action.${action}`)}
            disabled={busy}
            onClick={() => onAction(action)}
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : ACTION_ICONS[action]}
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {nodes.map((node) => (
          <span key={node.id} className={cn("rounded px-1.5 py-0.5 text-[11px]", node.state === "completed" ? "bg-ok/10 text-ok" : node.state === "failed" || node.state === "blocked" ? "bg-error/10 text-error" : node.state === "running" ? "bg-accent/10 text-accent" : "bg-surface-2 text-muted")}>
            {node.id}
          </span>
        ))}
      </div>
      {run.state === "failed" && nodes.some((node) => node.error) && (
        <p className="mt-2 truncate text-xs text-error">{nodes.find((node) => node.error)?.error}</p>
      )}
    </article>
  );
}
