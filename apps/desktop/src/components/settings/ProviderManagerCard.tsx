import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import type { ProviderInfo } from "@zerowall/sdk";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import { Section } from "./Section";

interface ProviderManagerCardProps {
  providers: ProviderInfo[];
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  children: ReactNode;
}

export function ProviderManagerCard({
  providers,
  expanded,
  onExpandedChange,
  children,
}: ProviderManagerCardProps) {
  const { t } = useTranslation("settings");
  const names = providers.map((provider) => provider.name).join(", ");
  const summary = providers.length
    ? t("providers.connectedSummary", { count: providers.length, names })
    : t("providers.noneConnected");

  // Check if we're in ACP mode (Claude Code / Codex) by looking at localStorage
  const isAcpMode = typeof window !== "undefined" &&
    window.localStorage.getItem("zerowall.acp.profileId.v1") !== null &&
    window.localStorage.getItem("zerowall.acp.profileId.v1") !== "";

  return (
    <Section
      title={t("providers.title")}
      hint={isAcpMode ? t("providers.hintAcp") : t("providers.hint")}
      action={
        /* The toggle only shows/hides content — it must stay clickable in
           every runtime state, or a disconnect strands an expanded panel. */
        <button
          aria-expanded={expanded}
          onClick={() => onExpandedChange(!expanded)}
          className="flex h-8 shrink-0 items-center gap-1 rounded-input border border-transparent bg-surface-2 px-3 text-[13px] text-text transition-colors hover:bg-border/50 disabled:text-muted"
        >
          <ChevronRight size={13} className={cn("transition-transform", expanded && "rotate-90")} />
          {t(expanded ? "providers.collapse" : "providers.manage")}
        </button>
      }
      flush
    >
      {expanded ? (
        children
      ) : (
        <p className="truncate px-4 py-3 text-[13px] text-muted">{summary}</p>
      )}
    </Section>
  );
}
