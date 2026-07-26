import { describe, it, expect, beforeEach, vi } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PackRegistry } from "./pack-registry";

/**
 * These tests used to mount `fs/promises` on memfs and call `registry.load()`.
 * That is exactly how the production defect survived a green suite: memfs made
 * the Node built-in resolve under vitest, while in the Tauri webview and the
 * gateway web client the same import rejected and the Packs screen showed no
 * packs at all. The registry now takes manifest text, so the tests hand it text
 * — and the last case loads the six manifests that actually ship.
 */

describe("PackRegistry", () => {
  let registry: PackRegistry;

  beforeEach(() => {
    registry = new PackRegistry();
  });

  it("loads packs from manifest text", () => {
    registry.loadFromSources([
      { path: "/runtime/packs/pack-a", yaml: `schema: zerowall.science/pack/v1
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
` },
      { path: "/runtime/packs/pack-b", yaml: `schema: zerowall.science/pack/v1
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
` },
    ]);

    expect(registry.isLoaded()).toBe(true);
    expect(registry.listPacks()).toHaveLength(2);
  });

  it("returns empty list before loading", () => {
    expect(registry.listPacks()).toEqual([]);
    expect(registry.isLoaded()).toBe(false);
  });

  it("retrieves pack by ID", () => {
    registry.loadFromSources([
      { path: "/runtime/packs/test-pack", yaml: `schema: zerowall.science/pack/v1
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
` },
    ]);

    const pack = registry.getPack("test-pack");
    expect(pack).toBeDefined();
    expect(pack?.manifest.name).toBe("Test Pack");
  });

  it("returns undefined for non-existent pack", () => {
    registry.loadFromSources([
      { path: "/runtime/packs/test-pack", yaml: `schema: zerowall.science/pack/v1
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
` },
    ]);

    expect(registry.getPack("non-existent")).toBeUndefined();
  });

  it("lists all skills across packs", () => {
    registry.loadFromSources([
      { path: "/runtime/packs/pack-a", yaml: `schema: zerowall.science/pack/v1
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
` },
      { path: "/runtime/packs/pack-b", yaml: `schema: zerowall.science/pack/v1
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
` },
    ]);

    const skills = registry.listAllSkills();
    expect(skills).toHaveLength(3);
    expect(skills.map((s) => s.skill.id)).toEqual(["skill-1", "skill-2", "skill-3"]);
  });

  it("filters enabled skills only", () => {
    registry.loadFromSources([
      { path: "/runtime/packs/test-pack", yaml: `schema: zerowall.science/pack/v1
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
` },
    ]);

    const enabledSkills = registry.listEnabledSkills();
    expect(enabledSkills).toHaveLength(1);
    expect(enabledSkills[0].skill.id).toBe("enabled-skill");
  });

  it("throws on pack ID collision", () => {
    const dup = (name: string, commit: string) => `schema: zerowall.science/pack/v1
id: duplicate
name: ${name}
description: ${name}
version: 1.0.0
source:
  repo: https://github.com/test/repo
  commit: ${commit}
  path: packs/${name}
  modified: false
components:
  skills: []
`;

    expect(() =>
      registry.loadFromSources([
        { path: "/runtime/packs/pack-a", yaml: dup("a", "a1b2c3d4e5f6789012345678901234567890abcd") },
        { path: "/runtime/packs/pack-b", yaml: dup("b", "b2c3d4e5f67890123456789012345678901abcde") },
      ]),
    ).toThrow(/collision/i);
  });

  it("skips invalid manifests with a warning and keeps the valid ones", () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    registry.loadFromSources([
      { path: "/runtime/packs/valid", yaml: `schema: zerowall.science/pack/v1
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
` },
      { path: "/runtime/packs/invalid", yaml: `invalid: yaml: content` },
    ]);

    expect(registry.listPacks()).toHaveLength(1);
    expect(registry.getPack("valid")).toBeDefined();
    expect(consoleWarnSpy).toHaveBeenCalled();

    consoleWarnSpy.mockRestore();
  });

  it("can be cleared for testing", () => {
    registry.loadFromSources([
      { path: "/runtime/packs/test-pack", yaml: `schema: zerowall.science/pack/v1
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
` },
    ]);
    expect(registry.isLoaded()).toBe(true);
    expect(registry.listPacks()).toHaveLength(1);

    registry.clear();
    expect(registry.isLoaded()).toBe(false);
    expect(registry.listPacks()).toEqual([]);
  });
});

/**
 * The manifests the product actually ships.
 *
 * Every case above uses fixtures, which is why a registry that could not read
 * anything still looked healthy. This one reads `runtime/packs/` and asserts the
 * packs parse, validate, and carry enabled skills — the thing the Packs screen
 * needs and did not have.
 */
describe("the shipped Science Packs", () => {
  const PACKS_DIR = join(__dirname, "..", "..", "..", "runtime", "packs");

  const shippedSources = () =>
    readdirSync(PACKS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({
        path: `runtime/packs/${entry.name}`,
        yaml: readFileSync(join(PACKS_DIR, entry.name, "manifest.yaml"), "utf-8"),
      }));

  it("all parse and register", () => {
    const sources = shippedSources();
    expect(sources.length).toBeGreaterThan(0);

    const registry = new PackRegistry();
    registry.loadFromSources(sources);

    // Every directory on disk must produce a pack: a manifest that fails
    // validation is skipped with a warning, so a count mismatch is the only
    // signal that one of the shipped packs is malformed.
    expect(registry.listPacks()).toHaveLength(sources.length);
  });

  it("ship skills that are enabled by default", () => {
    const registry = new PackRegistry();
    registry.loadFromSources(shippedSources());

    expect(registry.listAllSkills().length).toBeGreaterThan(0);
    expect(registry.listEnabledSkills().length).toBeGreaterThan(0);
  });
});
