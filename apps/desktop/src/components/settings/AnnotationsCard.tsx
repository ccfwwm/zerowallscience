import { useCallback, useEffect, useState } from "react";
import { Loader2, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  deleteAnnotation,
  listAnnotations,
  updateAnnotation,
  type Annotation,
} from "@/lib/annotations";
import { isGatewayWeb } from "@/lib/webMode";
import { isTauri } from "@/lib/tauri";
import { toast } from "@/lib/toast";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Section } from "./Section";
import i18n from "@/i18n";

/**
 * Notes anchored to a file version in this workspace (M005 `annotations`).
 *
 * Each row shows what the note says AND what it points at — path, version, and
 * line span — because an annotation whose target is invisible cannot be checked
 * against the text it claims to describe.
 *
 * Editing covers the category and the note only: the anchor is what the note is
 * about, so re-pointing it would turn it into a claim about text its author
 * never read (see `annotation_store::update_annotation`). Deleting is
 * destructive and confirms first.
 *
 * The science database lives inside the workspace folder, which the gateway web
 * client cannot reach, so this card hides itself in web mode instead of shipping
 * controls that would fail.
 */
export function AnnotationsCard() {
  const { t } = useTranslation(["settings", "common"]);
  const [annotations, setAnnotations] = useState<Annotation[] | null>(null);
  /** Ids with a write in flight — their controls disable so a double-click
   *  can't fire two conflicting updates. */
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ id: string; kind: string; body: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Annotation | null>(null);

  const load = useCallback(async () => {
    try {
      setAnnotations(await listAnnotations());
    } catch (e) {
      setAnnotations([]);
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

  const save = async () => {
    if (!editing) return;
    const { id, kind, body } = editing;
    mark(id, true);
    try {
      await updateAnnotation(id, kind, body);
      setAnnotations((list) =>
        (list ?? []).map((a) => (a.id === id ? { ...a, annotationKind: kind, body } : a)),
      );
      setEditing(null);
      toast.success(t("annotations.toast.saved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      mark(id, false);
    }
  };

  /** The anchored span in words: one line, a range, or the whole file version. */
  const describeAnchor = (annotation: Annotation): string => {
    const anchor = annotation.anchor;
    if (!anchor) return t("annotations.wholeFile");
    if (anchor.startLine === anchor.endLine) {
      return t("annotations.anchorLine", { line: anchor.startLine });
    }
    return t("annotations.anchorLines", { start: anchor.startLine, end: anchor.endLine });
  };

  const confirmDelete = async (annotation: Annotation) => {
    setPendingDelete(null);
    mark(annotation.id, true);
    try {
      await deleteAnnotation(annotation.id);
      setAnnotations((list) => (list ?? []).filter((a) => a.id !== annotation.id));
      if (editing?.id === annotation.id) setEditing(null);
      toast.success(t("annotations.toast.deleted"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      mark(annotation.id, false);
    }
  };

  if (isGatewayWeb) return null;

  return (
    <Section title={t("annotations.title")} hint={t("annotations.subtitle")} flush>
      {!isTauri ? (
        <div className="px-4 py-3.5 text-[13px] text-muted">{t("annotations.unavailable")}</div>
      ) : annotations === null ? (
        <div className="flex items-center gap-2 px-4 py-3.5 text-[13px] text-muted">
          <Loader2 size={14} className="animate-spin" /> {t("annotations.loading")}
        </div>
      ) : annotations.length === 0 ? (
        <div className="px-4 py-3.5 text-[13px] text-muted">{t("annotations.empty")}</div>
      ) : (
        <ul>
          {annotations.map((annotation) => {
            const working = busy.has(annotation.id);
            const open = editing?.id === annotation.id;
            return (
              <li key={annotation.id} className="px-4 py-3 [&+&]:border-t [&+&]:border-faint">
                {/* Phone width stacks the controls below the text: side by side
                    they squeeze the content to a character per line. */}
                <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:gap-4">
                  <div className="min-w-0 sm:flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-muted">
                        {annotation.annotationKind}
                      </span>
                      <span className="text-xs text-muted">
                        {formatWhen(annotation.createdAt)}
                      </span>
                      <span className="text-xs text-muted">
                        {annotation.authorSubject === "local"
                          ? t("annotations.authorYou")
                          : annotation.authorSubject}
                      </span>
                    </div>
                    {open ? (
                      <div className="mt-2 space-y-2">
                        <input
                          className="w-full rounded-input border border-border bg-surface px-2 py-1 font-mono text-[12px] text-text"
                          aria-label={t("annotations.kindLabel")}
                          value={editing.kind}
                          onChange={(e) =>
                            setEditing({ ...editing, kind: e.target.value })
                          }
                        />
                        <textarea
                          className="w-full rounded-input border border-border bg-surface px-2 py-1.5 text-[13px] leading-relaxed text-text"
                          aria-label={t("annotations.bodyLabel")}
                          rows={3}
                          value={editing.body}
                          onChange={(e) =>
                            setEditing({ ...editing, body: e.target.value })
                          }
                        />
                        <div className="flex gap-2">
                          <button
                            className="rounded-input bg-surface-2 px-3 py-1.5 text-xs font-medium text-text hover:opacity-90 disabled:opacity-50"
                            disabled={working}
                            onClick={() => void save()}
                          >
                            {t("annotations.save")}
                          </button>
                          <button
                            className="rounded-input border border-border px-3 py-1.5 text-xs text-text hover:bg-surface-2"
                            onClick={() => setEditing(null)}
                          >
                            {t("common:actions.cancel")}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-text">
                        {annotation.body}
                      </p>
                    )}
                    {/* What the note points at. Without it a reader cannot check
                        the note against the text it describes. */}
                    <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[11px] text-muted">
                      <span className="break-all font-mono text-text">
                        {annotation.artifactPath}
                      </span>
                      <span className="font-mono">
                        {t("annotations.versionBadge", { number: annotation.versionNumber })}
                      </span>
                      <span>{describeAnchor(annotation)}</span>
                    </div>
                    {annotation.anchor && annotation.anchor.quote !== "" && (
                      <blockquote className="mt-1.5 border-l-2 border-border pl-2 font-mono text-[11px] leading-relaxed text-muted">
                        {annotation.anchor.quote}
                      </blockquote>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      className="text-muted hover:text-text disabled:opacity-50"
                      aria-label={t("annotations.editAria")}
                      disabled={working}
                      onClick={() =>
                        setEditing({
                          id: annotation.id,
                          kind: annotation.annotationKind,
                          body: annotation.body,
                        })
                      }
                    >
                      <Pencil size={14} strokeWidth={1.5} />
                    </button>
                    <button
                      className="text-muted hover:text-error disabled:opacity-50"
                      aria-label={t("annotations.deleteAria")}
                      title={t("annotations.deleteTitle")}
                      disabled={working}
                      onClick={() => setPendingDelete(annotation)}
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
      {isTauri && annotations !== null && (
        <div className="flex justify-end border-t border-faint px-4 py-2.5">
          <button
            className="flex items-center gap-1.5 text-xs text-muted hover:text-text"
            onClick={() => void load()}
          >
            <RotateCcw size={12} /> {t("annotations.refresh")}
          </button>
        </div>
      )}
      {pendingDelete && (
        <ConfirmDialog
          title={t("annotations.confirmDelete.title")}
          body={t("annotations.confirmDelete.body")}
          confirmLabel={t("annotations.confirmDelete.confirm")}
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
