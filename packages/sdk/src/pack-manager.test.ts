import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHash } from "crypto";
import { SciencePackManager } from "./pack-manager";
import { packRegistry } from "./pack-registry";
import { vol } from "memfs";

// Mock fs/promises to use memfs
vi.mock("fs/promises", () => {
  return {
    default: vol.promises,
    ...vol.promises,
  };
});

/** Normalize win32 separators so assertions are platform-independent */
const norm = (p: string) => p.replace(/\\/g, "/");

/**
 * Reference implementation of the payload digest, mirroring the format
 * documented in pack-manager.ts: files sorted by POSIX relative path, each
 * contributing `path`, a NUL byte, then its bytes. `manifest.yaml` is excluded.
 */
const payloadHash = (files: Record<string, string>): string => {
  const hash = createHash("sha256");
  for (const rel of Object.keys(files).sort()) {
    hash.update(rel, "utf-8");
    hash.update("\0");
    hash.update(Buffer.from(files[rel]));
  }
  return hash.digest("hex");
};

describe("SciencePackManager", () => {
  let manager: SciencePackManager;

  beforeEach(() => {
    vol.reset();
    packRegistry.clear();

    // Create runtime directory structure
    vol.fromJSON({
      "/runtime/packs/.gitkeep": "",
    });

    manager = new SciencePackManager("/runtime");
  });

  afterEach(() => {
    vol.reset();
    packRegistry.clear();
  });

  /** Build a manifest body for a pack */
  const manifestYaml = (
    packId: string,
    packName: string,
    version = "1.0.0",
    integritySha?: string,
  ) =>
    `schema: zerowall.science/pack/v1
id: ${packId}
name: ${packName}
description: Test pack
version: ${version}
source:
  repo: https://github.com/test/repo
  commit: a1b2c3d4e5f6789012345678901234567890abcd
  path: packs/${packId}
  modified: false
components:
  skills:
    - id: test-skill
      name: Test Skill
      description: Test
      path: skills/test/SKILL.md
${integritySha ? `integrity:\n  sha256: ${integritySha}\n` : ""}`;

  /** Write a pack directory anywhere on the mock filesystem */
  const writePack = (
    dir: string,
    packId: string,
    opts: {
      name?: string;
      version?: string;
      payload?: Record<string, string>;
      integritySha?: string;
    } = {},
  ) => {
    const version = opts.version ?? "1.0.0";
    const payload = opts.payload ?? { "payload.txt": `content of ${version}` };

    const files: Record<string, string> = {
      [`${dir}/manifest.yaml`]: manifestYaml(
        packId,
        opts.name ?? packId,
        version,
        opts.integritySha,
      ),
    };
    for (const [rel, content] of Object.entries(payload)) {
      files[`${dir}/${rel}`] = content;
    }
    vol.fromJSON(files);
  };

  /** Install a pack directly into the runtime packs directory */
  const writeInstalledPack = (
    packId: string,
    opts: Parameters<typeof writePack>[2] = {},
  ) => writePack(`/runtime/packs/${packId}`, packId, opts);

  const readState = () =>
    JSON.parse(vol.readFileSync("/runtime/pack-state.json", "utf-8") as string);

  // ---- baseline lifecycle ----

  it("initializes and loads pack states", async () => {
    await manager.initialize();
    const packs = await manager.listInstalled();
    expect(packs).toEqual([]);
  });

  it("lists installed packs", async () => {
    writeInstalledPack("test-pack", { name: "Test Pack" });

    await manager.initialize();
    const packs = await manager.listInstalled();

    expect(packs).toHaveLength(1);
    expect(packs[0].manifest.id).toBe("test-pack");
    expect(packs[0].state).toBe("installed");
  });

  it("installs a pack from local directory", async () => {
    writePack("/test-packs/new-pack", "new-pack", { name: "New Pack" });
    await manager.initialize();

    const installed = await manager.install("/test-packs/new-pack");

    expect(installed.manifest.id).toBe("new-pack");
    expect(installed.state).toBe("installed");
    expect(norm(installed.path)).toBe("/runtime/packs/new-pack");
    expect(vol.existsSync("/runtime/packs/new-pack/manifest.yaml")).toBe(true);
    expect(vol.existsSync("/runtime/packs/new-pack/payload.txt")).toBe(true);
  });

  it("rejects installation of already installed pack", async () => {
    writeInstalledPack("existing-pack", { name: "Existing Pack" });
    writePack("/test-packs/existing-pack", "existing-pack", { name: "Existing Pack" });
    await manager.initialize();

    await expect(manager.install("/test-packs/existing-pack")).rejects.toThrow(
      /already installed/i,
    );
  });

  it("rejects invalid pack manifest during installation", async () => {
    vol.fromJSON({
      "/test-packs/invalid/manifest.yaml": "not: a\nvalid: pack\n",
    });

    await manager.initialize();

    await expect(manager.install("/test-packs/invalid")).rejects.toThrow(
      /invalid pack manifest/i,
    );
    expect(vol.existsSync("/runtime/packs/invalid")).toBe(false);
  });

  it("rejects a manifest that is not parseable YAML", async () => {
    vol.fromJSON({
      "/test-packs/broken/manifest.yaml": "invalid: yaml: structure",
    });

    await manager.initialize();

    await expect(manager.install("/test-packs/broken")).rejects.toThrow(
      /not valid yaml/i,
    );
  });

  it("enables a disabled pack", async () => {
    writeInstalledPack("test-pack");
    await manager.initialize();
    await manager.disable("test-pack");

    let packs = await manager.listInstalled();
    expect(packs[0].state).toBe("disabled");

    await manager.enable("test-pack");

    packs = await manager.listInstalled();
    expect(packs[0].state).toBe("installed");
  });

  it("disables an installed pack", async () => {
    writeInstalledPack("test-pack");
    await manager.initialize();
    await manager.disable("test-pack");

    const packs = await manager.listInstalled();
    expect(packs[0].state).toBe("disabled");
  });

  it("uninstalls a pack and drops its history", async () => {
    writeInstalledPack("test-pack");
    writePack("/sources/test-pack-1.1.0", "test-pack", { version: "1.1.0" });

    await manager.initialize();
    await manager.upgrade("test-pack", "1.1.0", "/sources/test-pack-1.1.0");

    expect(vol.existsSync("/runtime/pack-history/test-pack/1.0.0")).toBe(true);

    await manager.uninstall("test-pack");

    expect(await manager.listInstalled()).toHaveLength(0);
    expect(vol.existsSync("/runtime/packs/test-pack")).toBe(false);
    expect(vol.existsSync("/runtime/pack-history/test-pack")).toBe(false);
  });

  it("inspects pack manifest without installing", async () => {
    writePack("/test-packs/inspect-pack", "inspect-pack", { name: "Inspect Pack" });

    const manifest = await manager.inspect("/test-packs/inspect-pack");

    expect(manifest.id).toBe("inspect-pack");
    expect(manifest.name).toBe("Inspect Pack");
    expect(vol.existsSync("/runtime/packs/inspect-pack")).toBe(false);
  });

  it("throws on operations with non-existent pack", async () => {
    await manager.initialize();

    await expect(manager.enable("non-existent")).rejects.toThrow(/not installed/i);
    await expect(manager.disable("non-existent")).rejects.toThrow(/not installed/i);
    await expect(manager.uninstall("non-existent")).rejects.toThrow(/not installed/i);
    await expect(manager.verify("non-existent")).rejects.toThrow(/not installed/i);
    await expect(manager.upgrade("non-existent")).rejects.toThrow(/not installed/i);
    await expect(manager.rollback("non-existent")).rejects.toThrow(/not installed/i);
  });

  it("persists pack states across manager instances", async () => {
    writeInstalledPack("test-pack");

    await manager.initialize();
    await manager.disable("test-pack");

    packRegistry.clear();
    const manager2 = new SciencePackManager("/runtime");
    await manager2.initialize();

    const packs = await manager2.listInstalled();
    expect(packs[0].state).toBe("disabled");
  });

  // ---- SHA-256 integrity ----

  describe("SHA-256 integrity", () => {
    it("verifies an untouched pack", async () => {
      writeInstalledPack("test-pack");
      await manager.initialize();

      expect(await manager.verify("test-pack")).toBe(true);
    });

    it("detects an added file", async () => {
      writeInstalledPack("test-pack");
      await manager.initialize();

      vol.fromJSON({ "/runtime/packs/test-pack/injected.js": "malicious()" });

      expect(await manager.verify("test-pack")).toBe(false);
    });

    it("detects modified file content", async () => {
      writeInstalledPack("test-pack");
      await manager.initialize();

      vol.writeFileSync("/runtime/packs/test-pack/payload.txt", "tampered");

      expect(await manager.verify("test-pack")).toBe(false);
    });

    it("detects a deleted file", async () => {
      writeInstalledPack("test-pack");
      await manager.initialize();

      vol.unlinkSync("/runtime/packs/test-pack/payload.txt");

      expect(await manager.verify("test-pack")).toBe(false);
    });

    it("accepts a pack whose manifest SHA-256 matches its payload", async () => {
      const payload = { "payload.txt": "trusted payload" };
      writePack("/test-packs/signed-pack", "signed-pack", {
        payload,
        integritySha: payloadHash(payload),
      });
      await manager.initialize();

      const installed = await manager.install("/test-packs/signed-pack");

      expect(installed.manifest.id).toBe("signed-pack");
      expect(await manager.verify("signed-pack")).toBe(true);
    });

    it("refuses to install a pack whose manifest SHA-256 does not match", async () => {
      writePack("/test-packs/tampered-pack", "tampered-pack", {
        payload: { "payload.txt": "swapped by an attacker" },
        integritySha: payloadHash({ "payload.txt": "trusted payload" }),
      });
      await manager.initialize();

      await expect(manager.install("/test-packs/tampered-pack")).rejects.toThrow(
        /integrity check failed.*refusing to install/is,
      );

      // Nothing was copied into the runtime.
      expect(vol.existsSync("/runtime/packs/tampered-pack")).toBe(false);
    });

    it("refuses to upgrade from a source whose manifest SHA-256 does not match", async () => {
      writeInstalledPack("guarded-pack");
      writePack("/sources/guarded-1.1.0", "guarded-pack", {
        version: "1.1.0",
        payload: { "payload.txt": "tampered upgrade" },
        integritySha: payloadHash({ "payload.txt": "expected upgrade" }),
      });
      await manager.initialize();

      await expect(
        manager.upgrade("guarded-pack", "1.1.0", "/sources/guarded-1.1.0"),
      ).rejects.toThrow(/integrity check failed/i);

      expect(manager.getCurrentVersion("guarded-pack")).toBe("1.0.0");
      expect(
        vol.readFileSync("/runtime/packs/guarded-pack/payload.txt", "utf-8"),
      ).toBe("content of 1.0.0");
    });
  });

  // ---- upgrade ----

  describe("upgrade", () => {
    it("upgrades to a newer version and swaps the files", async () => {
      writeInstalledPack("app-pack");
      writePack("/sources/app-1.1.0", "app-pack", {
        version: "1.1.0",
        payload: { "payload.txt": "content of 1.1.0", "added.txt": "new file" },
      });

      await manager.initialize();
      const upgraded = await manager.upgrade("app-pack", "1.1.0", "/sources/app-1.1.0");

      expect(upgraded.manifest.version).toBe("1.1.0");
      expect(upgraded.state).toBe("installed");
      expect(upgraded.upgradedAt).toBeDefined();

      expect(vol.readFileSync("/runtime/packs/app-pack/payload.txt", "utf-8")).toBe(
        "content of 1.1.0",
      );
      expect(vol.existsSync("/runtime/packs/app-pack/added.txt")).toBe(true);
      expect(manager.getCurrentVersion("app-pack")).toBe("1.1.0");
      expect(await manager.verify("app-pack")).toBe(true);
    });

    it("snapshots the outgoing version so it can be restored", async () => {
      writeInstalledPack("app-pack");
      writePack("/sources/app-1.1.0", "app-pack", { version: "1.1.0" });

      await manager.initialize();
      await manager.upgrade("app-pack", "1.1.0", "/sources/app-1.1.0");

      expect(
        vol.readFileSync("/runtime/pack-history/app-pack/1.0.0/payload.txt", "utf-8"),
      ).toBe("content of 1.0.0");
    });

    it("infers the target version from the source manifest", async () => {
      writeInstalledPack("app-pack");
      writePack("/sources/app-2.0.0", "app-pack", { version: "2.0.0" });

      await manager.initialize();
      const upgraded = await manager.upgrade("app-pack", undefined, "/sources/app-2.0.0");

      expect(upgraded.manifest.version).toBe("2.0.0");
    });

    it("requires a source directory", async () => {
      writeInstalledPack("app-pack");
      await manager.initialize();

      await expect(manager.upgrade("app-pack", "1.1.0")).rejects.toThrow(
        /requires a source directory/i,
      );
    });

    it("rejects an upgrade to the same version", async () => {
      writeInstalledPack("app-pack");
      writePack("/sources/app-1.0.0", "app-pack", { version: "1.0.0" });
      await manager.initialize();

      await expect(
        manager.upgrade("app-pack", "1.0.0", "/sources/app-1.0.0"),
      ).rejects.toThrow(/already at version 1\.0\.0/i);
    });

    it("rejects a downgrade and points at rollback", async () => {
      writeInstalledPack("app-pack", { version: "2.0.0" });
      writePack("/sources/app-1.0.0", "app-pack", { version: "1.0.0" });
      await manager.initialize();

      await expect(
        manager.upgrade("app-pack", "1.0.0", "/sources/app-1.0.0"),
      ).rejects.toThrow(/use rollback instead/i);
    });

    it("rejects a source whose pack id does not match", async () => {
      writeInstalledPack("app-pack");
      writePack("/sources/other", "other-pack", { version: "1.1.0" });
      await manager.initialize();

      await expect(
        manager.upgrade("app-pack", "1.1.0", "/sources/other"),
      ).rejects.toThrow(/declares pack id other-pack, expected app-pack/i);
    });

    it("rejects a source whose version does not match the requested one", async () => {
      writeInstalledPack("app-pack");
      writePack("/sources/app-1.2.0", "app-pack", { version: "1.2.0" });
      await manager.initialize();

      await expect(
        manager.upgrade("app-pack", "1.1.0", "/sources/app-1.2.0"),
      ).rejects.toThrow(/source is version 1\.2\.0, expected 1\.1\.0/i);
    });

    it("rolls back and leaves no residue when the swap fails", async () => {
      writeInstalledPack("app-pack");
      writePack("/sources/app-1.1.0", "app-pack", {
        version: "1.1.0",
        payload: { "payload.txt": "content of 1.1.0" },
      });

      await manager.initialize();

      // Fail the first write into the live pack directory, as a disk error
      // mid-swap would. The restore copy (second write) is allowed through.
      const copyDirectory = (manager as any).copyDirectory.bind(manager);
      let failed = false;
      const spy = vi
        .spyOn(manager as any, "copyDirectory")
        .mockImplementation(async (...args: unknown[]) => {
          const [src, dest] = args as [string, string];
          if (!failed && norm(dest) === "/runtime/packs/app-pack") {
            failed = true;
            throw new Error("ENOSPC: simulated disk failure");
          }
          return copyDirectory(src, dest);
        });

      await expect(
        manager.upgrade("app-pack", "1.1.0", "/sources/app-1.1.0"),
      ).rejects.toThrow(/upgrade of app-pack failed.*rolled back to 1\.0\.0/is);

      spy.mockRestore();

      // The pack is intact at the old version.
      expect(manager.getCurrentVersion("app-pack")).toBe("1.0.0");
      expect(vol.readFileSync("/runtime/packs/app-pack/payload.txt", "utf-8")).toBe(
        "content of 1.0.0",
      );
      expect(await manager.verify("app-pack")).toBe(true);

      const packs = await manager.listInstalled();
      expect(packs[0].state).toBe("installed");
      expect(packs[0].manifest.version).toBe("1.0.0");

      // History was not polluted by the failed attempt.
      expect(manager.getVersionHistory("app-pack").map((v) => v.version)).toEqual([
        "1.0.0",
      ]);

      // No transient backup directories left behind.
      const historyEntries = Object.keys(vol.toJSON()).filter((p) =>
        p.includes("/pack-history/app-pack/.tmp-"),
      );
      expect(historyEntries).toEqual([]);
    });

    it("keeps a disabled pack disabled after upgrading", async () => {
      writeInstalledPack("app-pack");
      writePack("/sources/app-1.1.0", "app-pack", { version: "1.1.0" });

      await manager.initialize();
      await manager.disable("app-pack");
      const upgraded = await manager.upgrade("app-pack", "1.1.0", "/sources/app-1.1.0");

      expect(upgraded.state).toBe("disabled");
    });
  });

  // ---- version history ----

  describe("version history", () => {
    it("records timestamp, operator and operation for each version", async () => {
      writeInstalledPack("app-pack");
      writePack("/sources/app-1.1.0", "app-pack", { version: "1.1.0" });

      await manager.initialize();
      await manager.upgrade("app-pack", "1.1.0", "/sources/app-1.1.0");

      const history = manager.getVersionHistory("app-pack");
      expect(history.map((v) => v.version)).toEqual(["1.1.0", "1.0.0"]);
      expect(history[0].operation).toBe("upgrade");
      expect(history[1].operation).toBe("adopt");
      for (const entry of history) {
        expect(entry.installedAt).toBeGreaterThan(0);
        expect(entry.operator).toBeTruthy();
        expect(entry.sha256).toMatch(/^[a-f0-9]{64}$/);
      }
    });

    it("persists history to the state file", async () => {
      writeInstalledPack("app-pack");
      writePack("/sources/app-1.1.0", "app-pack", { version: "1.1.0" });

      await manager.initialize();
      await manager.upgrade("app-pack", "1.1.0", "/sources/app-1.1.0");

      const state = readState();
      expect(state["app-pack"].currentVersion).toBe("1.1.0");
      expect(state["app-pack"].versions).toHaveLength(2);
    });

    it("caps history at 5 entries and deletes pruned snapshots", async () => {
      writeInstalledPack("app-pack");
      await manager.initialize();

      for (let minor = 1; minor <= 6; minor++) {
        const version = `1.${minor}.0`;
        writePack(`/sources/app-${version}`, "app-pack", { version });
        await manager.upgrade("app-pack", version, `/sources/app-${version}`);
      }

      const history = manager.getVersionHistory("app-pack");
      expect(history).toHaveLength(SciencePackManager.MAX_VERSION_HISTORY);
      expect(history.map((v) => v.version)).toEqual([
        "1.6.0",
        "1.5.0",
        "1.4.0",
        "1.3.0",
        "1.2.0",
      ]);
      expect(manager.getCurrentVersion("app-pack")).toBe("1.6.0");

      // The dropped versions' snapshots are gone from disk.
      expect(vol.existsSync("/runtime/pack-history/app-pack/1.0.0")).toBe(false);
      expect(vol.existsSync("/runtime/pack-history/app-pack/1.1.0")).toBe(false);
      expect(vol.existsSync("/runtime/pack-history/app-pack/1.2.0")).toBe(true);
    });

    it("throws when querying history for an unknown pack", async () => {
      await manager.initialize();
      expect(() => manager.getVersionHistory("nope")).toThrow(/not installed/i);
    });
  });

  // ---- rollback ----

  describe("rollback", () => {
    it("rolls back to the previous version and restores its files", async () => {
      writeInstalledPack("app-pack");
      writePack("/sources/app-1.1.0", "app-pack", {
        version: "1.1.0",
        payload: { "payload.txt": "content of 1.1.0", "added.txt": "only in 1.1.0" },
      });

      await manager.initialize();
      await manager.upgrade("app-pack", "1.1.0", "/sources/app-1.1.0");

      const rolledBack = await manager.rollback("app-pack");

      expect(rolledBack.manifest.version).toBe("1.0.0");
      expect(rolledBack.state).toBe("installed");
      expect(vol.readFileSync("/runtime/packs/app-pack/payload.txt", "utf-8")).toBe(
        "content of 1.0.0",
      );
      // Files that only existed in 1.1.0 are gone.
      expect(vol.existsSync("/runtime/packs/app-pack/added.txt")).toBe(false);
      expect(manager.getCurrentVersion("app-pack")).toBe("1.0.0");
      expect(await manager.verify("app-pack")).toBe(true);
    });

    it("rolls back to a specific version in history", async () => {
      writeInstalledPack("app-pack");
      writePack("/sources/app-1.1.0", "app-pack", { version: "1.1.0" });
      writePack("/sources/app-1.2.0", "app-pack", { version: "1.2.0" });

      await manager.initialize();
      await manager.upgrade("app-pack", "1.1.0", "/sources/app-1.1.0");
      await manager.upgrade("app-pack", "1.2.0", "/sources/app-1.2.0");

      const rolledBack = await manager.rollback("app-pack", "1.0.0");

      expect(rolledBack.manifest.version).toBe("1.0.0");
      expect(vol.readFileSync("/runtime/packs/app-pack/payload.txt", "utf-8")).toBe(
        "content of 1.0.0",
      );
    });

    it("records the rollback in history and can roll forward again", async () => {
      writeInstalledPack("app-pack");
      writePack("/sources/app-1.1.0", "app-pack", { version: "1.1.0" });

      await manager.initialize();
      await manager.upgrade("app-pack", "1.1.0", "/sources/app-1.1.0");
      await manager.rollback("app-pack");

      const history = manager.getVersionHistory("app-pack");
      expect(history[0].version).toBe("1.0.0");
      expect(history[0].operation).toBe("rollback");

      // The 1.1.0 snapshot was taken during rollback, so it can be restored.
      const rolledForward = await manager.rollback("app-pack", "1.1.0");
      expect(rolledForward.manifest.version).toBe("1.1.0");
      expect(vol.readFileSync("/runtime/packs/app-pack/payload.txt", "utf-8")).toBe(
        "content of 1.1.0",
      );
    });

    it("rejects rollback when there is no previous version", async () => {
      writeInstalledPack("app-pack");
      await manager.initialize();

      await expect(manager.rollback("app-pack")).rejects.toThrow(
        /no previous version/i,
      );
    });

    it("rejects rollback to a version that is not in history", async () => {
      writeInstalledPack("app-pack");
      writePack("/sources/app-1.1.0", "app-pack", { version: "1.1.0" });

      await manager.initialize();
      await manager.upgrade("app-pack", "1.1.0", "/sources/app-1.1.0");

      await expect(manager.rollback("app-pack", "9.9.9")).rejects.toThrow(
        /not in the history/i,
      );
    });

    it("rejects rollback to the current version", async () => {
      writeInstalledPack("app-pack");
      writePack("/sources/app-1.1.0", "app-pack", { version: "1.1.0" });

      await manager.initialize();
      await manager.upgrade("app-pack", "1.1.0", "/sources/app-1.1.0");

      await expect(manager.rollback("app-pack", "1.1.0")).rejects.toThrow(
        /already at version 1\.1\.0/i,
      );
    });

    it("refuses to restore a snapshot that has been tampered with", async () => {
      writeInstalledPack("app-pack");
      writePack("/sources/app-1.1.0", "app-pack", { version: "1.1.0" });

      await manager.initialize();
      await manager.upgrade("app-pack", "1.1.0", "/sources/app-1.1.0");

      // Tamper with the stored snapshot of 1.0.0.
      vol.writeFileSync(
        "/runtime/pack-history/app-pack/1.0.0/payload.txt",
        "backdoored",
      );

      await expect(manager.rollback("app-pack")).rejects.toThrow(
        /snapshot for version 1\.0\.0 is corrupted/i,
      );

      // The live pack is untouched.
      expect(manager.getCurrentVersion("app-pack")).toBe("1.1.0");
      expect(await manager.verify("app-pack")).toBe(true);
    });

    it("reports a missing snapshot instead of corrupting the pack", async () => {
      writeInstalledPack("app-pack");
      writePack("/sources/app-1.1.0", "app-pack", { version: "1.1.0" });

      await manager.initialize();
      await manager.upgrade("app-pack", "1.1.0", "/sources/app-1.1.0");

      vol.rmSync("/runtime/pack-history/app-pack/1.0.0", { recursive: true });

      await expect(manager.rollback("app-pack")).rejects.toThrow(
        /no snapshot on disk for version 1\.0\.0/i,
      );
      expect(manager.getCurrentVersion("app-pack")).toBe("1.1.0");
    });
  });

  // ---- housekeeping ----

  it("removes transient backup directories on initialize", async () => {
    writeInstalledPack("app-pack");
    vol.fromJSON({
      "/runtime/pack-history/app-pack/.tmp-123/manifest.yaml": "stale",
    });

    await manager.initialize();

    expect(vol.existsSync("/runtime/pack-history/app-pack/.tmp-123")).toBe(false);
  });

  it("recovers a pack left mid-upgrade by a crashed process", async () => {
    writeInstalledPack("app-pack", { version: "1.1.0" });
    // State file claims 1.0.0 is active and an upgrade was in flight, while the
    // files on disk are already at 1.1.0 — the shape a crash leaves behind.
    vol.fromJSON({
      "/runtime/pack-state.json": JSON.stringify({
        "app-pack": {
          state: "upgrading",
          currentVersion: "1.0.0",
          versions: [
            {
              version: "1.0.0",
              installedAt: 1,
              path: "/runtime/pack-history/app-pack/1.0.0",
              sha256: "0".repeat(64),
              operator: "tester",
              operation: "install",
            },
          ],
          lastModified: 1,
        },
      }),
    });

    await manager.initialize();

    expect(manager.getCurrentVersion("app-pack")).toBe("1.1.0");
    const packs = await manager.listInstalled();
    expect(packs[0].state).toBe("installed");
    expect(manager.getVersionHistory("app-pack").map((v) => v.version)).toEqual([
      "1.1.0",
      "1.0.0",
    ]);
    // The recovered digest reflects what is actually on disk.
    expect(await manager.verify("app-pack")).toBe(true);
  });

  it("drops state for packs that vanished from disk", async () => {
    writeInstalledPack("app-pack");
    await manager.initialize();
    expect(readState()["app-pack"]).toBeDefined();

    vol.rmSync("/runtime/packs/app-pack", { recursive: true });
    packRegistry.clear();

    const manager2 = new SciencePackManager("/runtime");
    await manager2.initialize();

    expect(readState()["app-pack"]).toBeUndefined();
  });
});
