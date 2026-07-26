import { useState } from "react";
import type { InstalledPack } from "@zerowall/shared";
import { useRuntimeStore } from "@/lib/runtime";
import { useTranslation } from "react-i18next";

interface PackCardProps {
  pack: InstalledPack;
}

export function PackCard({ pack }: PackCardProps) {
  const { t } = useTranslation("settings");
  const [isExpanded, setIsExpanded] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const enablePack = useRuntimeStore((s) => s.enablePack);
  const disablePack = useRuntimeStore((s) => s.disablePack);

  const isEnabled = pack.state === "installed";
  const hasError = pack.state === "error";

  const handleToggle = async () => {
    setIsProcessing(true);
    try {
      if (isEnabled) {
        await disablePack(pack.manifest.id);
      } else {
        await enablePack(pack.manifest.id);
      }
    } catch (err) {
      console.error("Pack toggle failed:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  const skillCount = pack.manifest.components.skills?.length || 0;
  const mcpCount = pack.manifest.components.mcpServers?.length || 0;
  const agentCount = pack.manifest.components.agents?.length || 0;
  const connectorCount = pack.manifest.components.connectors?.length || 0;

  const componentCounts = [
    skillCount > 0 && `${skillCount} ${t("packs.skills")}`,
    mcpCount > 0 && `${mcpCount} ${t("packs.mcpServers")}`,
    agentCount > 0 && `${agentCount} ${t("packs.agents")}`,
    connectorCount > 0 && `${connectorCount} ${t("packs.connectors")}`,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="border border-border rounded-lg p-4 hover:bg-accent/5 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-medium text-foreground">{pack.manifest.name}</h3>
            {/* eslint-disable-next-line i18next/no-literal-string -- "v" is version-number notation (v1.2.3), not prose */}
            <span className="text-xs text-muted-foreground">v{pack.manifest.version}</span>
            {hasError && (
              <span className="text-xs text-red-600 dark:text-red-400">
                {t("packs.error")}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mb-2">{pack.manifest.description}</p>
          {componentCounts && (
            <p className="text-xs text-muted-foreground">{componentCounts}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent transition-colors"
            disabled={isProcessing}
          >
            {isExpanded ? t("packs.collapse") : t("packs.expand")}
          </button>
          <button
            onClick={handleToggle}
            disabled={isProcessing || hasError}
            className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
              isEnabled
                ? "border-border hover:bg-accent"
                : "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isProcessing
              ? t("packs.processing")
              : isEnabled
                ? t("packs.disable")
                : t("packs.enable")}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-border space-y-3">
          {pack.manifest.author && (
            <div className="text-xs">
              <span className="text-muted-foreground">{t("packs.author")}: </span>
              <span className="text-foreground">{pack.manifest.author.name}</span>
            </div>
          )}

          {pack.manifest.license && (
            <div className="text-xs">
              <span className="text-muted-foreground">{t("packs.license")}: </span>
              <span className="text-foreground">{pack.manifest.license}</span>
            </div>
          )}

          <div className="text-xs">
            <span className="text-muted-foreground">{t("packs.source")}: </span>
            <span className="font-mono text-xs text-foreground">
              {pack.manifest.source.repo.split("/").slice(-2).join("/")}@
              {pack.manifest.source.commit.slice(0, 7)}
            </span>
          </div>

          {pack.manifest.components.skills && pack.manifest.components.skills.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs font-medium text-foreground">
                {t("packs.skills")}:
              </div>
              <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                {pack.manifest.components.skills.map((skill) => (
                  <div key={skill.id} className="flex items-center gap-1">
                    <span
                      className={`inline-block w-1.5 h-1.5 rounded-full ${
                        skill.enabled !== false ? "bg-green-500" : "bg-gray-400"
                      }`}
                    />
                    {skill.name}
                  </div>
                ))}
              </div>
            </div>
          )}

          {pack.error && (
            <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 p-2 rounded">
              {pack.error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
