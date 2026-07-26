/**
 * Science Pack registry and loader.
 *
 * Discovers, validates, and loads Science Pack manifests from the runtime directory.
 */

import { parse as parseYaml } from "yaml";
import type {
  SciencePackManifestV1,
  InstalledPack,
  PackState,
} from "@zerowall/shared";
import { validatePackManifest, detectPackCollisions } from "@zerowall/shared";

export interface PackRegistryEntry {
  /** Pack manifest */
  manifest: SciencePackManifestV1;
  /** Filesystem path to pack directory */
  path: string;
  /** Installation state */
  state: PackState;
}

/** Pack registry singleton */
export class PackRegistry {
  private packs = new Map<string, PackRegistryEntry>();
  private loaded = false;

  /** Load all packs from runtime/packs directory */
  async load(runtimePath: string): Promise<void> {
    if (this.loaded) return;

    const fs = await import("fs/promises");
    const path = await import("path");

    const packsDir = path.join(runtimePath, "packs");

    try {
      const entries = await fs.readdir(packsDir, { withFileTypes: true });
      const packDirs = entries.filter((e) => e.isDirectory());

      const manifests: Array<{ manifest: SciencePackManifestV1; path: string }> = [];

      for (const dir of packDirs) {
        const packPath = path.join(packsDir, dir.name);
        const manifestPath = path.join(packPath, "manifest.yaml");

        try {
          const content = await fs.readFile(manifestPath, "utf-8");
          const data = parseYaml(content);

          if (validatePackManifest(data)) {
            manifests.push({ manifest: data, path: packPath });
          }
        } catch (err) {
          console.warn(`Failed to load pack ${dir.name}:`, err);
        }
      }

      // Check for ID collisions
      const collisions = detectPackCollisions(manifests.map((m) => m.manifest));
      if (collisions.length > 0) {
        throw new Error(`Pack ID collisions detected: ${collisions.join(", ")}`);
      }

      // Register all valid packs
      for (const { manifest, path } of manifests) {
        this.packs.set(manifest.id, {
          manifest,
          path,
          state: "installed",
        });
      }

      this.loaded = true;
    } catch (err) {
      console.error("Failed to load pack registry:", err);
      throw err;
    }
  }

  /** Get all registered packs */
  listPacks(): PackRegistryEntry[] {
    return Array.from(this.packs.values());
  }

  /** Get a specific pack by ID */
  getPack(id: string): PackRegistryEntry | undefined {
    return this.packs.get(id);
  }

  /** Get all skills across all packs */
  listAllSkills(): Array<{
    packId: string;
    packName: string;
    skill: NonNullable<SciencePackManifestV1["components"]["skills"]>[number];
  }> {
    const skills: Array<{
      packId: string;
      packName: string;
      skill: NonNullable<SciencePackManifestV1["components"]["skills"]>[number];
    }> = [];

    for (const entry of this.packs.values()) {
      const packSkills = entry.manifest.components.skills || [];
      for (const skill of packSkills) {
        skills.push({
          packId: entry.manifest.id,
          packName: entry.manifest.name,
          skill,
        });
      }
    }

    return skills;
  }

  /** Get enabled skills only */
  listEnabledSkills(): Array<{
    packId: string;
    packName: string;
    skill: NonNullable<SciencePackManifestV1["components"]["skills"]>[number];
  }> {
    return this.listAllSkills().filter(
      (s) => s.skill.enabled !== false,
    );
  }

  /** Check if registry is loaded */
  isLoaded(): boolean {
    return this.loaded;
  }

  /** Clear registry (for testing) */
  clear(): void {
    this.packs.clear();
    this.loaded = false;
  }
}

/** Global registry instance */
export const packRegistry = new PackRegistry();

/** Load packs from runtime directory */
export async function loadPackRegistry(runtimePath: string): Promise<void> {
  await packRegistry.load(runtimePath);
}

/** Get installed packs for UI display */
export function getInstalledPacks(): InstalledPack[] {
  const entries = packRegistry.listPacks();
  const now = new Date().toISOString();

  return entries.map((entry) => ({
    manifest: entry.manifest,
    state: entry.state,
    installedAt: now, // TODO: Track actual installation time
    path: entry.path,
  }));
}

/** Get skill count across all packs */
export function getTotalSkillCount(): number {
  return packRegistry.listAllSkills().length;
}

/** Get enabled skill count */
export function getEnabledSkillCount(): number {
  return packRegistry.listEnabledSkills().length;
}
