import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowUp,
  Check,
  ChevronDown,
  ClipboardList,
  FileText,
  Hammer,
  Hand,
  Paperclip,
  Square,
  Terminal,
  X,
  Zap,
} from "lucide-react";
import {
  addFilesToWorkspace,
  addPathsToWorkspace,
  addTextToWorkspace,
  readLocalFileBase64,
  readWorkspaceFileBase64,
  isTauri,
  logDebug,
  type ApprovalMode,
} from "@/lib/tauri";
import type { PromptAttachment } from "@zerowall/sdk";
import {
  base64ToBytes,
  docMime,
  extractDocText,
  isDocTextExt,
} from "@/lib/textExtract";
import { compressImage } from "@/lib/imageCompress";
import { useRuntimeStore, type AgentMode } from "@/lib/runtime";
import { ModelPicker } from "@/components/thread/ModelPicker";
import { WorkspaceChip } from "@/components/thread/WorkspaceChip";
import { useUiStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/cn";
import { isGatewayWeb } from "@/lib/webMode";

/** A paste longer than this becomes a workspace file chip instead of raw text. */
const PASTE_AS_FILE_CHARS = 2000;
const PASTE_AS_FILE_LINES = 25;

/** Raster image extensions a vision model can actually read. These attach as
 *  inline image parts; other files (incl. svg) fall back to the workspace note
 *  and the agent's read tool. */
const RASTER_IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp"]);
function isRasterImage(name: string): boolean {
  return RASTER_IMAGE_EXT.has(name.split(".").pop()?.toLowerCase() ?? "");
}

/** Generate a display-unique name given the current `files` list. Used for
 *  attachment-only images that don't touch the workspace disk — Rust's
 *  `unique_name()` isn't reachable, so we replicate the suffix pattern here. */
function uniqueDisplayName(existingFiles: string[], base: string): string {
  if (!existingFiles.includes(base)) return base;
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : "";
  for (let n = 1; ; n++) {
    const candidate = `${stem}-${n}${ext}`;
    if (!existingFiles.includes(candidate)) return candidate;
  }
}

/** Extract the file name from an OS path (`/a/b/photo.png` → `photo.png`). */
function basename(p: string): string {
  const parts = p.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || p;
}

/** Max composer height before it scrolls internally. */
const MAX_HEIGHT_PX = 160;

/** Extension for a clipboard image's MIME type (`image/png` → `png`,
 *  `image/svg+xml` → `svg`, `image/jpeg` → `jpg`); falls back to `png`. */
function imageExt(mime: string): string {
  const sub = mime.split("/")[1]?.split(";")[0]?.replace("+xml", "") ?? "";
  const mapped = ({ jpeg: "jpg" } as Record<string, string>)[sub];
  return mapped ?? (sub || "png");
}

// Terminal-style input history: every sent input (prompt, "!cmd", "/name args")
// in its typed form, shared across sessions, newest last, ↑/↓ to recall.
const HISTORY_KEY = "zerowall.inputHistory";
const HISTORY_MAX = 100;
function readHistory(): string[] {
  try {
    const arr = JSON.parse(window.localStorage.getItem(HISTORY_KEY) ?? "[]");
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function recordHistory(entry: string): void {
  if (!entry) return;
  const prev = readHistory();
  if (prev[prev.length - 1] === entry) return; // consecutive duplicate
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify([...prev, entry].slice(-HISTORY_MAX)));
  } catch {
    /* full or unavailable storage never blocks a send */
  }
}

/** A "/" palette entry — the runtime's config commands, skills and MCP prompts. */
export interface ComposerCommand {
  name: string;
  description?: string;
  source?: string;
}

/** The two approval modes the composer can switch between (Codex-style). Copy
 *  (label/description) is translated at render time — see `approvalCopy`. */
const APPROVAL_OPTIONS: { mode: ApprovalMode; icon: typeof Hand }[] = [
  { mode: "approve", icon: Hand },
  { mode: "full", icon: Zap },
];

/** Build (default) or Plan — OpenCode's read-only planning agent. Copy is
 *  translated at render time (`agentCopy`), mirroring the approval switch. */
const AGENT_OPTIONS: { mode: AgentMode; icon: typeof Hammer }[] = [
  { mode: "build", icon: Hammer },
  { mode: "plan", icon: ClipboardList },
];

/**
 * The "Ask anything" composer. Static mock sessions pass no `onSend`; the live
 * OpenCode session passes one to submit prompts to the runtime. Attached
 * workspace files show as removable chips above the input, not as prompt text.
 *
 * Two prefix modes (only when their handler is provided):
 *   `!`  — shell mode: the rest of the line runs directly in the session's
 *          workspace folder (terminal styling, no model turn).
 *   `/`  — command palette: pick a slash command (config command / skill /
 *          MCP prompt) with ↑/↓ + Tab/Enter, then type arguments and send.
 *          A "/name" that matches no known command stays a plain prompt.
 */
export function Composer({
  onSend,
  onRunShell,
  onRunCommand,
  commands = [],
  disabled,
  working,
  onStop,
  placeholder,
  approvalMode,
  onApprovalModeChange,
  agentMode,
  onAgentModeChange,
  showModelPicker,
  modelSessionId,
  showWorkspaceChip = true,
  onInteract,
}: {
  onSend?: (text: string, attachments?: PromptAttachment[]) => void;
  onRunShell?: (command: string) => void;
  onRunCommand?: (name: string, args: string) => void;
  commands?: ComposerCommand[];
  disabled?: boolean;
  /** A turn is running: the send button becomes Stop (wired to `onStop`). */
  working?: boolean;
  onStop?: () => void;
  /** Defaults to `t("composer.placeholder.default")` ("Ask anything"). */
  placeholder?: string;
  /** The approval switch shows only when the surface provides both (the live
   *  session does; static mock sessions don't). */
  approvalMode?: ApprovalMode;
  onApprovalModeChange?: (mode: ApprovalMode) => void;
  /** The Build/Plan agent switch — same both-or-nothing contract; the live
   *  session withholds it when the runtime has no "plan" agent. */
  agentMode?: AgentMode;
  onAgentModeChange?: (mode: AgentMode) => void;
  /** Show the inline model + reasoning-effort switcher (left of send). The live
   *  session opts in; static mock sessions have no runtime to switch. */
  showModelPicker?: boolean;
  /** Bind the model picker to a session (per-pane model/effort); omit for the
   *  global default. */
  modelSessionId?: string;
  /** Show the draft workspace-folder chip. Only the draft pane opts in — in a
   *  split layout the other panes already have a bound session/folder. */
  showWorkspaceChip?: boolean;
  /** Fired when the user edits the input — used to pin a tentative screen (#3)
   *  the moment they start typing, so it isn't reused/lost on the next click. */
  onInteract?: () => void;
}) {
  const { t } = useTranslation(["session", "common"]);
  const resolvedPlaceholder = placeholder ?? t("composer.placeholder.default");
  // Approval-mode copy keyed by mode — APPROVAL_OPTIONS itself stays static
  // (icons only) so it can live at module scope outside the component.
  const approvalCopy: Record<ApprovalMode, { label: string; description: string }> = {
    approve: {
      label: t("composer.approval.approve.label"),
      description: t("composer.approval.approve.description"),
    },
    full: {
      label: t("composer.approval.full.label"),
      description: t("composer.approval.full.description"),
    },
  };
  // Agent-mode copy, same pattern as approvalCopy.
  const agentCopy: Record<AgentMode, { label: string; description: string }> = {
    build: {
      label: t("composer.agent.build.label"),
      description: t("composer.agent.build.description"),
    },
    plan: {
      label: t("composer.agent.plan.label"),
      description: t("composer.agent.plan.description"),
    },
  };
  const [value, setValue] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  // Image attachments loaded for the pending turn, keyed by their workspace file
  // name (a subset of `files`). Sent as inline image parts so the model can see
  // them — the read tool can't surface image bytes.
  const [attachments, setAttachments] = useState<PromptAttachment[]>([]);
  const [adding, setAdding] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  /** Highlighted palette row; clamped to the current matches. */
  const [sel, setSel] = useState(0);
  /** Esc closed the palette for the current input; typing reopens it. */
  const [paletteClosed, setPaletteClosed] = useState(false);
  /** A committed slash command: shown as a chip, the input holds arguments. */
  const [command, setCommand] = useState<string | null>(null);
  /** ↑/↓ history navigation; `draft` is what was typed before recalling. */
  const [hist, setHist] = useState<{ index: number; draft: string } | null>(null);
  /** The approval-mode menu is open. */
  const [approvalOpen, setApprovalOpen] = useState(false);
  const approvalRef = useRef<HTMLDivElement>(null);
  /** The agent-mode menu is open. */
  const [agentOpen, setAgentOpen] = useState(false);
  const agentRef = useRef<HTMLDivElement>(null);

  // Dismiss the approval menu on any outside press. (Button blur can't do
  // this: WKWebView never focuses a clicked button, so blur never fires.)
  useEffect(() => {
    if (!approvalOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!approvalRef.current?.contains(e.target as Node)) setApprovalOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [approvalOpen]);
  // Same for the agent menu.
  useEffect(() => {
    if (!agentOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!agentRef.current?.contains(e.target as Node)) setAgentOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [agentOpen]);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const composerDraft = useUiStore((s) => s.composerDraft);
  const setComposerDraft = useUiStore((s) => s.setComposerDraft);

  const shellMode = !!onRunShell && !command && value.startsWith("!");
  // The palette is open while the command NAME is being typed ("/na…"); the
  // first space ends name-typing (arguments follow) and closes it.
  const slashTyping = !!onRunCommand && !command && /^\/\S*$/.test(value);
  const query = slashTyping ? value.slice(1).toLowerCase() : "";
  const matches = slashTyping
    ? commands
        .filter((c) => c.name.toLowerCase().includes(query))
        .sort(
          (a, b) =>
            Number(b.name.toLowerCase().startsWith(query)) -
            Number(a.name.toLowerCase().startsWith(query)),
        )
    : [];
  const paletteOpen = matches.length > 0 && !paletteClosed && !disabled;
  const selIndex = Math.min(sel, Math.max(matches.length - 1, 0));

  // Each edit resets the palette: selection back to the top, Esc-close undone.
  useEffect(() => {
    setSel(0);
    setPaletteClosed(false);
  }, [value]);

  // Committing a command turns it into a chip; the input then holds only the
  // arguments — the "/name" can never degrade into ordinary prompt text.
  const pick = (c: ComposerCommand) => {
    setCommand(c.name);
    setValue("");
    taRef.current?.focus();
  };

  const onChange = (v: string) => {
    onInteract?.(); // typing pins a tentative preview screen (#3)
    setHist(null); // an edit leaves history navigation
    // A full known command name followed by whitespace commits it, same as a
    // pick — whether typed ("/init ") or pasted whole ("/init focus\n…"); the
    // remainder becomes the arguments. Unknown names (paths) stay plain text.
    if (onRunCommand && !command) {
      const m = /^\/(\S+)\s([\s\S]*)$/.exec(v);
      if (m && commands.some((c) => c.name === m[1])) {
        setCommand(m[1]);
        setValue(m[2]);
        taRef.current?.focus();
        return;
      }
    }
    setValue(v);
  };

  const unchip = () => {
    if (!command) return;
    setValue(value ? `/${command} ${value}` : `/${command}`);
    setCommand(null);
    taRef.current?.focus();
  };

  // Consume a draft another surface prepared (e.g. provenance "Reproduce") —
  // prefilled, never auto-sent: the user reviews and presses send. Text the
  // user was already typing is kept, with the draft appended below it.
  useEffect(() => {
    if (composerDraft === null) return;
    setValue((v) => (v.trim() ? `${v.trimEnd()}\n\n${composerDraft}` : composerDraft));
    setComposerDraft(null);
    taRef.current?.focus();
  }, [composerDraft, setComposerDraft]);

  // Auto-grow with the content, scroll internally beyond the cap.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [value]);

  const submit = () => {
    if (disabled) return;
    const text = value.trim();
    setHist(null);
    // A chipped command runs as itself — arguments optional.
    if (command) {
      onRunCommand?.(command, text);
      recordHistory(text ? `/${command} ${text}` : `/${command}`);
      setCommand(null);
      setValue("");
      return;
    }
    // "!" — run the rest of the line as a shell command (no model turn).
    if (shellMode) {
      const line = value.slice(1).trim();
      if (!line) return;
      onRunShell?.(line);
      recordHistory(`!${line}`);
      setValue("");
      return;
    }
    // "/name args" — run a KNOWN slash command; unknown names stay a prompt
    // (a message can legitimately start with a path like "/etc/hosts …").
    if (onRunCommand && text.startsWith("/")) {
      const name = text.slice(1).split(/\s/, 1)[0];
      if (commands.some((c) => c.name === name)) {
        onRunCommand(name, text.slice(1 + name.length).trim());
        recordHistory(text);
        setValue("");
        return;
      }
    }
    if (!text && files.length === 0) return;
    // Everything rides along as real parts: images as inline `file` parts (the
    // model sees them directly), documents as a `file` part plus an extra
    // `text` part carrying the locally-extracted UTF-8 text. No more
    // "Files added to the workspace: …" note in the prompt body.
    if (attachments.length > 0) onSend?.(text, attachments);
    else onSend?.(text);
    if (text) recordHistory(text);
    setValue("");
    setFiles([]);
    setAttachments([]);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // During IME composition (e.g. pinyin), Enter picks a candidate — it must
    // not send. WebKit reports the committing keydown as legacy keyCode 229.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    // While the palette is open, the keyboard drives it, not the send.
    if (paletteOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSel((i) => Math.min(i + 1, matches.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSel((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setPaletteClosed(true);
        return;
      }
      if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        pick(matches[selIndex]);
        return;
      }
    }
    // Backspace on an empty input dissolves the command chip back into text.
    if (e.key === "Backspace" && command && value === "") {
      e.preventDefault();
      unchip();
      return;
    }
    // Terminal-style history: ↑ at the very start of the input recalls the
    // previous sent input; while navigating, ↑/↓ walk older/newer and walking
    // past the newest restores the unsent draft. Any edit leaves navigation.
    if (e.key === "ArrowUp" && !command) {
      const el = taRef.current;
      const atStart = !!el && el.selectionStart === 0 && el.selectionEnd === 0;
      if (hist || atStart) {
        const entries = readHistory();
        const index = (hist ? hist.index : entries.length) - 1;
        if (index >= 0) {
          e.preventDefault();
          setHist({ index, draft: hist ? hist.draft : value });
          setValue(entries[index]);
        }
        return;
      }
    }
    if (e.key === "ArrowDown" && hist) {
      e.preventDefault();
      const entries = readHistory();
      const index = hist.index + 1;
      if (index < entries.length) {
        setHist({ ...hist, index });
        setValue(entries[index]);
      } else {
        setValue(hist.draft);
        setHist(null);
      }
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  // Very long pastes become a workspace file chip instead of flooding the box;
  // a pasted image (screenshot) becomes an image file chip. Both land in the
  // draft's own folder (materialized first) so the session can see them.
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    if (!isTauri || !onSend) return;
    // A clipboard image — works the same across macOS/Windows/Linux webviews,
    // which all expose the bitmap as an `image/*` clipboard item.
    const imageItem = Array.from(e.clipboardData.items ?? []).find((it) =>
      it.type.startsWith("image/"),
    );
    const blob = imageItem?.getAsFile();
    if (blob) {
      e.preventDefault();
      void (async () => {
        try {
          const compressed = await compressImage(blob, `pasted.${imageExt(blob.type)}`);
          const displayName = uniqueDisplayName(files, compressed.filename);
          setFiles((f) => [...f, displayName]);
          setAttachments((a) => [
            ...a,
            { filename: displayName, mime: compressed.mime, base64: compressed.base64 },
          ]);
        } catch (err) {
          toast.error(
            t("composer.error.paste", {
              message: err instanceof Error ? err.message : String(err),
            }),
          );
        }
      })();
      return;
    }
    const text = e.clipboardData.getData("text/plain");
    if (text.length <= PASTE_AS_FILE_CHARS && text.split("\n").length <= PASTE_AS_FILE_LINES) {
      return; // normal paste
    }
    e.preventDefault();
    void addWorkspaceFile(() => addTextToWorkspace("pasted.txt", text));
  };

  // Shared: materialize the draft's folder, run the write, and chip the result
  // (one file or several — paste yields one, a multi-file drop yields many).
  const addWorkspaceFile = async (write: () => Promise<string | string[]>) => {
    try {
      await useRuntimeStore.getState().ensureDraftWorkspace();
      const res = await write();
      const names = Array.isArray(res) ? res : [res];
      if (names.length > 0) setFiles((f) => [...f, ...names]);
      // Load bytes for anything the model can consume directly:
      //  - raster images → inline `file` part (the read tool can't surface
      //    image bytes, so the prompt itself must carry them);
      //  - pdf/docx/txt/md/csv → `file` part + locally-extracted UTF-8 text as
      //    an extra `text` part (model reads immediately, no skill cold-start).
      for (const name of names) {
        const image = isRasterImage(name);
        const doc = !image && isDocTextExt(name);
        if (!image && !doc) continue;
        try {
          const { mime, base64 } = await readWorkspaceFileBase64(name);
          if (image) {
            setAttachments((a) => [...a, { filename: name, mime, base64 }]);
            continue;
          }
          // Doc branch: extract text on-device. An image-only PDF returns "";
          // we still attach the bytes and a short fallback hint so the agent
          // knows to reach for the pdf-explore skill.
          let extractedText: string | undefined;
          try {
            const bytes = base64ToBytes(base64);
            const { text, fallback } = await extractDocText(name, bytes);
            extractedText = text || fallback || undefined;
          } catch (err) {
            void logDebug(
              `已尝试解析文档 ${name} 失败:${err instanceof Error ? err.message : String(err)}`,
            );
          }
          setAttachments((a) => [
            ...a,
            { filename: name, mime: mime || docMime(name), base64, extractedText },
          ]);
        } catch (err) {
          void logDebug(
            `已尝试加载附件 ${name} 失败:${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    } catch (err) {
      toast.error(
        t("composer.error.paste", {
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  };

  // Latest drop handler, kept in a ref so the native subscription below can run
  // exactly once yet always invoke current logic. Re-subscribing on every render
  // (the previous `[onSend]` dep — onSend is a fresh function each render) leaked
  // native listeners under render churn, so one drop copied the file ~150 times
  // into the project root (issue #44). null when drops aren't accepted.
  const onDropRef = useRef<((paths: string[]) => void) | null>(null);
  onDropRef.current =
    isTauri && onSend
      ? (paths) => {
          if (paths.length === 0) return;
          // Split raster images from everything else. Images are compressed and
          // attached directly (no workspace copy); other files still enter the
          // workspace so the agent's `read` tool can reach them.
          const imagePaths = paths.filter((p) => isRasterImage(p));
          const otherPaths = paths.filter((p) => !isRasterImage(p));

          // Images — read, compress, attach (no disk copy).
          if (imagePaths.length > 0) {
            void (async () => {
              for (const p of imagePaths) {
                try {
                  const { mime, base64 } = await readLocalFileBase64(p);
                  const raw = base64ToBytes(base64);
                  const blob = new Blob([raw.buffer as ArrayBuffer], { type: mime });
                  const compressed = await compressImage(blob, basename(p));
                  const name = uniqueDisplayName(files, compressed.filename);
                  setFiles((f) => [...f, name]);
                  setAttachments((a) => [
                    ...a,
                    { filename: name, mime: compressed.mime, base64: compressed.base64 },
                  ]);
                } catch (err) {
                  void logDebug(
                    `image drop attach failed for ${basename(p)}: ${err instanceof Error ? err.message : String(err)}`,
                  );
                }
              }
            })();
          }

          // Non-images — workspace copy + doc-text extraction (existing path).
          if (otherPaths.length > 0) {
            void addWorkspaceFile(() => addPathsToWorkspace(otherPaths));
          }
        }
      : null;

  // Drag-and-drop files onto the app → workspace chips. Tauri captures OS file
  // drops natively (the DOM `drop` event never sees them), so we subscribe to
  // its webview drag-drop event, which hands us absolute paths. Subscribed once
  // for the composer's lifetime; a drop anywhere in the window attaches here.
  useEffect(() => {
    if (!isTauri) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void (async () => {
      try {
        const { getCurrentWebview } = await import("@tauri-apps/api/webview");
        const un = await getCurrentWebview().onDragDropEvent((event) => {
          const p = event.payload;
          if (p.type === "enter" || p.type === "over") setDragOver(true);
          else if (p.type === "leave") setDragOver(false);
          else if (p.type === "drop") {
            setDragOver(false);
            onDropRef.current?.(p.paths);
          }
        });
        if (cancelled) un();
        else unlisten = un;
      } catch (err) {
        // The webview drag-drop API can be unavailable (partial Tauri bridge,
        // test env) — native file drops are an enhancement, so degrade quietly
        // rather than surfacing an unhandled rejection.
        void logDebug(`composer drag-drop unavailable: ${err instanceof Error ? err.message : String(err)}`);
      }
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // Copy local files into the agent workspace; they appear as chips. Route
  // through addWorkspaceFile so raster images / doc-text files also get their
  // base64 + locally-extracted text loaded — otherwise picked files land as
  // name-only chips and lose the inline preview + fast-read behavior that
  // paste and drop already have (bug #NN).
  const addFiles = async () => {
    setAdding(true);
    try {
      await addWorkspaceFile(() => addFilesToWorkspace());
    } finally {
      setAdding(false);
    }
  };

  const canAttach = isTauri && !!onSend;
  const canSend =
    !disabled &&
    (command
      ? true // a chipped command may run without arguments
      : shellMode
        ? value.slice(1).trim().length > 0
        : !!value.trim() || files.length > 0);

  return (
    <div
      className={cn(
        "relative rounded-card border bg-surface px-2 py-2 shadow-card",
        // Plan mode gets the blue link tone — distinct from shell (warn) and
        // a chipped command (accent) — so a read-only turn is unmistakable.
        shellMode
          ? "border-warn/60"
          : command
            ? "border-accent/50"
            : agentMode === "plan"
              ? "border-link/60"
              : "border-border",
        // Dragging a file over the window: highlight the composer as the target.
        dragOver && "border-accent ring-2 ring-accent/40",
      )}
    >
      {paletteOpen && (
        <div
          role="listbox"
          aria-label={t("composer.commandsAria")}
          className="absolute bottom-full left-0 right-0 z-20 mb-2 max-h-64 overflow-y-auto rounded-card border border-border bg-surface p-1 shadow-card"
        >
          {matches.map((c, i) => (
            <button
              key={c.name}
              role="option"
              aria-selected={i === selIndex}
              className={cn(
                "flex w-full items-baseline gap-2 rounded-input px-2 py-1.5 text-left",
                i === selIndex ? "bg-surface-2" : "hover:bg-surface-2",
              )}
              // mousedown, not click — a click would blur the textarea first.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(c);
              }}
            >
              <span className="shrink-0 font-mono text-xs text-text">/{c.name}</span>
              {c.description && (
                <span className="min-w-0 flex-1 truncate text-xs text-muted">{c.description}</span>
              )}
              {(c.source === "skill" || c.source === "mcp") && (
                <span className="shrink-0 rounded px-1 py-0.5 text-[10px] uppercase text-muted ring-1 ring-border">
                  {c.source === "skill" ? t("composer.source.skill") : t("composer.source.mcp")}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-1 pb-2">
          {files.map((name) => {
            const att = attachments.find((a) => a.filename === name);
            const isImage = !!att && att.mime.startsWith("image/");
            const isDoc = !!att && !isImage;
            const wordCount = isDoc && att?.extractedText
              ? att.extractedText.trim().split(/\s+/).filter(Boolean).length
              : 0;
            return (
              <span
                key={name}
                className="flex items-center gap-1.5 rounded-input bg-surface-2 py-1 pl-1.5 pr-1 font-mono text-xs text-text ring-1 ring-border"
              >
                {isImage && att ? (
                  <img
                    src={`data:${att.mime};base64,${att.base64}`}
                    alt={name}
                    className="h-6 w-6 shrink-0 rounded object-cover ring-1 ring-border"
                  />
                ) : isDoc ? (
                  <FileText size={12} className="shrink-0 text-muted" />
                ) : (
                  <Paperclip size={11} className="shrink-0 text-muted" />
                )}
                <span className="max-w-[220px] truncate">{name}</span>
                {isDoc && wordCount > 0 && (
                  <span
                    className="shrink-0 text-[10px] text-muted"
                    title={t("composer.attach.summaryTitle", { count: wordCount })}
                  >
                    {t("composer.attach.summaryWords", { count: wordCount })}
                  </span>
                )}
                <button
                  className="rounded p-0.5 text-muted hover:bg-border hover:text-text"
                  aria-label={t("composer.file.removeAria", { name })}
                  onClick={() => {
                    setFiles((f) => f.filter((n) => n !== name));
                    setAttachments((a) => a.filter((at) => at.filename !== name));
                  }}
                >
                  <X size={11} />
                </button>
              </span>
            );
          })}
        </div>
      )}
      <textarea
        ref={taRef}
        rows={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        placeholder={
          command
            ? t("composer.placeholder.arguments")
            : shellMode
              ? t("composer.placeholder.shell")
              : resolvedPlaceholder
        }
        className={cn(
          "max-h-[160px] w-full resize-none bg-transparent px-1.5 py-0.5 text-sm leading-6 text-text outline-none placeholder:text-muted",
          (shellMode || command) && "font-mono",
        )}
        aria-label={t("composer.placeholder.default")}
      />
      {/* Codex-style action row: mode controls bottom-left, send bottom-right.
          `flex-wrap` so a narrow (tiled) pane wraps the controls to a second
          line instead of overflowing outside the box. */}
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        {command ? (
          <span
            className="flex h-7 shrink-0 items-center gap-1 rounded-input bg-accent/15 pl-2 pr-1 font-mono text-xs text-accent"
            title={t("composer.command.chipTitle")}
          >
            /{command}
            <button
              className="rounded p-0.5 hover:bg-accent/20"
              aria-label={t("composer.command.removeAria")}
              onClick={unchip}
            >
              <X size={11} />
            </button>
          </span>
        ) : shellMode ? (
          <span
            className="flex h-7 shrink-0 items-center gap-1 rounded-input bg-warn/15 px-1.5 font-mono text-xs text-warn"
            title={t("composer.shellMode.title")}
          >
            <Terminal size={13} />
            {t("composer.shellMode.badge")}
          </span>
        ) : (
          canAttach && (
            <button
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-input text-muted hover:bg-surface-2 hover:text-text disabled:opacity-40"
              aria-label={t("composer.attach.addAria")}
              title={t("composer.attach.title")}
              onClick={() => void addFiles()}
              disabled={adding}
            >
              <Paperclip size={15} />
            </button>
          )
        )}
        {/* Folder picker for a fresh draft — renders nothing once the session
            exists (its folder then shows in the header's Files toggle). */}
        {showWorkspaceChip && <WorkspaceChip />}
        {agentMode && onAgentModeChange && (
          <div className="relative shrink-0" ref={agentRef}>
            {agentOpen && (
              <div
                role="menu"
                aria-label={t("composer.agent.menuAria")}
                className="absolute bottom-full left-0 z-20 mb-2 w-80 rounded-card border border-border bg-surface p-1 shadow-card"
              >
                <div className="px-2 pb-1 pt-1.5 text-xs text-muted">
                  {t("composer.agent.menuTitle")}
                </div>
                {AGENT_OPTIONS.map((opt) => (
                  <button
                    key={opt.mode}
                    role="menuitemradio"
                    aria-checked={opt.mode === agentMode}
                    className="flex w-full items-start gap-2 rounded-input px-2 py-1.5 text-left hover:bg-surface-2"
                    // mousedown, not click — a click would blur the textarea first.
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setAgentOpen(false);
                      if (opt.mode !== agentMode) onAgentModeChange(opt.mode);
                    }}
                  >
                    <opt.icon size={13} className="mt-0.5 shrink-0 text-muted" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs text-text">{agentCopy[opt.mode].label}</span>
                      <span className="block text-xs text-muted">
                        {agentCopy[opt.mode].description}
                      </span>
                    </span>
                    {opt.mode === agentMode && (
                      <Check size={13} className="mt-0.5 shrink-0 text-accent" />
                    )}
                  </button>
                ))}
              </div>
            )}
            <button
              aria-label={t("composer.agent.aria")}
              title={t("composer.agent.title")}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs",
                agentMode === "plan"
                  ? "bg-link/15 text-link hover:bg-link/25"
                  : "text-muted hover:bg-surface-2 hover:text-text",
              )}
              onClick={() => setAgentOpen((o) => !o)}
            >
              {agentMode === "plan" ? <ClipboardList size={12} /> : <Hammer size={12} />}
              <span>{agentCopy[agentMode].label}</span>
              <ChevronDown size={11} />
            </button>
          </div>
        )}
        {approvalMode && onApprovalModeChange && !isGatewayWeb && (
          <div className="relative shrink-0" ref={approvalRef}>
            {approvalOpen && (
              <div
                role="menu"
                aria-label={t("composer.approval.menuAria")}
                className="absolute bottom-full left-0 z-20 mb-2 w-80 rounded-card border border-border bg-surface p-1 shadow-card"
              >
                <div className="px-2 pb-1 pt-1.5 text-xs text-muted">
                  {t("composer.approval.menuTitle")}
                </div>
                {APPROVAL_OPTIONS.map((opt) => (
                  <button
                    key={opt.mode}
                    role="menuitemradio"
                    aria-checked={opt.mode === approvalMode}
                    className="flex w-full items-start gap-2 rounded-input px-2 py-1.5 text-left hover:bg-surface-2"
                    // mousedown, not click — a click would blur the textarea first.
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setApprovalOpen(false);
                      if (opt.mode !== approvalMode) onApprovalModeChange(opt.mode);
                    }}
                  >
                    <opt.icon size={13} className="mt-0.5 shrink-0 text-muted" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs text-text">{approvalCopy[opt.mode].label}</span>
                      <span className="block text-xs text-muted">
                        {approvalCopy[opt.mode].description}
                      </span>
                    </span>
                    {opt.mode === approvalMode && (
                      <Check size={13} className="mt-0.5 shrink-0 text-accent" />
                    )}
                  </button>
                ))}
              </div>
            )}
            <button
              aria-label={t("composer.approval.aria")}
              title={t("composer.approval.title")}
              className="flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs text-muted hover:bg-surface-2 hover:text-text"
              onClick={() => setApprovalOpen((o) => !o)}
            >
              {approvalMode === "full" ? <Zap size={12} /> : <Hand size={12} />}
              <span>{approvalCopy[approvalMode].label}</span>
              <ChevronDown size={11} />
            </button>
          </div>
        )}
        {/* Model picker + send kept together, pushed right (and wrapping as a
            unit) so the send button is always reachable on a narrow pane. */}
        <div className="ml-auto flex min-w-0 items-center gap-1.5">
          {showModelPicker && <ModelPicker sessionId={modelSessionId} />}
          {working && onStop ? (
            // Same spot, same shape, one action: the send button becomes Stop
            // while the agent works — always live, even though the input is not.
            <button
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-input bg-accent text-accent-fg hover:opacity-90"
              aria-label={t("composer.stop.aria")}
              title={t("composer.stop.title")}
              onClick={onStop}
            >
              <Square size={11} fill="currentColor" />
            </button>
          ) : (
            <button
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-input bg-accent text-accent-fg hover:opacity-90 disabled:opacity-40"
              aria-label={t("composer.send.aria")}
              onClick={submit}
              disabled={!canSend}
            >
              <ArrowUp size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
