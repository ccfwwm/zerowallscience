import { useRuntimeStore } from "@/lib/runtime";
import { PackCard } from "./PackCard";
import { useTranslation } from "react-i18next";

export function PacksSection() {
  const { t } = useTranslation("settings");
  const installedPacks = useRuntimeStore((s) => s.installedPacks);

  if (installedPacks.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-muted-foreground">
        <p className="text-sm">{t("packs.noPacks")}</p>
        <p className="text-xs mt-2">{t("packs.noPacksHint")}</p>
      </div>
    );
  }

  const enabledCount = installedPacks.filter((p) => p.state === "installed").length;
  const totalSkills = installedPacks.reduce(
    (sum, p) => sum + (p.manifest.components.skills?.length || 0),
    0,
  );

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-4">
        <span>
          {enabledCount} / {installedPacks.length} {t("packs.enabled")}
        </span>
        <span>
          {totalSkills} {t("packs.totalSkills")}
        </span>
      </div>

      <div className="space-y-3">
        {installedPacks.map((pack) => (
          <PackCard key={pack.manifest.id} pack={pack} />
        ))}
      </div>
    </div>
  );
}
