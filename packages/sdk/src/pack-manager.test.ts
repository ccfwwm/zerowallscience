import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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

  const createTestPack = (packId: string, packName: string) => {
    vol.fromJSON({
      [`/test-packs/${packId}/manifest.yaml`]: `schema: zerowall.science/pack/v1
id: ${packId}
name: ${packName}
description: Test pack
version: 1.0.0
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
`,
    });
  };

  it("initializes and loads pack states", async () => {
    await manager.initialize();
    const packs = await manager.listInstalled();
    expect(packs).toEqual([]);
  });

  it("lists installed packs", async () => {
    vol.fromJSON({
      "/runtime/packs/test-pack/manifest.yaml": `schema: zerowall.science/pack/v1
id: test-pack
name: Test Pack
description: Test
version: 1.0.0
source:
  repo: https://github.com/test/repo
  commit: a1b2c3d4e5f6789012345678901234567890abcd
  path: packs/test-pack
  modified: false
components:
  skills: []
`,
    });

    await manager.initialize();
    const packs = await manager.listInstalled();

    expect(packs).toHaveLength(1);
    expect(packs[0].manifest.id).toBe("test-pack");
    expect(packs[0].state).toBe("installed");
  });

  it("installs a pack from local directory", async () => {
    createTestPack("new-pack", "New Pack");
    await manager.initialize();

    const installed = await manager.install("/test-packs/new-pack");

    expect(installed.manifest.id).toBe("new-pack");
    expect(installed.state).toBe("installed");
    expect(installed.path).toBe("/runtime/packs/new-pack");

    // Verify pack was copied
    const manifestExists = vol.existsSync("/runtime/packs/new-pack/manifest.yaml");
    expect(manifestExists).toBe(true);
  });

  it("rejects installation of already installed pack", async () => {
    vol.fromJSON({
      "/runtime/packs/existing-pack/manifest.yaml": `schema: zerowall.science/pack/v1
id: existing-pack
name: Existing Pack
description: Already installed
version: 1.0.0
source:
  repo: https://github.com/test/repo
  commit: a1b2c3d4e5f6789012345678901234567890abcd
  path: packs/existing-pack
  modified: false
components:
  skills: []
`,
    });

    createTestPack("existing-pack", "Existing Pack");
    await manager.initialize();

    await expect(manager.install("/test-packs/existing-pack")).rejects.toThrow(
      /already installed/i,
    );
  });

  it("rejects invalid pack manifest during installation", async () => {
    vol.fromJSON({
      "/test-packs/invalid/manifest.yaml": "invalid: yaml: structure",
    });

    await manager.initialize();

    await expect(manager.install("/test-packs/invalid")).rejects.toThrow(
      /invalid pack manifest/i,
    );
  });

  it("enables a disabled pack", async () => {
    vol.fromJSON({
      "/runtime/packs/test-pack/manifest.yaml": `schema: zerowall.science/pack/v1
id: test-pack
name: Test Pack
description: Test
version: 1.0.0
source:
  repo: https://github.com/test/repo
  commit: a1b2c3d4e5f6789012345678901234567890abcd
  path: packs/test-pack
  modified: false
components:
  skills: []
`,
    });

    await manager.initialize();
    await manager.disable("test-pack");

    let packs = await manager.listInstalled();
    expect(packs[0].state).toBe("disabled");

    await manager.enable("test-pack");

    packs = await manager.listInstalled();
    expect(packs[0].state).toBe("installed");
  });

  it("disables an installed pack", async () => {
    vol.fromJSON({
      "/runtime/packs/test-pack/manifest.yaml": `schema: zerowall.science/pack/v1
id: test-pack
name: Test Pack
description: Test
version: 1.0.0
source:
  repo: https://github.com/test/repo
  commit: a1b2c3d4e5f6789012345678901234567890abcd
  path: packs/test-pack
  modified: false
components:
  skills: []
`,
    });

    await manager.initialize();
    await manager.disable("test-pack");

    const packs = await manager.listInstalled();
    expect(packs[0].state).toBe("disabled");
  });

  it("uninstalls a pack", async () => {
    vol.fromJSON({
      "/runtime/packs/test-pack/manifest.yaml": `schema: zerowall.science/pack/v1
id: test-pack
name: Test Pack
description: Test
version: 1.0.0
source:
  repo: https://github.com/test/repo
  commit: a1b2c3d4e5f6789012345678901234567890abcd
  path: packs/test-pack
  modified: false
components:
  skills: []
`,
    });

    await manager.initialize();

    let packs = await manager.listInstalled();
    expect(packs).toHaveLength(1);

    await manager.uninstall("test-pack");

    packs = await manager.listInstalled();
    expect(packs).toHaveLength(0);

    const packExists = vol.existsSync("/runtime/packs/test-pack");
    expect(packExists).toBe(false);
  });

  it("verifies pack integrity", async () => {
    vol.fromJSON({
      "/runtime/packs/test-pack/manifest.yaml": `schema: zerowall.science/pack/v1
id: test-pack
name: Test Pack
description: Test
version: 1.0.0
source:
  repo: https://github.com/test/repo
  commit: a1b2c3d4e5f6789012345678901234567890abcd
  path: packs/test-pack
  modified: false
components:
  skills: []
`,
    });

    await manager.initialize();

    const valid = await manager.verify("test-pack");
    expect(valid).toBe(true);
  });

  it("fails verification for corrupted pack", async () => {
    vol.fromJSON({
      "/runtime/packs/bad-pack/manifest.yaml": "corrupted: data: here",
    });

    await manager.initialize();

    const valid = await manager.verify("bad-pack");
    expect(valid).toBe(false);
  });

  it("inspects pack manifest without installing", async () => {
    createTestPack("inspect-pack", "Inspect Pack");

    const manifest = await manager.inspect("/test-packs/inspect-pack");

    expect(manifest.id).toBe("inspect-pack");
    expect(manifest.name).toBe("Inspect Pack");

    // Verify pack was NOT installed
    const packExists = vol.existsSync("/runtime/packs/inspect-pack");
    expect(packExists).toBe(false);
  });

  it("throws on operations with non-existent pack", async () => {
    await manager.initialize();

    await expect(manager.enable("non-existent")).rejects.toThrow(/not installed/i);
    await expect(manager.disable("non-existent")).rejects.toThrow(/not installed/i);
    await expect(manager.uninstall("non-existent")).rejects.toThrow(/not installed/i);
    await expect(manager.verify("non-existent")).rejects.toThrow(/not installed/i);
  });

  it("persists pack states across manager instances", async () => {
    vol.fromJSON({
      "/runtime/packs/test-pack/manifest.yaml": `schema: zerowall.science/pack/v1
id: test-pack
name: Test Pack
description: Test
version: 1.0.0
source:
  repo: https://github.com/test/repo
  commit: a1b2c3d4e5f6789012345678901234567890abcd
  path: packs/test-pack
  modified: false
components:
  skills: []
`,
    });

    await manager.initialize();
    await manager.disable("test-pack");

    // Create new manager instance
    const manager2 = new SciencePackManager("/runtime");
    await manager2.initialize();

    const packs = await manager2.listInstalled();
    expect(packs[0].state).toBe("disabled");
  });
});
