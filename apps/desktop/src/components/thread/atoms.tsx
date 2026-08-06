import { memo, useEffect, useRef, useState } from "react";
import { Check, Copy, FileText, Loader2, Paperclip, Pencil, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { copyText } from "@/lib/clipboard";
import { toast } from "@/lib/toast";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type {
  ArtifactBlock,
  DataTableBlock,
  RunningJobsBlock,
  StatusLineBlock,
  UsageBlock,
  UserAttachment,
  UserAttachmentsBlock,
  UserMessageBlock,
} from "@zerowall/shared";
import { cn } from "@/lib/cn";
import { formatCount } from "@/lib/usageFormat";
import { MarkdownViewer } from "@/components/markdown-viewer/MarkdownViewer";
import { extractArtifactRefs, refToArtifactBlock } from "@/lib/artifacts";
import { resolveArtifactPath } from "@/lib/artifactFile";
import { useThrottledValue } from "@/lib/useThrottledValue";

// All block atoms are memoized on their props: a fold rebuilds only the one
// block object it changed (the blocks-array copy preserves the rest by
// reference), so an SSE event re-renders just the affected row — the rest of a
// long conversation is skipped, keeping render cost flat as history grows (#34).
// A user turn: a right-aligned bubble that hugs its content (short prompts stay
// small; long ones wrap at 85% of the column). Hovering reveals Copy and — when
// the message carries a server id and the thread supplies the handlers — Edit
// (open inline, correct, resend) and Revert (roll back to here, prefill the
// composer). Edit and Revert both discard this message and everything after it
// and roll back the files those turns changed, so each confirms first.
export const UserMessage = memo(function UserMessage({
  block,
  onEdit,
  onRevert,
}: {
  block: UserMessageBlock;
  onEdit?: (messageID: string, newText: string) => void | Promise<void>;
  onRevert?: (messageID: string, text: string) => void | Promise<void>;
}) {
  const { t } = useTranslation(["session", "common"]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(block.text);
  const [copied, setCopied] = useState(false);
  // Which destructive action is awaiting confirmation, if any.
  const [confirm, setConfirm] = useState<null | "edit" | "revert">(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const canEdit = !!onEdit && !!block.messageID;
  const canRevert = !!onRevert && !!block.messageID;

  const copy = async () => {
    try {
      await copyText(block.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t("message.copyFailed"));
    }
  };

  const openEditor = () => {
    setDraft(block.text);
    setEditing(true);
  };
  const runConfirmed = () => {
    const action = confirm;
    setConfirm(null);
    if (!block.messageID) return;
    if (action === "edit") {
      const text = draft.trim();
      if (!text) return;
      setEditing(false);
      void onEdit?.(block.messageID, text);
    } else if (action === "revert") {
      void onRevert?.(block.messageID, block.text);
    }
  };

  // Focus at the end when the editor opens.
  useEffect(() => {
    if (!editing) return;
    const el = areaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [editing]);

  const confirmDialog = confirm && (
    <ConfirmDialog
      title={t("message.confirm.title")}
      body={t("message.confirm.body")}
      confirmLabel={confirm === "edit" ? t("message.confirm.edit") : t("message.confirm.revert")}
      onConfirm={runConfirmed}
      onCancel={() => setConfirm(null)}
    />
  );

  if (editing) {
    return (
      <div className="flex flex-col items-end">
        <div className="w-full rounded-card border border-border bg-surface-2 p-2">
          <textarea
            ref={areaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                setEditing(false);
              } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                if (draft.trim()) setConfirm("edit");
              }
            }}
            rows={Math.min(12, Math.max(2, draft.split("\n").length))}
            className="w-full resize-none bg-transparent px-2 py-1.5 text-[15px] leading-relaxed text-text outline-none"
          />
          <div className="flex justify-end gap-2 px-1 pt-1">
            <button
              onClick={() => setEditing(false)}
              className="rounded-input px-3 py-1.5 text-xs font-medium text-muted hover:bg-surface hover:text-text"
            >
              {t("message.editing.cancel")}
            </button>
            <button
              onClick={() => draft.trim() && setConfirm("edit")}
              disabled={!draft.trim()}
              className="rounded-input bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:opacity-90 disabled:opacity-40"
            >
              {t("message.editing.send")}
            </button>
          </div>
        </div>
        {confirmDialog}
      </div>
    );
  }

  return (
    <div className="group flex flex-col items-end">
      <div className="w-fit max-w-[85%] whitespace-pre-wrap break-words rounded-card bg-surface-2 px-4 py-2.5 text-[15px] leading-relaxed text-text">
        {block.text}
      </div>
      <div className="flex items-center gap-0.5 pr-0.5 pt-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
        <button
          onClick={copy}
          title={copied ? t("message.copied") : t("message.copy")}
          aria-label={t("message.copy")}
          className="rounded p-1 text-muted hover:bg-surface-2 hover:text-text"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
        {canEdit && (
          <button
            onClick={openEditor}
            title={t("message.edit")}
            aria-label={t("message.edit")}
            className="rounded p-1 text-muted hover:bg-surface-2 hover:text-text"
          >
            <Pencil size={14} />
          </button>
        )}
        {canRevert && (
          <button
            onClick={() => setConfirm("revert")}
            title={t("message.revert")}
            aria-label={t("message.revert")}
            className="rounded p-1 text-muted hover:bg-surface-2 hover:text-text"
          >
            <RotateCcw size={14} />
          </button>
        )}
      </div>
      {confirmDialog}
    </div>
  );
});

// A user turn's attachments — the images/files the composer sent alongside the
// prompt. Rendered right-aligned above the text bubble so a reader sees WHAT
// the model saw, not just "[Attached file: foo.pdf]". Click opens the right
// pane's FilePreviewInspector via the same handler artifacts use.
function isImageMime(mime: string): boolean {
  return mime.startsWith("image/");
}

export const UserAttachments = memo(function UserAttachments({
  block,
  onOpen,
}: {
  block: UserAttachmentsBlock;
  onOpen?: (a: ArtifactBlock) => void;
}) {
  const { t } = useTranslation(["session", "common"]);
  const openAttachment = (att: UserAttachment) => {
    if (!onOpen || !att.path) return;
    // Attachment paths are workspace-relative (composer files always land on
    // disk); FilePreviewInspector reads from the workspace root by name.
    const artifact = refToArtifactBlock(att.path);
    onOpen(artifact);
  };
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex max-w-[85%] flex-wrap justify-end gap-2">
        {block.attachments.map((att, k) => {
          const clickable = !!onOpen && !!att.path;
          const label = t("attachment.previewAria", { name: att.filename, defaultValue: `预览附件 ${att.filename}` });
          // CSS utility tokens are intentionally literal; they are not user-facing copy.
          // eslint-disable-next-line i18next/no-literal-string
          /* eslint-disable i18next/no-literal-string */
          const commonBtnClass =
            "group/att flex items-center gap-2 rounded-card border border-border bg-surface px-2.5 py-1.5 text-xs text-text transition-colors";
          /* eslint-enable i18next/no-literal-string */
          if (isImageMime(att.mime)) {
            const content = (
              <>
                <img
                  src={att.url}
                  alt={att.filename}
                  className="h-16 w-16 rounded-input object-cover"
                  loading="lazy"
                />
                <span className="max-w-[10rem] truncate text-muted group-hover/att:text-text">{att.filename}</span>
              </>
            );
            return clickable ? (
              <button
                key={k}
                type="button"
                onClick={() => openAttachment(att)}
                aria-label={label}
                title={label}
                className={cn(commonBtnClass, "cursor-pointer hover:bg-surface-2")}
              >
                {content}
              </button>
            ) : (
              <div key={k} className={commonBtnClass}>{content}</div>
            );
          }
          // Document chip: icon + filename; hover only when clickable.
          const chipContent = (
            <>
              <FileText size={16} className="shrink-0 text-muted" />
              <span className="max-w-[16rem] truncate">{att.filename}</span>
            </>
          );
          return clickable ? (
            <button
              key={k}
              type="button"
              onClick={() => openAttachment(att)}
              aria-label={label}
              title={label}
              className={cn(commonBtnClass, "cursor-pointer hover:bg-surface-2")}
            >
              {chipContent}
            </button>
          ) : (
            <div key={k} className={commonBtnClass}>{chipContent}</div>
          );
        })}
      </div>
    </div>
  );
});

export const AgentMessage = memo(function AgentMessage({
  markdown,
  onOpenArtifact,
  onUndoTurn,
}: {
  markdown: string;
  onOpenArtifact?: (a: ArtifactBlock) => void;
  /** When present, show an Undo button that rolls back this turn's workspace
   *  file changes. The parent only passes it for the latest reply in a live,
   *  desktop session — so its presence is the gate. */
  onUndoTurn?: () => void;
}) {
  const { t } = useTranslation(["session", "common"]);
  const [copied, setCopied] = useState(false);
  // While the agent streams, `markdown` grows on every token and re-parsing the
  // whole message (react-markdown + KaTeX) each time is the main live CPU cost
  // (#50). Throttle to the trailing value so the parse runs a bounded number of
  // times per second; a finished message settles immediately and stays put.
  const shown = useThrottledValue(markdown, 90);
  // Files the agent mentions (e.g. a PDF produced by running code) become clickable.
  // Each mention is resolved to a real workspace path first — prose often names a
  // bare filename ("index.html") whose file lives in a subdirectory; mentions of
  // files that don't exist get no chip.
  const mentioned = onOpenArtifact ? extractArtifactRefs(shown) : [];
  const [refs, setRefs] = useState<string[]>([]);
  const mentionedKey = mentioned.join("\n");
  useEffect(() => {
    let cancelled = false;
    if (!mentionedKey) {
      setRefs([]);
      return;
    }
    void Promise.all(mentionedKey.split("\n").map((p) => resolveArtifactPath(p).catch(() => null))).then(
      (resolved) => {
        if (cancelled) return;
        setRefs([...new Set(resolved.filter((p): p is string => p !== null))]);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [mentionedKey]);

  const copy = async () => {
    try {
      await copyText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t("message.copyFailed"));
    }
  };

  return (
    <div className="group">
      <MarkdownViewer>{shown}</MarkdownViewer>
      {refs.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {refs.map((path) => (
            <button
              key={path}
              onClick={() => onOpenArtifact?.(refToArtifactBlock(path))}
              className="flex items-center gap-1.5 rounded-input border border-border bg-surface px-2 py-1 text-xs text-text hover:bg-surface-2"
              title={t("agentMessage.previewTitle", { path })}
            >
              <Paperclip size={12} className="text-accent" />
              <span className="font-mono">{path.split(/[\\/]/).pop()}</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-0.5 pt-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
        <button
          onClick={copy}
          title={copied ? t("message.copied") : t("message.copy")}
          aria-label={t("message.copy")}
          className="rounded p-1 text-muted hover:bg-surface-2 hover:text-text"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
        {onUndoTurn && (
          <button
            onClick={onUndoTurn}
            title={t("message.undo")}
            aria-label={t("message.undo")}
            className="rounded p-1 text-muted hover:bg-surface-2 hover:text-text"
          >
            <RotateCcw size={14} />
          </button>
        )}
      </div>
    </div>
  );
});

export const DataTable = memo(function DataTable({ block }: { block: DataTableBlock }) {
  return (
    <div className="overflow-x-auto rounded-card border border-border bg-surface shadow-card">
      {block.caption && (
        <div className="border-b border-border px-4 py-2 text-xs text-muted">{block.caption}</div>
      )}
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted">
            {block.columns.map((c) => (
              <th key={c} className="px-4 py-2 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, i) => (
            <tr key={i} className="border-b border-border/60 last:border-0">
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={cn(
                    "px-4 py-2 text-text",
                    j === row.length - 1 && "font-mono text-[13px] text-link",
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

export const RunningJobsOverlay = memo(function RunningJobsOverlay({
  block,
}: {
  block: RunningJobsBlock;
}) {
  return (
    <div className="rounded-card border border-border bg-surface shadow-card">
      <div className="border-b border-border px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted">
        {block.title}
      </div>
      <ul className="divide-y divide-border/60">
        {block.jobs.map((j, i) => (
          <li key={i} className="flex items-center gap-2 px-4 py-2 text-sm">
            <Loader2 size={13} className="animate-spin text-accent" />
            <span className="flex-1 truncate text-text">{j.label}</span>
            <span className="text-xs text-muted">{j.elapsed}</span>
          </li>
        ))}
      </ul>
    </div>
  );
});

const TONE: Record<NonNullable<StatusLineBlock["tone"]>, string> = {
  running: "text-accent",
  done: "text-ok",
  review: "text-muted",
  error: "text-error",
};

export const StatusLine = memo(function StatusLine({ block }: { block: StatusLineBlock }) {
  return (
    <div className={cn(block.divider && "border-t border-border pt-4")}>
      <div className={cn("flex items-center gap-2 text-sm", TONE[block.tone ?? "review"])}>
        <Loader2
          size={14}
          className={cn(block.tone === "running" && "animate-spin", block.tone !== "running" && "hidden")}
        />
        <span>{block.text}</span>
      </div>
    </div>
  );
});

/** Per-reply token tail. Reasoning and cached segments appear only when
 * non-zero; provider fees are intentionally neither calculated nor shown. */
export const UsageTail = memo(function UsageTail({ block }: { block: UsageBlock }) {
  const { t, i18n } = useTranslation(["usage"]);
  const locale = i18n.language;
  const parts = [
    t("tail.in", {
      count: block.input,
      value: block.inputUnavailable ? "—" : formatCount(block.input, locale),
    }),
    t("tail.out", {
      count: block.output,
      value: block.outputUnavailable ? "—" : formatCount(block.output, locale),
    }),
  ];
  const cached = block.cacheRead + block.cacheWrite;
  if (cached > 0) parts.push(t("tail.cached", { value: formatCount(cached, locale) }));
  if (block.reasoning > 0)
    parts.push(t("tail.reasoning", { value: formatCount(block.reasoning, locale) }));
  return (
    <div className="flex items-center gap-1 pl-0.5 font-mono text-xs text-muted" title={t("tail.title")}>
      {parts.join(" · ")}
    </div>
  );
});
