import { useTranslation } from "react-i18next";
import { useRuntimeStore } from "@/lib/runtime";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

export function WorkflowRunApprovalDialog() {
  const { t } = useTranslation("pages");
  const approval = useRuntimeStore((state) => state.workflowRunApproval);
  const reply = useRuntimeStore((state) => state.replyWorkflowRunApproval);
  if (!approval) return null;

  return (
    <ConfirmDialog
      title={t("workflows.approval.title")}
      body={t("workflows.approval.body", {
        run: approval.runName,
        language: approval.language,
        notebook: approval.notebook ? ` · ${approval.notebook}` : "",
      })}
      details={(
        <pre className="max-h-[40vh] overflow-auto whitespace-pre-wrap break-words rounded-input border border-border bg-surface-2 p-3 font-mono text-xs leading-5 text-text">
          {approval.code}
        </pre>
      )}
      confirmLabel={t("workflows.approval.confirm")}
      onConfirm={() => reply(true)}
      onCancel={() => reply(false)}
    />
  );
}
