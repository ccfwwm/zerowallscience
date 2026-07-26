import { useCallback, useEffect, useState } from "react";
import { Loader2, RotateCcw, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  deleteMemory,
  listMemories,
  setMemoryDisabled,
  type Memory,
} from "@/lib/memory";
import { isGatewayWeb } from "@/lib/webMode";
import { isTauri } from "@/lib/tauri";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/cn";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Section, Switch } from "./Section";
import i18n from "@/i18n";

/**
 * What the agent has learned and kept for this workspace (M005 `memories`).
 *
 * Disabling is not deleting: a disabled memory stays listed, greyed, and never
 * reaches a recall query — so the user can see what was learned and undo it.
 * Deleting is destructive and confirms first.
 *
 * The science database lives inside the workspace folder, which the gateway web
 * client cannot reach, so this card hides itself in web mode instead of shipping
 * controls that would fail.
 */
export function MemoryCard() {
  const { t } = useTranslation(["settings", "common"]);
  const [memories, setMemories] = useState<Memory[] | null>(null);
  /** Ids with a write in flight — their controls disable so a double-click
   *  can't fire two conflicting updates. */
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<Memory | null>(null);

  const load = useCallback(async () => {
    try {
      // Everything, disabled included: this is the management view.
      setMemories(await listMemories(true));
    } catch (e) {
      setMemories([]);
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    if (isGatewayWeb) return;
    void load();
  }, [load]);

  const mark = (id: string, on: boolean) =>
    setBusy((b) => {
      const next = new Set(b);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const toggle = async (memory: Memory) => {
    const disable = memory.disabledAt === null;
    mark(memory.id, true);
    try {
      const saved = await setMemoryDisabled(memory.id, disable);
      if (saved) setMemories((list) => (list ?? []).map((m) => (m.id === saved.id ? saved : m)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      mark(memory.id, false);
    }
  };

  const confirmDelete = async (memory: Memory) => {
    setPendingDelete(null);
    mark(memory.id, true);
    try {
      await deleteMemory(memory.id);
      setMemories((list) => (list ?? []).filter((m) => m.id !== memory.id));
      toast.success(t("memory.toast.deleted"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      mark(memory.id, false);
    }
  };

  if (isGatewayWeb) return null;

  return (
    <Section title={t("memory.title")} hint={t("memory.subtitle")} flush>
      {!isTauri ? (
        <div className="px-4 py-3.5 text-[13px] text-muted">{t("memory.unavailable")}</div>
      ) : memories === null ? (
        <div className="flex items-center gap-2 px-4 py-3.5 text-[13px] text-muted">
          <Loader2 size={14} className="animate-spin" /> {t("memory.loading")}
        </div>
      ) : memories.length === 0 ? (
        <div className="px-4 py-3.5 text-[13px] text-muted">{t("memory.empty")}</div>
      ) : (
        <ul>
          {memories.map((memory) => {
            const disabled = memory.disabledAt !== null;
            const working = busy.has(memory.id);
            return (
              <li
                key={memory.id}
                className="px-4 py-3 [&+&]:border-t [&+&]:border-faint"
              >
                {/* Phone width stacks the controls below the text: side by side
                    they squeeze the content to a character per line. */}
                <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:gap-4">
                  <div className="min-w-0 sm:flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-muted">
                        {memory.kind}
                      </span>
                      <span className="text-xs text-muted">{formatWhen(memory.createdAt)}</span>
                      {disabled && (
                        <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">
                          {t("memory.disabledBadge")}
                        </span>
                      )}
                    </div>
                    <p
                      className={cn(
                        "mt-1 whitespace-pre-wrap break-words text-[13px] leading-relaxed",
                        disabled ? "text-muted line-through" : "text-text",
                      )}
                    >
                      {memory.content ?? t("memory.contentUnavailable")}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Switch
                      checked={!disabled}
                      onChange={() => void toggle(memory)}
                      label={disabled ? t("memory.enableAria") : t("memory.disableAria")}
                    />
                    <button
                      className="text-muted hover:text-error disabled:opacity-50"
                      aria-label={t("memory.deleteAria")}
                      title={t("memory.deleteTitle")}
                      disabled={working}
                      onClick={() => setPendingDelete(memory)}
                    >
                      {working ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Trash2 size={14} strokeWidth={1.5} />
                      )}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {isTauri && memories !== null && (
        <div className="flex justify-end border-t border-faint px-4 py-2.5">
          <button
            className="flex items-center gap-1.5 text-xs text-muted hover:text-text"
            onClick={() => void load()}
          >
            <RotateCcw size={12} /> {t("memory.refresh")}
          </button>
        </div>
      )}
      {pendingDelete && (
        <ConfirmDialog
          title={t("memory.confirmDelete.title")}
          body={t("memory.confirmDelete.body")}
          confirmLabel={t("memory.confirmDelete.confirm")}
          onConfirm={() => void confirmDelete(pendingDelete)}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </Section>
  );
}

/** Render the store's ISO-8601 timestamp in the user's locale. An unparseable
 *  value is shown verbatim rather than as "Invalid Date". */
function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(i18n.language, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
