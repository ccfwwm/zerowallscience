import { useEffect, useRef, useState } from "react";
import { Bot, Check, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AgentEngine } from "@zerowall/sdk";
import type { ThreadBlock } from "@zerowall/shared";
import { cn } from "@/lib/cn";
import { useRuntimeStore } from "@/lib/runtime";
import { isGatewayWeb } from "@/lib/webMode";

const ENGINES: { id: AgentEngine; profileId: string | null; label: string }[] = [
  { id: "codex", profileId: "codex", label: "Codex" },
  { id: "claude-code", profileId: "claude-code", label: "Claude Code" },
  { id: "opencode", profileId: "opencode", label: "OpenCode" },
];

export function contextFromBlocks(blocks: ThreadBlock[]): string {
  return blocks.flatMap((block) => {
    if (block.kind === "user" && block.text.trim()) return [`User: ${block.text.trim()}`];
    if (block.kind === "agent" && block.markdown.trim()) return [`Assistant: ${block.markdown.trim()}`];
    if (block.kind === "tool-call") return [`Tool: ${block.title}`];
    return [];
  }).join("\n\n").slice(-24_000);
}


export function EnginePicker({ sessionId }: { sessionId?: string } = {}) {
  const { t } = useTranslation("session");
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const acpProfileId = useRuntimeStore((state) => state.acpProfileId);
  const switchRuntime = useRuntimeStore((state) => state.switchRuntime);
  const switching = useRuntimeStore((state) => state.switching);
  const sending = useRuntimeStore((state) => state.sending);
  const runningSessions = useRuntimeStore((state) => state.runningSessions);
  const currentId = useRuntimeStore((state) => state.currentId);
  const threadId = sessionId ?? currentId ?? undefined;
  const active = ENGINES.find((engine) => engine.profileId === acpProfileId) ?? ENGINES[2];
  const busy = switching || sending || (!!threadId && !!runningSessions[threadId]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  if (isGatewayWeb) return null;

  const select = async (engine: (typeof ENGINES)[number]) => {
    if (engine.id === active.id || busy) return;
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
          {ENGINES.map((engine) => (
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
            ))}
        </div>
      )}
    </div>
  );
}
