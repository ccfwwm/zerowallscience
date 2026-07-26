/**
 * Science Pack registry and loader.
 *
 * Validates and registers Science Pack manifests. Reading them is deliberately
 * NOT this module's job: the registry is reached from the Tauri webview and the
 * gateway web client, neither of which can resolve Node's `fs`. It used to call
 * `fs.readdir` here, so `load()` rejected in both shells and the Packs screen
 * showed "no packs" while six manifests sat on disk.
 *
 * The caller supplies already-read manifest text instead — the desktop app
 * bundles it at build time with `import.meta.glob`, the same way the agent JSON
 * under `runtime/agents/` is bundled. That keeps the manifests in
 * `runtime/packs/` the single source of truth and turns a malformed manifest
 * into a build failure rather than an empty list at runtime.
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

/** One unparsed manifest plus the directory it came from. */
export interface PackManifestSource {
  /** Pack directory, used as the entry's `path` and in error messages. */
  path: string;
  /** Raw `manifest.yaml` text. */
  yaml: string;
}

/** Pack registry singleton */
export class PackRegistry {
  private packs = new Map<string, PackRegistryEntry>();
  private loaded = false;

  /**
   * Parse, validate, and register a set of manifests.
   *
   * An individual invalid manifest is skipped and reported rather than failing
   * the whole load — one bad pack must not cost the user the other five. ID
   * collisions do throw: two packs answering to one id makes every later lookup
   * ambiguous.
   */
  loadFromSources(sources: PackManifestSource[]): void {
    const manifests: Array<{ manifest: SciencePackManifestV1; path: string }> = [];

    for (const source of sources) {
      try {
        const data = parseYaml(source.yaml);
        if (validatePackManifest(data)) {
          manifests.push({ manifest: data, path: source.path });
        }
      } catch (err) {
        console.warn(`Failed to load pack manifest at ${source.path}:`, err);
      }
    }

    const collisions = detectPackCollisions(manifests.map((m) => m.manifest));
    if (collisions.length > 0) {
      throw new Error(`Pack ID collisions detected: ${collisions.join(", ")}`);
    }

    for (const { manifest, path } of manifests) {
      this.packs.set(manifest.id, { manifest, path, state: "installed" });
    }

    this.loaded = true;
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

/** Register a set of manifests read by the caller. */
export function loadPackRegistry(sources: PackManifestSource[]): void {
  packRegistry.loadFromSources(sources);
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
