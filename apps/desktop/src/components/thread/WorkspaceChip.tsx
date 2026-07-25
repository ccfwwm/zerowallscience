import { useState } from "react";
import { FolderOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { isTauri, pickFolder } from "@/lib/tauri";
import { datedWorkspaceName, DRAFT_KEY, useRuntimeStore } from "@/lib/runtime";

/** Last path segment of the workspace folder, or "Workspace" when unknown. */
export function baseName(path: string | null): string {
  const fallback = i18n.t("session:workspaceChip.fallbackName");
  if (!path) return fallback;
  return path.replace(/[/\\]+$/, "").split(/[/\\]/).pop() || fallback;
}

/**
 * Folder picker for a fresh draft, shown in the session header next to the
 * title. A draft starts in a new dated folder by default — the chip opens the
 * native picker for anyone who wants a specific folder instead (the pick pins
 * it). Once the session exists its folder is a fact, not a choice — the
 * header's Files toggle names it, so the chip disappears.
 */
export function WorkspaceChip() {
  const { t } = useTranslation(["session", "common"]);
  const workspace = useRuntimeStore((s) => s.workspace);
  const currentId = useRuntimeStore((s) => s.currentId);
  const workspacePinned = useRuntimeStore((s) => s.workspacePinned);
  const switchWorkspace = useRuntimeStore((s) => s.switchWorkspace);
  // Only THIS draft's own send should lock the picker — not an unrelated split
  // pane's send (the global `sending` is the OR across all panes).
  const sending = useRuntimeStore((s) => !!s.sendingSessions[DRAFT_KEY]);
  const [busy, setBusy] = useState(false);

  if (!isTauri || currentId) return null;

  const choose = async () => {
    const dir = await pickFolder();
    if (!dir) return; // cancelled — keep the current destination
    setBusy(true);
    try {
      await switchWorkspace({ path: dir }); // an explicit pick pins the folder
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      className="flex items-center gap-1 rounded-input px-1.5 py-1 text-xs text-muted hover:bg-surface-2 hover:text-text disabled:opacity-60"
      onClick={() => void choose()}
      disabled={busy || sending}
      title={
        workspacePinned
          ? t("workspaceChip.titlePinned", { workspace: workspace ?? "" })
          : t("workspaceChip.titleUnpinned", { name: datedWorkspaceName() })
      }
      aria-label={t("workspaceChip.chooseAria")}
    >
      <FolderOpen size={14} className="shrink-0" />
      {busy ? (
        <span>{t("workspaceChip.switching")}</span>
      ) : (
        workspacePinned && <span className="max-w-[200px] truncate">{baseName(workspace)}</span>
      )}
    </button>
  );
}
