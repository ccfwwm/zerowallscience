import { useEffect, useRef, useState } from "react";
import { Bot, Check, ChevronDown, Copy, MessageSquarePlus, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ThreadBlock } from "@zerowall/shared";
import type { AgentEngine } from "@zerowall/sdk";
import { cn } from "@/lib/cn";
import { useRuntimeStore } from "@/lib/runtime";
import { useUiStore } from "@/lib/store";
import { isGatewayWeb } from "@/lib/webMode";

const ENGINES: { id: AgentEngine; profileId: string | null; label: string }[] = [
  { id: "codex", profileId: "codex", label: "Codex" },
  { id: "claude-code", profileId: "claude-code", label: "Claude Code" },
  { id: "opencode", profileId: "opencode", label: "OpenCode" },
];

export function contextFromBlocks(blocks: ThreadBlock[]): string {
  const lines: string[] = [];
  for (const block of blocks) {
    if (block.kind === "user" && block.text.trim()) lines.push(`User: ${block.text.trim()}`);
    if (block.kind === "agent" && block.markdown.trim()) {
      lines.push(`Assistant: ${block.markdown.trim()}`);
    }
    if (block.kind === "tool-call") lines.push(`Tool: ${block.title}`);
  }
  return lines.join("\n\n").slice(-24_000);
}

export function EnginePicker({ sessionId }: { sessionId?: string } = {}) {
  const { t } = useTranslation("session");
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<(typeof ENGINES)[number] | null>(null);
  const acpProfileId = useRuntimeStore((state) => state.acpProfileId);
  const switchRuntime = useRuntimeStore((state) => state.switchRuntime);
  const startDraft = useRuntimeStore((state) => state.startDraft);
  const currentId = useRuntimeStore((state) => state.currentId);
  const threads = useRuntimeStore((state) => state.threads);
  const switching = useRuntimeStore((state) => state.switching);
  const sending = useRuntimeStore((state) => state.sending);
  const runningSessions = useRuntimeStore((state) => state.runningSessions);
  const setComposerDraft = useUiStore((state) => state.setComposerDraft);
  const active = ENGINES.find((engine) => engine.profileId === acpProfileId) ?? ENGINES[2];
  const threadId = sessionId ?? currentId ?? undefined;
  const blocks = threadId ? (threads[threadId]?.blocks ?? []) : [];
  const hasContext = blocks.some((block) => block.kind === "user" || block.kind === "agent");
  const busy = switching || sending || (!!threadId && !!runningSessions[threadId]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setPending(null);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  if (isGatewayWeb) return null;

  const apply = async (engine: (typeof ENGINES)[number], copyContext: boolean) => {
    if (busy) return;
    const context = copyContext ? contextFromBlocks(blocks) : "";
    startDraft();
    if (context) {
      setComposerDraft(
        `${t("composer.engine.continuePrompt", {
          defaultValue: "Continue from this conversation context:",
        })}\n\n${context}`,
      );
    }
    setPending(null);
    setOpen(false);
    await switchRuntime(engine.profileId);
  };

  const select = async (engine: (typeof ENGINES)[number]) => {
    if (engine.id === active.id || busy) return;
    if (hasContext) {
      setPending(engine);
      return;
    }
    setOpen(false);
    await switchRuntime(engine.profileId);
  };

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        aria-label={t("composer.engine.aria", { defaultValue: "Switch engine" })}
        title={t("composer.engine.title", { defaultValue: "Agent engine" })}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        className="flex h-7 max-w-[150px] items-center gap-1.5 rounded-full px-2.5 text-xs text-muted hover:bg-surface-2 hover:text-text disabled:opacity-40"
        onClick={() => {
          setPending(null);
          setOpen((value) => !value);
        }}
      >
        <Bot size={12} className="shrink-0" />
        <span className="truncate text-text">{active.label}</span>
        <ChevronDown size={11} className="shrink-0" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={t("composer.engine.title", { defaultValue: "Agent engine" })}
          className="absolute bottom-full right-0 z-30 mb-2 w-[260px] overflow-hidden rounded-card border border-border bg-surface p-1 shadow-pop"
        >
          {pending ? (
            <>
              <div className="flex items-center gap-2 px-2 py-2 text-xs font-medium text-text">
                <span className="min-w-0 flex-1 truncate">
                  {t("composer.engine.changeTo", {
                    defaultValue: "Switch to {{engine}}",
                    engine: pending.label,
                  })}
                </span>
                <button
                  aria-label={t("composer.engine.cancel", { defaultValue: "Cancel" })}
                  className="rounded-input p-1 text-muted hover:bg-surface-2 hover:text-text"
                  onClick={() => setPending(null)}
                >
                  <X size={13} />
                </button>
              </div>
              <button
                role="menuitem"
                disabled={busy}
                className="flex w-full items-center gap-2 rounded-input px-2 py-2 text-left text-xs text-text hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
                onClick={() => void apply(pending, false)}
              >
                <MessageSquarePlus size={13} className="text-muted" />
                {t("composer.engine.newConversation", { defaultValue: "New conversation" })}
              </button>
              <button
                role="menuitem"
                disabled={busy}
                className="flex w-full items-center gap-2 rounded-input px-2 py-2 text-left text-xs text-text hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
                onClick={() => void apply(pending, true)}
              >
                <Copy size={13} className="text-muted" />
                {t("composer.engine.copyContext", { defaultValue: "Copy context" })}
              </button>
            </>
          ) : (
            ENGINES.map((engine) => (
              <button
                key={engine.id}
                role="menuitemradio"
                aria-checked={engine.id === active.id}
                className={cn(
                  "flex w-full items-center gap-2 rounded-input px-2 py-2 text-left text-xs hover:bg-surface-2",
                  engine.id === active.id ? "text-text" : "text-muted hover:text-text",
                )}
                onClick={() => void select(engine)}
              >
                <Check
                  size={13}
                  className={cn("text-accent", engine.id === active.id ? "opacity-100" : "opacity-0")}
                />
                <span>{engine.label}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
