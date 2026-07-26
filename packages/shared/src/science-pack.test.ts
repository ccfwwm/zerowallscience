import { describe, it, expect } from "vitest";
import {
  validatePackManifest,
  detectPackCollisions,
  compareVersions,
  PackValidationError,
  type SciencePackManifestV1,
} from "./science-pack";

describe("validatePackManifest", () => {
  const validManifest: SciencePackManifestV1 = {
    schema: "zerowall.science/pack/v1",
    id: "core-skills",
    name: "Core Skills",
    description: "Essential research and analysis skills",
    version: "1.0.0",
    source: {
      repo: "https://github.com/zerowall/science",
      commit: "a1b2c3d4e5f6789012345678901234567890abcd",
      path: "runtime/packs/core-skills",
      modified: false,
    },
    components: {
      skills: [
        {
          id: "analyze",
          name: "Analyze",
          description: "Deep data analysis",
          path: "skills/analyze/SKILL.md",
        },
      ],
    },
  };

  it("accepts valid manifest", () => {
    expect(validatePackManifest(validManifest)).toBe(true);
  });

  it("rejects non-object", () => {
    expect(() => validatePackManifest(null)).toThrow(PackValidationError);
    expect(() => validatePackManifest("string")).toThrow(PackValidationError);
  });

  it("rejects invalid schema version", () => {
    const invalid = { ...validManifest, schema: "wrong/version" };
    expect(() => validatePackManifest(invalid)).toThrow(PackValidationError);
  });

  it("rejects missing required fields", () => {
    const { id, ...missing } = validManifest;
    expect(() => validatePackManifest(missing)).toThrow(
      new PackValidationError("Missing required field: id", "id"),
    );
  });

  it("rejects invalid pack ID format", () => {
    const invalid = { ...validManifest, id: "Invalid_ID" };
    expect(() => validatePackManifest(invalid)).toThrow(PackValidationError);
  });

  it("accepts kebab-case pack IDs", () => {
    expect(validatePackManifest({ ...validManifest, id: "core" })).toBe(true);
    expect(validatePackManifest({ ...validManifest, id: "core-skills" })).toBe(true);
    expect(validatePackManifest({ ...validManifest, id: "core-skills-v2" })).toBe(true);
  });

  it("rejects invalid semver", () => {
    const invalid = { ...validManifest, version: "1.0" };
    expect(() => validatePackManifest(invalid)).toThrow(PackValidationError);
  });

  it("accepts valid semver with prerelease and build metadata", () => {
    expect(validatePackManifest({ ...validManifest, version: "1.0.0-alpha" })).toBe(true);
    expect(validatePackManifest({ ...validManifest, version: "1.0.0-beta.1" })).toBe(true);
    expect(validatePackManifest({ ...validManifest, version: "1.0.0+build.123" })).toBe(true);
    expect(validatePackManifest({ ...validManifest, version: "1.0.0-rc.1+build" })).toBe(true);
  });

  it("rejects invalid source object", () => {
    const invalid = { ...validManifest, source: { repo: "url" } };
    expect(() => validatePackManifest(invalid)).toThrow(PackValidationError);
  });

  it("rejects invalid commit SHA", () => {
    const invalid = {
      ...validManifest,
      source: { ...validManifest.source, commit: "short" },
    };
    expect(() => validatePackManifest(invalid)).toThrow(PackValidationError);
  });

  it("rejects invalid components", () => {
    const invalid = { ...validManifest, components: null };
    expect(() => validatePackManifest(invalid)).toThrow(PackValidationError);
  });

  it("rejects empty components", () => {
    const invalid = { ...validManifest, components: {} };
    expect(() => validatePackManifest(invalid)).toThrow(
      new PackValidationError(
        "Pack must contain at least one component type",
        "components",
      ),
    );
  });

  it("accepts packs with any component type", () => {
    expect(
      validatePackManifest({
        ...validManifest,
        components: { skills: [] },
      }),
    ).toBe(true);

    expect(
      validatePackManifest({
        ...validManifest,
        components: { mcpServers: [] },
      }),
    ).toBe(true);

    expect(
      validatePackManifest({
        ...validManifest,
        components: { agents: [] },
      }),
    ).toBe(true);

    expect(
      validatePackManifest({
        ...validManifest,
        components: { connectors: [] },
      }),
    ).toBe(true);
  });
});

describe("detectPackCollisions", () => {
  it("returns empty array for unique packs", () => {
    const packs: SciencePackManifestV1[] = [
      {
        schema: "zerowall.science/pack/v1",
        id: "pack-a",
        name: "Pack A",
        description: "First pack",
        version: "1.0.0",
        source: {
          repo: "https://example.com/repo",
          commit: "a1b2c3d4e5f6789012345678901234567890abcd",
          path: "packs/a",
          modified: false,
        },
        components: { skills: [] },
      },
      {
        schema: "zerowall.science/pack/v1",
        id: "pack-b",
        name: "Pack B",
        description: "Second pack",
        version: "1.0.0",
        source: {
          repo: "https://example.com/repo",
          commit: "b2c3d4e5f67890123456789012345678901abcde",
          path: "packs/b",
          modified: false,
        },
        components: { skills: [] },
      },
    ];

    expect(detectPackCollisions(packs)).toEqual([]);
  });

  it("detects duplicate pack IDs", () => {
    const packs: SciencePackManifestV1[] = [
      {
        schema: "zerowall.science/pack/v1",
        id: "duplicate",
        name: "Pack 1",
        description: "First",
        version: "1.0.0",
        source: {
          repo: "https://example.com/repo",
          commit: "a1b2c3d4e5f6789012345678901234567890abcd",
          path: "packs/1",
          modified: false,
        },
        components: { skills: [] },
      },
      {
        schema: "zerowall.science/pack/v1",
        id: "duplicate",
        name: "Pack 2",
        description: "Second",
        version: "2.0.0",
        source: {
          repo: "https://example.com/repo",
          commit: "b2c3d4e5f67890123456789012345678901abcde",
          path: "packs/2",
          modified: false,
        },
        components: { skills: [] },
      },
    ];

    expect(detectPackCollisions(packs)).toEqual(["duplicate"]);
  });

  it("detects multiple collisions", () => {
    const packs: SciencePackManifestV1[] = [
      {
        schema: "zerowall.science/pack/v1",
        id: "dup-a",
        name: "A1",
        description: "First A",
        version: "1.0.0",
        source: {
          repo: "https://example.com/repo",
          commit: "a1b2c3d4e5f6789012345678901234567890abcd",
          path: "a",
          modified: false,
        },
        components: { skills: [] },
      },
      {
        schema: "zerowall.science/pack/v1",
        id: "dup-a",
        name: "A2",
        description: "Second A",
        version: "1.0.0",
        source: {
          repo: "https://example.com/repo",
          commit: "b2c3d4e5f67890123456789012345678901abcde",
          path: "a2",
          modified: false,
        },
        components: { skills: [] },
      },
      {
        schema: "zerowall.science/pack/v1",
        id: "dup-b",
        name: "B1",
        description: "First B",
        version: "1.0.0",
        source: {
          repo: "https://example.com/repo",
          commit: "c3d4e5f678901234567890123456789012abcdef",
          path: "b",
          modified: false,
        },
        components: { skills: [] },
      },
      {
        schema: "zerowall.science/pack/v1",
        id: "dup-b",
        name: "B2",
        description: "Second B",
        version: "1.0.0",
        source: {
          repo: "https://example.com/repo",
          commit: "d4e5f6789012345678901234567890123abcdef0",
          path: "b2",
          modified: false,
        },
        components: { skills: [] },
      },
    ];

    expect(detectPackCollisions(packs)).toEqual(["dup-a", "dup-b"]);
  });
});

describe("compareVersions", () => {
  it("compares major versions", () => {
    expect(compareVersions("1.0.0", "2.0.0")).toBe(-1);
    expect(compareVersions("2.0.0", "1.0.0")).toBe(1);
  });

  it("compares minor versions", () => {
    expect(compareVersions("1.1.0", "1.2.0")).toBe(-1);
    expect(compareVersions("1.2.0", "1.1.0")).toBe(1);
  });

  it("compares patch versions", () => {
    expect(compareVersions("1.0.1", "1.0.2")).toBe(-1);
    expect(compareVersions("1.0.2", "1.0.1")).toBe(1);
  });

  it("returns 0 for equal versions", () => {
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("2.3.4", "2.3.4")).toBe(0);
  });

  it("ignores prerelease and build metadata", () => {
    expect(compareVersions("1.0.0-alpha", "1.0.0-beta")).toBe(0);
    expect(compareVersions("1.0.0+build.1", "1.0.0+build.2")).toBe(0);
    expect(compareVersions("1.0.0-rc.1+build", "1.0.0")).toBe(0);
  });
});
