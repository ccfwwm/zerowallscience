/**
 * Science Pack Manager - Lifecycle operations for pack installation and management.
 *
 * Handles install, upgrade, enable/disable, uninstall, rollback, and verification.
 *
 * Integrity model
 * ---------------
 * Two SHA-256 digests are used, both computed over a directory by hashing every
 * file in sorted relative-path order (path bytes then content bytes), so the
 * digest also detects renames and moves:
 *
 * - `manifest.integrity.sha256` covers the pack payload (every file EXCEPT
 *   `manifest.yaml`, which cannot hash itself). It is supplied by the pack
 *   author and verified before install and before upgrade. A mismatch rejects
 *   the operation.
 * - `PackVersionHistory.sha256` covers the whole installed directory including
 *   the manifest. It is recorded when a version becomes active and re-checked
 *   by `verify()` to detect tampering after installation.
 *
 * Version history
 * ---------------
 * Snapshots are written lazily: a version is copied into the history directory
 * only when it is about to be replaced by an upgrade or rollback. History is
 * capped at MAX_VERSION_HISTORY entries; pruned snapshots are deleted from disk.
 */

import type {
  SciencePackManifestV1,
  SciencePackManager as ISciencePackManager,
  InstalledPack,
  PackStateRecord,
  PackVersionHistory,
  PackVersionOperation,
} from "@zerowall/shared";
import { validatePackManifest, compareVersions } from "@zerowall/shared";
import { packRegistry } from "./pack-registry";
import { parse as parseYaml } from "yaml";

/**
 * Node built-ins are not imported at module scope.
 *
 * This module is reachable from the browser bundle: `runtime.ts` pulls the SDK
 * in with a dynamic `import("@zerowall/sdk")`, and the SDK barrel re-exports
 * this file. A top-level `import { createHash } from "crypto"` therefore lands
 * in rollup's graph, where `crypto` and `path` resolve to
 * `__vite-browser-external` and the production build fails outright — while
 * typecheck and tests, which run under Node, stay perfectly green. The
 * `fs/promises` calls below never had this problem because they were already
 * deferred to call time; `crypto` is now deferred the same way.
 *
 * `path` is gone entirely: every use here was a pure string operation on
 * already-absolute paths, so the two helpers below do the job without a
 * platform dependency. Paths are normalized to forward slashes, which Windows
 * accepts and which the digest already required (relative paths are hashed
 * POSIX-style so a pack's checksum does not change with the OS).
 */
const nodeCrypto = () => import("crypto");

/** Join path segments with a forward slash, collapsing separators. */
function joinPath(...segments: string[]): string {
  return segments
    .filter((s) => s !== "")
    .join("/")
    .replace(/[/\\]+/g, "/");
}

/** `to` expressed relative to `from`, POSIX-style. Both must be absolute. */
function relativePath(from: string, to: string): string {
  const norm = (p: string) => p.replace(/[/\\]+/g, "/").replace(/\/$/, "");
  const fromParts = norm(from).split("/");
  const toParts = norm(to).split("/");
  let i = 0;
  while (i < fromParts.length && i < toParts.length && fromParts[i] === toParts[i]) i++;
  return [...Array(fromParts.length - i).fill(".."), ...toParts.slice(i)].join("/");
}

/** The directory containing `p`, or "." when it has no separator. */
function dirName(p: string): string {
  const normalized = p.replace(/[/\\]+/g, "/").replace(/\/$/, "");
  const cut = normalized.lastIndexOf("/");
  return cut <= 0 ? "." : normalized.slice(0, cut);
}

/** Manifest file name inside a pack directory */
const MANIFEST_FILE = "manifest.yaml";

/** Prefix for transient backup directories created during upgrade/rollback */
const TEMP_PREFIX = ".tmp-";

export class SciencePackManager implements ISciencePackManager {
  private packsDir: string;
  private historyDir: string;
  private stateFile: string;
  private packStates = new Map<string, PackStateRecord>();

  /** Maximum number of version history entries retained per pack */
  static readonly MAX_VERSION_HISTORY = 5;

  constructor(runtimePath: string) {
    // Plain string joins: the constructor cannot await the lazy `path` import,
    // and these are the roots every other path is built from. A forward slash
    // is valid on Windows too, and `runtimeRoot` below already accepts either.
    const root = runtimePath.replace(/[/\\]+$/, "");
    this.packsDir = `${root}/packs`;
    this.historyDir = `${root}/pack-history`;
    this.stateFile = `${root}/pack-state.json`;
  }

  /** Runtime root derived from the packs directory */
  private get runtimeRoot(): string {
    return this.packsDir.replace(/[/\\]packs$/, "");
  }

  /** Initialize manager and load pack states */
  async initialize(): Promise<void> {
    await this.loadPackStates();
    await packRegistry.load(this.runtimeRoot);

    // Adopt packs that are present on disk but absent from the state file.
    // This establishes the tamper-detection baseline for pre-existing packs.
    let dirty = false;
    for (const pack of packRegistry.listPacks()) {
      if (this.packStates.has(pack.manifest.id)) continue;

      const now = Date.now();
      this.packStates.set(pack.manifest.id, {
        state: "installed",
        currentVersion: pack.manifest.version,
        versions: [
          {
            version: pack.manifest.version,
            installedAt: now,
            path: this.snapshotPath(pack.manifest.id, pack.manifest.version),
            sha256: await this.computePackHash(pack.path),
            operator: this.operator(),
            operation: "adopt",
          },
        ],
        lastModified: now,
      });
      dirty = true;
    }

    // Drop state for packs that are no longer on disk.
    for (const packId of [...this.packStates.keys()]) {
      if (!packRegistry.getPack(packId)) {
        this.packStates.delete(packId);
        dirty = true;
      }
    }

    // Recover packs left mid-upgrade by a process that died before it could
    // finish. The manifest on disk is authoritative for what is installed.
    for (const [packId, record] of this.packStates) {
      if (record.state !== "upgrading") continue;

      const pack = packRegistry.getPack(packId);
      if (!pack) continue;

      const version = pack.manifest.version;
      const sha256 = await this.computePackHash(pack.path);
      const entry = record.versions.find((v) => v.version === version);

      if (entry) {
        entry.sha256 = sha256;
      } else {
        record.versions.unshift({
          version,
          installedAt: Date.now(),
          path: this.snapshotPath(packId, version),
          sha256,
          operator: this.operator(),
          operation: "adopt",
        });
        await this.pruneHistory(record);
      }

      record.state = "installed";
      record.currentVersion = version;
      record.lastModified = Date.now();
      delete record.error;
      dirty = true;
    }

    if (dirty) await this.savePackStates();

    await this.cleanupTempDirs();
  }

  /** List all installed packs */
  async listInstalled(): Promise<InstalledPack[]> {
    return packRegistry.listPacks().map((entry) => {
      const record = this.packStates.get(entry.manifest.id);
      const current = record?.versions.find((v) => v.version === record.currentVersion);
      const first = record?.versions[record.versions.length - 1];

      const installed: InstalledPack = {
        manifest: entry.manifest,
        state: record?.state ?? entry.state,
        installedAt: new Date(first?.installedAt ?? Date.now()).toISOString(),
        path: entry.path,
      };
      if (record && record.versions.length > 1 && current) {
        installed.upgradedAt = new Date(current.installedAt).toISOString();
      }
      if (record?.error) installed.error = record.error;
      return installed;
    });
  }

  /** Read the version history for a pack, newest first */
  getVersionHistory(packId: string): PackVersionHistory[] {
    const record = this.packStates.get(packId);
    if (!record) {
      throw new Error(`Pack ${packId} is not installed`);
    }
    return record.versions.map((v) => ({ ...v }));
  }

  /** Current active version of a pack */
  getCurrentVersion(packId: string): string {
    const record = this.packStates.get(packId);
    if (!record) {
      throw new Error(`Pack ${packId} is not installed`);
    }
    return record.currentVersion;
  }

  /** Install a pack from a local directory */
  async install(source: string): Promise<InstalledPack> {
    const fs = await import("fs/promises");

    // Future: support remote URLs and tar.gz archives.
    if (!(await this.isDirectory(source))) {
      throw new Error("Only local directory installation is currently supported");
    }

    const manifest = await this.readManifest(source);

    if (packRegistry.getPack(manifest.id)) {
      throw new Error(`Pack ${manifest.id} is already installed`);
    }

    // Integrity gate: a declared payload hash must match before anything is copied.
    await this.assertPayloadIntegrity(source, manifest);

    const targetPath = joinPath(this.packsDir, manifest.id);
    await this.copyDirectory(source, targetPath);

    // Guard against a partial or corrupted copy.
    const sourceHash = await this.computePackHash(source);
    const targetHash = await this.computePackHash(targetPath);
    if (sourceHash !== targetHash) {
      await fs.rm(targetPath, { recursive: true, force: true });
      throw new Error(
        `Install of ${manifest.id} failed: copied files do not match the source ` +
          `(expected SHA-256 ${sourceHash}, got ${targetHash})`,
      );
    }

    const now = Date.now();
    this.packStates.set(manifest.id, {
      state: "installed",
      currentVersion: manifest.version,
      versions: [
        {
          version: manifest.version,
          installedAt: now,
          path: this.snapshotPath(manifest.id, manifest.version),
          sha256: targetHash,
          operator: this.operator(),
          operation: "install",
        },
      ],
      lastModified: now,
    });
    await this.savePackStates();

    await this.reloadRegistry();

    return {
      manifest,
      state: "installed",
      installedAt: new Date(now).toISOString(),
      path: targetPath,
    };
  }

  /**
   * Upgrade an installed pack.
   *
   * `source` must be a local directory holding the new version. The current
   * version is snapshotted first; any failure restores it before throwing, so
   * a failed upgrade never leaves the pack directory in a partial state.
   */
  async upgrade(
    packId: string,
    targetVersion?: string,
    source?: string,
  ): Promise<InstalledPack> {
    const pack = packRegistry.getPack(packId);
    if (!pack) {
      throw new Error(`Pack ${packId} is not installed`);
    }

    const record = this.packStates.get(packId);
    if (!record) {
      throw new Error(`Pack ${packId} has no state record; re-initialize the manager`);
    }

    if (!source) {
      throw new Error(
        `Upgrade of ${packId} requires a source directory containing the new version ` +
          `(remote catalog downloads are not implemented yet)`,
      );
    }
    if (!(await this.isDirectory(source))) {
      throw new Error(`Upgrade source is not a directory: ${source}`);
    }

    const currentVersion = record.currentVersion;
    const newManifest = await this.readManifest(source);

    if (newManifest.id !== packId) {
      throw new Error(
        `Upgrade source declares pack id ${newManifest.id}, expected ${packId}`,
      );
    }
    if (targetVersion && newManifest.version !== targetVersion) {
      throw new Error(
        `Upgrade source is version ${newManifest.version}, expected ${targetVersion}`,
      );
    }

    const order = compareVersions(currentVersion, newManifest.version);
    if (order === 0) {
      throw new Error(`Pack ${packId} is already at version ${currentVersion}`);
    }
    if (order === 1) {
      throw new Error(
        `Cannot upgrade ${packId} from ${currentVersion} to older version ` +
          `${newManifest.version}; use rollback instead`,
      );
    }

    // Integrity gate before touching the installed pack.
    await this.assertPayloadIntegrity(source, newManifest);

    return this.replaceVersion({
      packId,
      packPath: pack.path,
      record,
      source,
      newVersion: newManifest.version,
      operation: "upgrade",
      failureLabel: "Upgrade",
    });
  }

  /** Enable all components in a pack */
  async enable(packId: string): Promise<void> {
    if (!packRegistry.getPack(packId)) {
      throw new Error(`Pack ${packId} is not installed`);
    }

    const record = this.packStates.get(packId);
    if (record && record.state === "disabled") {
      record.state = "installed";
      record.lastModified = Date.now();
      await this.savePackStates();
    }
  }

  /** Disable all components in a pack (keeps installed) */
  async disable(packId: string): Promise<void> {
    if (!packRegistry.getPack(packId)) {
      throw new Error(`Pack ${packId} is not installed`);
    }

    const record = this.packStates.get(packId);
    if (record) {
      record.state = "disabled";
      record.lastModified = Date.now();
      await this.savePackStates();
    }
  }

  /** Uninstall a pack and drop its version history */
  async uninstall(packId: string): Promise<void> {
    const pack = packRegistry.getPack(packId);
    if (!pack) {
      throw new Error(`Pack ${packId} is not installed`);
    }

    const fs = await import("fs/promises");

    await fs.rm(pack.path, { recursive: true, force: true });
    await fs.rm(joinPath(this.historyDir, packId), {
      recursive: true,
      force: true,
    });

    this.packStates.delete(packId);
    await this.savePackStates();

    await this.reloadRegistry();
  }

  /**
   * Rollback to the previous version, or to a specific version in history.
   *
   * The target snapshot is integrity-checked before it is restored, and the
   * outgoing version is snapshotted so the rollback itself can be undone.
   */
  async rollback(packId: string, targetVersion?: string): Promise<InstalledPack> {
    const pack = packRegistry.getPack(packId);
    if (!pack) {
      throw new Error(`Pack ${packId} is not installed`);
    }

    const record = this.packStates.get(packId);
    if (!record) {
      throw new Error(`Pack ${packId} has no state record; re-initialize the manager`);
    }

    const currentIndex = record.versions.findIndex(
      (v) => v.version === record.currentVersion,
    );

    let target: PackVersionHistory | undefined;
    if (targetVersion) {
      if (targetVersion === record.currentVersion) {
        throw new Error(`Pack ${packId} is already at version ${targetVersion}`);
      }
      target = record.versions.find((v) => v.version === targetVersion);
      if (!target) {
        throw new Error(
          `Version ${targetVersion} is not in the history of ${packId}; ` +
            `available: ${record.versions.map((v) => v.version).join(", ")}`,
        );
      }
    } else {
      target = currentIndex >= 0 ? record.versions[currentIndex + 1] : undefined;
      if (!target) {
        throw new Error(`Pack ${packId} has no previous version to rollback to`);
      }
    }

    // The snapshot must exist and still match its recorded digest.
    if (!(await this.isDirectory(target.path))) {
      throw new Error(
        `Rollback of ${packId} failed: no snapshot on disk for version ` +
          `${target.version} (expected ${target.path})`,
      );
    }
    const snapshotHash = await this.computePackHash(target.path);
    if (snapshotHash !== target.sha256) {
      throw new Error(
        `Rollback of ${packId} failed: snapshot for version ${target.version} is ` +
          `corrupted (expected SHA-256 ${target.sha256}, got ${snapshotHash})`,
      );
    }

    return this.replaceVersion({
      packId,
      packPath: pack.path,
      record,
      source: target.path,
      newVersion: target.version,
      operation: "rollback",
      failureLabel: "Rollback",
    });
  }

  /**
   * Verify pack integrity.
   *
   * Checks that the manifest still validates, that the declared payload hash
   * (if any) matches, and that the directory digest matches the one recorded
   * when the current version became active.
   */
  async verify(packId: string): Promise<boolean> {
    const pack = packRegistry.getPack(packId);
    if (!pack) {
      throw new Error(`Pack ${packId} is not installed`);
    }

    try {
      const manifest = await this.readManifest(pack.path);

      if (manifest.integrity?.sha256) {
        const payloadHash = await this.computePayloadHash(pack.path);
        if (payloadHash !== manifest.integrity.sha256) {
          console.warn(
            `Pack ${packId} payload SHA-256 mismatch: expected ` +
              `${manifest.integrity.sha256}, got ${payloadHash}`,
          );
          return false;
        }
      }

      const record = this.packStates.get(packId);
      if (!record) return false;

      const current = record.versions.find((v) => v.version === record.currentVersion);
      if (!current) return false;

      const hash = await this.computePackHash(pack.path);
      if (hash !== current.sha256) {
        console.warn(
          `Pack ${packId} SHA-256 mismatch: expected ${current.sha256}, got ${hash}`,
        );
        return false;
      }

      return true;
    } catch (err) {
      console.warn(`Verification of pack ${packId} failed:`, err);
      return false;
    }
  }

  /** Get pack manifest without installing */
  async inspect(source: string): Promise<SciencePackManifestV1> {
    if (!(await this.isDirectory(source))) {
      throw new Error("Only local directory inspection is currently supported");
    }
    return this.readManifest(source);
  }

  // ---- internals ----

  /**
   * Swap the live pack directory for `source`, recording a new history entry.
   *
   * Shared by upgrade and rollback. The outgoing version is snapshotted and a
   * transient backup is kept until the swap is verified; on any failure the
   * backup is restored so no partial state remains.
   */
  private async replaceVersion(args: {
    packId: string;
    packPath: string;
    record: PackStateRecord;
    source: string;
    newVersion: string;
    operation: Extract<PackVersionOperation, "upgrade" | "rollback">;
    failureLabel: string;
  }): Promise<InstalledPack> {
    const { packId, packPath, record, source, newVersion, operation } = args;
    const fs = await import("fs/promises");

    const previousVersion = record.currentVersion;
    const previousState = record.state;
    const previousVersions = record.versions.map((v) => ({ ...v }));

    const backupPath = joinPath(
      this.historyDir,
      packId,
      `${TEMP_PREFIX}${Date.now()}`,
    );

    record.state = "upgrading";
    record.lastModified = Date.now();
    await this.savePackStates();

    try {
      // Snapshot the outgoing version so it can be restored later, then keep a
      // transient backup for this operation.
      await this.snapshotCurrent(packId, packPath, record);
      await this.copyDirectory(packPath, backupPath);

      await fs.rm(packPath, { recursive: true, force: true });
      await this.copyDirectory(source, packPath);

      // Verify the swap landed correctly before committing state.
      const installedManifest = await this.readManifest(packPath);
      if (installedManifest.version !== newVersion) {
        throw new Error(
          `installed manifest reports version ${installedManifest.version}, ` +
            `expected ${newVersion}`,
        );
      }
      const hash = await this.computePackHash(packPath);
      const sourceHash = await this.computePackHash(source);
      if (hash !== sourceHash) {
        throw new Error(
          `copied files do not match the source (expected SHA-256 ${sourceHash}, got ${hash})`,
        );
      }

      const now = Date.now();
      const entry: PackVersionHistory = {
        version: newVersion,
        installedAt: now,
        path: this.snapshotPath(packId, newVersion),
        sha256: hash,
        operator: this.operator(),
        operation,
      };

      // Replace any existing entry for this version, then push it to the front.
      record.versions = record.versions.filter((v) => v.version !== newVersion);
      record.versions.unshift(entry);
      await this.pruneHistory(record);

      record.state = previousState === "disabled" ? "disabled" : "installed";
      record.currentVersion = newVersion;
      record.lastModified = now;
      delete record.error;
      await this.savePackStates();

      await fs.rm(backupPath, { recursive: true, force: true });
      await this.reloadRegistry();

      const reloaded = packRegistry.getPack(packId);
      if (!reloaded) {
        throw new Error(`pack disappeared from the registry after ${operation}`);
      }

      const oldest = record.versions[record.versions.length - 1];
      return {
        manifest: reloaded.manifest,
        state: record.state,
        installedAt: new Date(oldest?.installedAt ?? now).toISOString(),
        upgradedAt: new Date(now).toISOString(),
        path: reloaded.path,
      };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);

      let restored = true;
      try {
        if (await this.isDirectory(backupPath)) {
          await fs.rm(packPath, { recursive: true, force: true });
          await this.copyDirectory(backupPath, packPath);
        }
        await fs.rm(backupPath, { recursive: true, force: true });
      } catch (restoreErr) {
        restored = false;
        console.error(`Failed to restore ${packId} after ${operation} failure:`, restoreErr);
      }

      if (restored) {
        record.state = previousState;
        record.currentVersion = previousVersion;
        record.versions = previousVersions;
        delete record.error;
      } else {
        record.state = "error";
        record.error = `${args.failureLabel} failed and restore failed: ${reason}`;
      }
      record.lastModified = Date.now();
      await this.savePackStates();

      await this.reloadRegistry();

      throw new Error(
        restored
          ? `${args.failureLabel} of ${packId} failed: ${reason}. ` +
            `Rolled back to ${previousVersion}.`
          : `${args.failureLabel} of ${packId} failed: ${reason}. ` +
            `Restore also failed; pack is in an error state.`,
      );
    }
  }

  /** Copy the live directory into the history slot for the active version */
  private async snapshotCurrent(
    packId: string,
    packPath: string,
    record: PackStateRecord,
  ): Promise<void> {
    const target = this.snapshotPath(packId, record.currentVersion);
    if (await this.isDirectory(target)) return;

    await this.copyDirectory(packPath, target);

    // Keep the recorded digest aligned with what was actually snapshotted.
    const entry = record.versions.find((v) => v.version === record.currentVersion);
    if (entry) {
      entry.path = target;
      entry.sha256 = await this.computePackHash(target);
    }
  }

  /** Trim history to MAX_VERSION_HISTORY, deleting pruned snapshots */
  private async pruneHistory(record: PackStateRecord): Promise<void> {
    const fs = await import("fs/promises");

    while (record.versions.length > SciencePackManager.MAX_VERSION_HISTORY) {
      const pruned = record.versions.pop();
      if (!pruned) break;
      await fs.rm(pruned.path, { recursive: true, force: true }).catch(() => {
        // A missing snapshot is not an error; it was written lazily.
      });
    }
  }

  /** Canonical snapshot directory for a pack version */
  private snapshotPath(packId: string, version: string): string {
    return joinPath(this.historyDir, packId, version);
  }

  /** Remove transient backup directories left behind by an interrupted process */
  private async cleanupTempDirs(): Promise<void> {
    const fs = await import("fs/promises");

    let packDirs: string[];
    try {
      const entries = await fs.readdir(this.historyDir, { withFileTypes: true });
      packDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch {
      return; // No history directory yet.
    }

    for (const packId of packDirs) {
      const dir = joinPath(this.historyDir, packId);
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && entry.name.startsWith(TEMP_PREFIX)) {
            await fs
              .rm(joinPath(dir, entry.name), { recursive: true, force: true })
              .catch(() => {});
          }
        }
      } catch {
        // Ignore unreadable history directories.
      }
    }
  }

  /** Read and validate a pack manifest from a directory */
  private async readManifest(dir: string): Promise<SciencePackManifestV1> {
    const fs = await import("fs/promises");

    let raw: string;
    try {
      raw = await fs.readFile(joinPath(dir, MANIFEST_FILE), "utf-8");
    } catch {
      throw new Error(`Invalid pack manifest: ${MANIFEST_FILE} not found in ${dir}`);
    }

    let data: unknown;
    try {
      data = parseYaml(raw);
    } catch (err) {
      throw new Error(
        `Invalid pack manifest: ${MANIFEST_FILE} in ${dir} is not valid YAML ` +
          `(${err instanceof Error ? err.message.split("\n")[0] : String(err)})`,
      );
    }

    try {
      if (!validatePackManifest(data)) {
        throw new Error("manifest failed validation");
      }
    } catch (err) {
      throw new Error(
        `Invalid pack manifest in ${dir}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return data as SciencePackManifestV1;
  }

  /** Reject a pack whose declared payload hash does not match its files */
  private async assertPayloadIntegrity(
    dir: string,
    manifest: SciencePackManifestV1,
  ): Promise<void> {
    const declared = manifest.integrity?.sha256;
    if (!declared) return;

    const actual = await this.computePayloadHash(dir);
    if (actual !== declared) {
      throw new Error(
        `Integrity check failed for pack ${manifest.id}@${manifest.version}: ` +
          `manifest declares SHA-256 ${declared} but the files hash to ${actual}. ` +
          `The pack may have been tampered with; refusing to install.`,
      );
    }
  }

  /** SHA-256 over every file in a directory, including the manifest */
  private async computePackHash(dir: string): Promise<string> {
    return this.hashDirectory(dir, null);
  }

  /** SHA-256 over every file in a directory except the manifest */
  private async computePayloadHash(dir: string): Promise<string> {
    return this.hashDirectory(dir, MANIFEST_FILE);
  }

  /**
   * Hash a directory deterministically.
   *
   * Files are sorted by POSIX-normalized relative path; both the path and the
   * content are fed into the digest, so renames and moves change the result.
   */
  private async hashDirectory(dir: string, exclude: string | null): Promise<string> {
    const fs = await import("fs/promises");
    const { createHash } = await nodeCrypto();
    const hash = createHash("sha256");

    const files = (await this.listFiles(dir))
      .map((absolute) => ({
        absolute,
        relative: relativePath(dir, absolute),
      }))
      .filter((f) => f.relative !== exclude)
      .sort((a, b) => (a.relative < b.relative ? -1 : a.relative > b.relative ? 1 : 0));

    for (const file of files) {
      hash.update(file.relative, "utf-8");
      hash.update("\0");
      hash.update(await fs.readFile(file.absolute));
    }

    return hash.digest("hex");
  }

  /** Absolute paths of every file under a directory, recursively */
  private async listFiles(dir: string): Promise<string[]> {
    const fs = await import("fs/promises");
    const files: string[] = [];

    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = joinPath(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await this.listFiles(full)));
      } else {
        files.push(full);
      }
    }

    return files;
  }

  /** Best-effort identity of whoever triggered the operation */
  private operator(): string {
    const env = typeof process !== "undefined" ? process.env : undefined;
    return env?.USERNAME || env?.USER || "local";
  }

  /** Reload the pack registry from disk */
  private async reloadRegistry(): Promise<void> {
    packRegistry.clear();
    await packRegistry.load(this.runtimeRoot);
  }

  /** Load pack states from disk */
  private async loadPackStates(): Promise<void> {
    try {
      const fs = await import("fs/promises");
      const content = await fs.readFile(this.stateFile, "utf-8");
      const data = JSON.parse(content) as Record<string, PackStateRecord>;

      this.packStates.clear();
      for (const [packId, record] of Object.entries(data)) {
        // Ignore malformed entries rather than crashing startup.
        if (record && Array.isArray(record.versions) && record.currentVersion) {
          this.packStates.set(packId, record);
        }
      }
    } catch (err: any) {
      // File doesn't exist yet, start with empty states
      if (err?.code !== "ENOENT") {
        console.warn("Failed to load pack states:", err);
      }
    }
  }

  /** Save pack states to disk */
  private async savePackStates(): Promise<void> {
    const fs = await import("fs/promises");
    const data: Record<string, PackStateRecord> = {};

    for (const [packId, record] of this.packStates.entries()) {
      data[packId] = record;
    }

    await fs.mkdir(dirName(this.stateFile), { recursive: true });
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

    await fs.mkdir(dest, { recursive: true });

    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = joinPath(src, entry.name);
      const destPath = joinPath(dest, entry.name);

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
