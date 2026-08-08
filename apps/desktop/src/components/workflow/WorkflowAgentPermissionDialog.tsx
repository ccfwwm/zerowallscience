import { useEffect } from "react";
import { ShieldQuestion } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useRuntimeStore } from "@/lib/runtime";

/** A workflow is unattended only until an agent requests a capability. This
 * dialog preserves the adapter's real option ids and defaults to rejection. */
export function WorkflowAgentPermissionDialog() {
  const { t } = useTranslation("pages");
  const permission = useRuntimeStore((state) => state.workflowAgentPermission);
  const reply = useRuntimeStore((state) => state.replyWorkflowAgentPermission);

  useEffect(() => {
    if (!permission) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") reply(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [permission, reply]);

  if (!permission) return null;
  const label = (value: string) => value.replace(/[_-]+/g, " ");
  const safeOptions = permission.options.filter((option) =>
    !/(?:deny|reject|cancel)/i.test(option.id),
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      role="presentation"
      onClick={() => reply(null)}
    >
      <section
        role="alertdialog"
        aria-label={t("workflows.permission.aria", { defaultValue: "Workflow permission" })}
        className="w-[min(560px,calc(100vw-32px))] rounded-card border border-border bg-surface p-4 shadow-card"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center gap-2 text-sm font-medium text-text">
          <ShieldQuestion size={16} className="text-warn" />
          <span>{t("workflows.permission.title", { defaultValue: "Workflow permission required" })}</span>
        </header>
        <p className="mt-1.5 text-sm text-muted">
          {t("workflows.permission.body", {
            defaultValue: "{{run}} · {{node}} requests {{action}}.",
            run: permission.runName,
            node: permission.nodeId,
            action: label(permission.action),
          })}
        </p>
        {permission.resources.length > 0 && (
          <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-input border border-border bg-surface-2 px-3 py-2 font-mono text-xs text-text">
            {permission.resources.join("\n")}
          </pre>
        )}
        <footer className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            autoFocus
            className="rounded-input border border-border px-3 py-1.5 text-sm text-text hover:bg-surface-2"
            onClick={() => reply(null)}
          >
            {t("workflows.permission.reject", { defaultValue: "Reject" })}
          </button>
          {safeOptions.map((option) => (
            <button
              key={option.id}
              className="rounded-input bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:opacity-90"
              onClick={() => reply(option.id)}
            >
              {option.label ?? label(option.id)}
            </button>
          ))}
        </footer>
      </section>
    </div>
  );
}
