/**
 * Science Pack Manager - Lifecycle operations for pack installation and management.
 *
 * Handles install, upgrade, enable/disable, uninstall, rollback, and verification.
 */

import type {
  SciencePackManifestV1,
  SciencePackManager as ISciencePackManager,
  InstalledPack,
  PackState,
} from "@zerowall/shared";
import { validatePackManifest } from "@zerowall/shared";
import { packRegistry } from "./pack-registry";
import { parse as parseYaml } from "yaml";

export class SciencePackManager implements ISciencePackManager {
  private packsDir: string;
  private stateFile: string;
  private packStates = new Map<string, PackState>();

  constructor(runtimePath: string) {
    const path = require("path");
    this.packsDir = path.join(runtimePath, "packs");
    this.stateFile = path.join(runtimePath, "pack-state.json");
  }

  /** Initialize manager and load pack states */
  async initialize(): Promise<void> {
    await this.loadPackStates();
    await packRegistry.load(this.packsDir.replace(/[/\\]packs$/, ""));
  }

  /** List all installed packs */
  async listInstalled(): Promise<InstalledPack[]> {
    const entries = packRegistry.listPacks();
    const now = new Date().toISOString();

    return entries.map((entry) => ({
      manifest: entry.manifest,
      state: this.packStates.get(entry.manifest.id) || entry.state,
      installedAt: now, // TODO: Track actual installation time from state file
      path: entry.path,
    }));
  }

  /** Install a pack from catalog or file */
  async install(source: string): Promise<InstalledPack> {
    const fs = await import("fs/promises");
    const path = await import("path");

    // For now, only support local directory installation
    // Future: support remote URLs, tar.gz archives, etc.

    let manifest: SciencePackManifestV1;
    let sourcePath: string;

    if (await this.isDirectory(source)) {
      // Local directory
      const manifestPath = path.join(source, "manifest.yaml");
      const content = await fs.readFile(manifestPath, "utf-8");
      const data = parseYaml(content);

      if (!validatePackManifest(data)) {
        throw new Error("Invalid pack manifest");
      }

      manifest = data;
      sourcePath = source;
    } else {
      throw new Error("Only local directory installation is currently supported");
    }

    // Check if already installed
    const existing = packRegistry.getPack(manifest.id);
    if (existing) {
      throw new Error(`Pack ${manifest.id} is already installed`);
    }

    // Copy pack to runtime/packs directory
    const targetPath = path.join(this.packsDir, manifest.id);
    await this.copyDirectory(sourcePath, targetPath);

    // Update state
    this.packStates.set(manifest.id, "installed");
    await this.savePackStates();

    // Reload registry
    packRegistry.clear();
    await packRegistry.load(this.packsDir.replace(/[/\\]packs$/, ""));

    const now = new Date().toISOString();
    return {
      manifest,
      state: "installed",
      installedAt: now,
      path: targetPath,
    };
  }

  /** Upgrade an installed pack */
  async upgrade(packId: string, _targetVersion?: string): Promise<InstalledPack> {
    const pack = packRegistry.getPack(packId);
    if (!pack) {
      throw new Error(`Pack ${packId} is not installed`);
    }

    // TODO: Implement actual upgrade logic with targetVersion
    // For now, just mark as upgrading then installed
    this.packStates.set(packId, "upgrading");
    await this.savePackStates();

    // Simulate upgrade
    await new Promise((resolve) => setTimeout(resolve, 100));

    this.packStates.set(packId, "installed");
    const now = new Date().toISOString();
    await this.savePackStates();

    return {
      manifest: pack.manifest,
      state: "installed",
      installedAt: now,
      upgradedAt: now,
      path: pack.path,
    };
  }

  /** Enable all components in a pack */
  async enable(packId: string): Promise<void> {
    const pack = packRegistry.getPack(packId);
    if (!pack) {
      throw new Error(`Pack ${packId} is not installed`);
    }

    if (this.packStates.get(packId) === "disabled") {
      this.packStates.set(packId, "installed");
      await this.savePackStates();
    }
  }

  /** Disable all components in a pack (keeps installed) */
  async disable(packId: string): Promise<void> {
    const pack = packRegistry.getPack(packId);
    if (!pack) {
      throw new Error(`Pack ${packId} is not installed`);
    }

    this.packStates.set(packId, "disabled");
    await this.savePackStates();
  }

  /** Uninstall a pack */
  async uninstall(packId: string): Promise<void> {
    const pack = packRegistry.getPack(packId);
    if (!pack) {
      throw new Error(`Pack ${packId} is not installed`);
    }

    const fs = await import("fs/promises");

    // Remove pack directory
    await fs.rm(pack.path, { recursive: true, force: true });

    // Remove from state
    this.packStates.delete(packId);
    await this.savePackStates();

    // Reload registry
    packRegistry.clear();
    await packRegistry.load(this.packsDir.replace(/[/\\]packs$/, ""));
  }

  /** Rollback to previous version */
  async rollback(packId: string): Promise<InstalledPack> {
    const pack = packRegistry.getPack(packId);
    if (!pack) {
      throw new Error(`Pack ${packId} is not installed`);
    }

    // TODO: Implement version history tracking and rollback
    throw new Error("Rollback not yet implemented");
  }

  /** Verify pack integrity (SHA checksums) */
  async verify(packId: string): Promise<boolean> {
    const pack = packRegistry.getPack(packId);
    if (!pack) {
      throw new Error(`Pack ${packId} is not installed`);
    }

    // TODO: Implement SHA verification of pack files
    // For now, just verify manifest is parseable
    const fs = await import("fs/promises");
    const path = await import("path");

    try {
      const manifestPath = path.join(pack.path, "manifest.yaml");
      const content = await fs.readFile(manifestPath, "utf-8");
      const data = parseYaml(content);
      return validatePackManifest(data);
    } catch {
      return false;
    }
  }

  /** Get pack manifest without installing */
  async inspect(source: string): Promise<SciencePackManifestV1> {
    const fs = await import("fs/promises");
    const path = await import("path");

    if (await this.isDirectory(source)) {
      const manifestPath = path.join(source, "manifest.yaml");
      const content = await fs.readFile(manifestPath, "utf-8");
      const data = parseYaml(content);

      if (!validatePackManifest(data)) {
        throw new Error("Invalid pack manifest");
      }

      return data;
    }

    throw new Error("Only local directory inspection is currently supported");
  }

  /** Load pack states from disk */
  private async loadPackStates(): Promise<void> {
    try {
      const fs = await import("fs/promises");
      const content = await fs.readFile(this.stateFile, "utf-8");
      const data = JSON.parse(content);

      this.packStates.clear();
      for (const [packId, state] of Object.entries(data)) {
        this.packStates.set(packId, state as PackState);
      }
    } catch (err: any) {
      // File doesn't exist yet, start with empty states
      if (err.code !== "ENOENT") {
        console.warn("Failed to load pack states:", err);
      }
    }
  }

  /** Save pack states to disk */
  private async savePackStates(): Promise<void> {
    const fs = await import("fs/promises");
    const data: Record<string, PackState> = {};

    for (const [packId, state] of this.packStates.entries()) {
      data[packId] = state;
    }

    await fs.writeFile(this.stateFile, JSON.stringify(data, null, 2), "utf-8");
  }

  /** Check if path is a directory */
  private async isDirectory(path: string): Promise<boolean> {
    try {
      const fs = await import("fs/promises");
      const stat = await fs.stat(path);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  /** Recursively copy directory */
  private async copyDirectory(src: string, dest: string): Promise<void> {
    const fs = await import("fs/promises");
    const path = await import("path");

    await fs.mkdir(dest, { recursive: true });

    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }
}

/** Global manager instance (initialized lazily) */
let managerInstance: SciencePackManager | null = null;

/** Get or create the global pack manager */
export function getPackManager(runtimePath: string): SciencePackManager {
  if (!managerInstance) {
    managerInstance = new SciencePackManager(runtimePath);
  }
  return managerInstance;
}

/** Initialize pack manager */
export async function initializePackManager(runtimePath: string): Promise<void> {
  const manager = getPackManager(runtimePath);
  await manager.initialize();
}
