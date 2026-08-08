import { LockKeyhole } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useRuntimeStore } from "@/lib/runtime";
import { cn } from "@/lib/cn";

const ENGINE_LABELS: Record<string, string> = {
  codex: "Codex",
  "claude-code": "Claude Code",
  opencode: "OpenCode",
};

export function SelectionSnapshot({ sessionId }: { sessionId?: string } = {}) {
  const { t } = useTranslation("session");
  const engine = useRuntimeStore((s) => s.acpProfileId);
  const currentId = useRuntimeStore((s) => s.currentId);
  const threadId = sessionId ?? currentId ?? undefined;
  const sessionModel = useRuntimeStore((s) => (threadId ? s.sessionModels[threadId] : undefined));
  const defaultModel = useRuntimeStore((s) => s.defaultModel);
  const model = sessionModel ?? defaultModel;
  const providers = useRuntimeStore((s) => s.providers);
  const commands = useRuntimeStore((s) => s.commands);
  const threads = useRuntimeStore((s) => s.threads);
  const blocks = threadId ? threads[threadId]?.blocks ?? [] : [];
  const locked = blocks.some((block) => block.kind === "user" || block.kind === "agent");
  const mcpCount = commands.filter((command) => command.source === "mcp").length;
  const skillsCount = commands.filter((command) => command.source === "skill").length;
  const providerName = model ? providers.find((provider) => provider.models.some((item) => `${provider.id}/${item.id}` === model))?.name : undefined;

  return (
    <div className={cn("flex min-w-0 items-center gap-1.5 text-[11px] text-muted", locked && "text-text/70")} aria-label={t("composer.snapshot.aria", { defaultValue: "Selection snapshot" })}>
      {locked && <LockKeyhole size={12} className="shrink-0" aria-hidden />}
      <span className="truncate" title={engine ? ENGINE_LABELS[engine] ?? engine : undefined}>
        {t("composer.snapshot.engine", { defaultValue: "Engine: {{engine}}", engine: engine ? ENGINE_LABELS[engine] ?? engine : "—" })}
      </span>
      <span className="text-muted/60">·</span>
      <span className="max-w-[150px] truncate" title={model ?? undefined}>
        {t("composer.snapshot.model", { defaultValue: "Model: {{model}}", model: model?.split("/").pop() ?? "—" })}
      </span>
      {providerName && <span className="hidden truncate text-muted/70 xl:inline">· {providerName}</span>}
      {(mcpCount > 0 || skillsCount > 0) && (
        <span className="hidden shrink-0 text-muted/70 lg:inline">
          · {mcpCount} {t("composer.snapshot.mcp", { defaultValue: "MCP" })} · {skillsCount} {t("composer.snapshot.skills", { defaultValue: "Skills" })}
        </span>
      )}
      {locked && <span className="shrink-0 text-accent">{t("composer.snapshot.locked", { defaultValue: "Locked" })}</span>}
    </div>
  );
}
