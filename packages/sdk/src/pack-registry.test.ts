import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PackRegistry } from "./pack-registry";
import type { SciencePackManifestV1 } from "@zerowall/shared";
import { vol } from "memfs";
import { vi } from "vitest";

// Mock fs/promises to use memfs
vi.mock("fs/promises", () => {
  return {
    default: vol.promises,
    ...vol.promises,
  };
});

describe("PackRegistry", () => {
  let registry: PackRegistry;

  beforeEach(() => {
    registry = new PackRegistry();
    vol.reset();
  });

  afterEach(() => {
    vol.reset();
  });

  const createMockManifest = (id: string, name: string): SciencePackManifestV1 => ({
    schema: "zerowall.science/pack/v1",
    id,
    name,
    description: `${name} pack`,
    version: "1.0.0",
    source: {
      repo: "https://github.com/test/repo",
      commit: "a1b2c3d4e5f6789012345678901234567890abcd",
      path: `packs/${id}`,
      modified: false,
    },
    components: {
      skills: [
        {
          id: `${id}-skill`,
          name: `${name} Skill`,
          description: "Test skill",
          path: "skills/test/SKILL.md",
        },
      ],
    },
  });

  it("loads packs from directory", async () => {
    const manifest1 = createMockManifest("pack-a", "Pack A");
    const manifest2 = createMockManifest("pack-b", "Pack B");

    vol.fromJSON({
      "/runtime/packs/pack-a/manifest.yaml": `schema: zerowall.science/pack/v1
id: pack-a
name: Pack A
description: Pack A pack
version: 1.0.0
source:
  repo: https://github.com/test/repo
  commit: a1b2c3d4e5f6789012345678901234567890abcd
  path: packs/pack-a
  modified: false
components:
  skills:
    - id: pack-a-skill
      name: Pack A Skill
      description: Test skill
      path: skills/test/SKILL.md
`,
      "/runtime/packs/pack-b/manifest.yaml": `schema: zerowall.science/pack/v1
id: pack-b
name: Pack B
description: Pack B pack
version: 1.0.0
source:
  repo: https://github.com/test/repo
  commit: a1b2c3d4e5f6789012345678901234567890abcd
  path: packs/pack-b
  modified: false
components:
  skills:
    - id: pack-b-skill
      name: Pack B Skill
      description: Test skill
      path: skills/test/SKILL.md
`,
    });

    await registry.load("/runtime");

    expect(registry.isLoaded()).toBe(true);
    expect(registry.listPacks()).toHaveLength(2);
  });

  it("returns empty list before loading", () => {
    expect(registry.listPacks()).toEqual([]);
    expect(registry.isLoaded()).toBe(false);
  });

  it("retrieves pack by ID", async () => {
    vol.fromJSON({
      "/runtime/packs/test-pack/manifest.yaml": `schema: zerowall.science/pack/v1
id: test-pack
name: Test Pack
description: Test pack
version: 1.0.0
source:
  repo: https://github.com/test/repo
  commit: a1b2c3d4e5f6789012345678901234567890abcd
  path: packs/test-pack
  modified: false
components:
  skills:
    - id: test-skill
      name: Test Skill
      description: Test skill
      path: skills/test/SKILL.md
`,
    });

    await registry.load("/runtime");

    const pack = registry.getPack("test-pack");
    expect(pack).toBeDefined();
    expect(pack?.manifest.name).toBe("Test Pack");
  });

  it("returns undefined for non-existent pack", async () => {
    vol.fromJSON({
      "/runtime/packs/test-pack/manifest.yaml": `schema: zerowall.science/pack/v1
id: test-pack
name: Test Pack
description: Test pack
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

    await registry.load("/runtime");

    expect(registry.getPack("non-existent")).toBeUndefined();
  });

  it("lists all skills across packs", async () => {
    vol.fromJSON({
      "/runtime/packs/pack-a/manifest.yaml": `schema: zerowall.science/pack/v1
id: pack-a
name: Pack A
description: Pack A
version: 1.0.0
source:
  repo: https://github.com/test/repo
  commit: a1b2c3d4e5f6789012345678901234567890abcd
  path: packs/pack-a
  modified: false
components:
  skills:
    - id: skill-1
      name: Skill 1
      description: First skill
      path: skills/1/SKILL.md
    - id: skill-2
      name: Skill 2
      description: Second skill
      path: skills/2/SKILL.md
`,
      "/runtime/packs/pack-b/manifest.yaml": `schema: zerowall.science/pack/v1
id: pack-b
name: Pack B
description: Pack B
version: 1.0.0
source:
  repo: https://github.com/test/repo
  commit: a1b2c3d4e5f6789012345678901234567890abcd
  path: packs/pack-b
  modified: false
components:
  skills:
    - id: skill-3
      name: Skill 3
      description: Third skill
      path: skills/3/SKILL.md
`,
    });

    await registry.load("/runtime");

    const skills = registry.listAllSkills();
    expect(skills).toHaveLength(3);
    expect(skills.map((s) => s.skill.id)).toEqual(["skill-1", "skill-2", "skill-3"]);
  });

  it("filters enabled skills only", async () => {
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
  skills:
    - id: enabled-skill
      name: Enabled Skill
      description: Enabled
      path: skills/enabled/SKILL.md
      enabled: true
    - id: disabled-skill
      name: Disabled Skill
      description: Disabled
      path: skills/disabled/SKILL.md
      enabled: false
`,
    });

    await registry.load("/runtime");

    const enabledSkills = registry.listEnabledSkills();
    expect(enabledSkills).toHaveLength(1);
    expect(enabledSkills[0].skill.id).toBe("enabled-skill");
  });

  it("throws on pack ID collision", async () => {
    vol.fromJSON({
      "/runtime/packs/pack-a/manifest.yaml": `schema: zerowall.science/pack/v1
id: duplicate
name: Pack A
description: First
version: 1.0.0
source:
  repo: https://github.com/test/repo
  commit: a1b2c3d4e5f6789012345678901234567890abcd
  path: packs/pack-a
  modified: false
components:
  skills: []
`,
      "/runtime/packs/pack-b/manifest.yaml": `schema: zerowall.science/pack/v1
id: duplicate
name: Pack B
description: Second
version: 1.0.0
source:
  repo: https://github.com/test/repo
  commit: b2c3d4e5f67890123456789012345678901abcde
  path: packs/pack-b
  modified: false
components:
  skills: []
`,
    });

    await expect(registry.load("/runtime")).rejects.toThrow(/collision/i);
  });

  it("skips invalid manifests with warning", async () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    vol.fromJSON({
      "/runtime/packs/valid/manifest.yaml": `schema: zerowall.science/pack/v1
id: valid
name: Valid Pack
description: Valid
version: 1.0.0
source:
  repo: https://github.com/test/repo
  commit: a1b2c3d4e5f6789012345678901234567890abcd
  path: packs/valid
  modified: false
components:
  skills: []
`,
      "/runtime/packs/invalid/manifest.yaml": `invalid: yaml: content`,
    });

    await registry.load("/runtime");

    expect(registry.listPacks()).toHaveLength(1);
    expect(registry.getPack("valid")).toBeDefined();
    expect(consoleWarnSpy).toHaveBeenCalled();

    consoleWarnSpy.mockRestore();
  });

  it("can be cleared for testing", async () => {
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

    await registry.load("/runtime");
    expect(registry.isLoaded()).toBe(true);
    expect(registry.listPacks()).toHaveLength(1);

    registry.clear();
    expect(registry.isLoaded()).toBe(false);
    expect(registry.listPacks()).toEqual([]);
  });
});
