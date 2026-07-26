import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRuntimeStore } from "@/lib/runtime";
import { isTauri, workspaceScienceDb, type ScienceDbStatus } from "@/lib/tauri";
import { Row, Section } from "./Section";

/**
 * What is actually loaded in this workspace: the science database, the bundled
 * skill packs, and the connectors.
 *
 * All three were already provisioned automatically — the database is migrated
 * during workspace preparation, the skill packs deploy into the app-private
 * OpenCode profile at sidecar start — but nothing said so, which made a healthy
 * install look empty. A store that fails to open and a store that was never
 * mentioned are indistinguishable to the user; this card tells them apart.
 */
export function WorkspaceStatusCard({ connectorCount }: { connectorCount: number }) {
  const { t } = useTranslation("settings");
  const packs = useRuntimeStore((s) => s.installedPacks);
  const [db, setDb] = useState<ScienceDbStatus | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauri) return;
    void workspaceScienceDb()
      .then((status) => {
        setDb(status);
        setDbError(null);
      })
      .catch((err: unknown) => setDbError(err instanceof Error ? err.message : String(err)));
  }, []);

  const enabledPacks = packs.filter((p) => p.state === "installed");
  const skillCount = enabledPacks.reduce(
    (sum, p) => sum + (p.manifest.components.skills?.length ?? 0),
    0,
  );

  return (
    <Section title={t("workspaceStatus.title")} hint={t("workspaceStatus.hint")} flush>
      <Row
        title={t("workspaceStatus.database")}
        hint={t("workspaceStatus.databaseHint")}
        control={
          <span className="text-[13px] text-muted">
            {dbError
              ? t("workspaceStatus.databaseFailed")
              : db
                ? t("workspaceStatus.databaseReady", {
                    version: db.version,
                    tables: db.tableCount,
                    migrations: db.appliedMigrationIds.length,
                  })
                : isTauri
                  ? t("workspaceStatus.checking")
                  : t("workspaceStatus.desktopOnly")}
          </span>
        }
      >
        {dbError && (
          <p className="mt-1.5 break-all font-mono text-[11px] text-error">{dbError}</p>
        )}
      </Row>
      <Row
        title={t("workspaceStatus.skills")}
        hint={t("workspaceStatus.skillsHint")}
        control={
          <span className="text-[13px] text-muted">
            {t("workspaceStatus.skillsCount", {
              skills: skillCount,
              packs: enabledPacks.length,
              total: packs.length,
            })}
          </span>
        }
      />
      <Row
        title={t("workspaceStatus.connectors")}
        hint={t("workspaceStatus.connectorsHint")}
        control={
          <span className="text-[13px] text-muted">
            {t("workspaceStatus.connectorsCount", { count: connectorCount })}
          </span>
        }
      />
    </Section>
  );
}
