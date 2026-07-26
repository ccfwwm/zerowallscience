// The registry is only as good as its agreement with the vendored tree, so the
// tests read that tree rather than a fixture copy of it: `domains.json` for the
// tool names, `deferred.json` for the gate, `lib/` for the packages that must
// exist. A drift between the TS layer and the Python it launches shows up here.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { ConnectorRegistry, readDeferralGate } from "../registry";
import {
  DEFAULT_AVAILABLE_TOOL_COUNT,
  DOMAIN_GROUPS,
  EXPECTED_TOOL_COUNT,
  LICENSE_RESTRICTED_TOOLS,
  packageForDomain,
} from "../schema";

const here = dirname(fileURLToPath(import.meta.url));
const MANIFESTS_DIR = join(here, "..", "manifests");
const BIO_TOOLS_DIR = join(here, "..", "bio-tools");
const DOMAINS_JSON = join(BIO_TOOLS_DIR, "lib", "mcp_bio", "domains.json");

/** `{slug: [tool names]}` — the source of truth both sides must match. */
function readDomains(): Record<string, string[]> {
  return JSON.parse(readFileSync(DOMAINS_JSON, "utf-8"));
}

/** A minimal vendored tree: launcher, gate, and one server package per domain. */
function fakeBioTools(gate: Record<string, unknown>, domains = DOMAIN_GROUPS): string {
  const dir = mkdtempSync(join(tmpdir(), "zw-biotools-"));
  writeFileSync(join(dir, "run_server.py"), "");
  mkdirSync(join(dir, "lib", "mcp_bio"), { recursive: true });
  writeFileSync(join(dir, "lib", "mcp_bio", "deferred.json"), JSON.stringify(gate));
  for (const domain of domains) {
    const pkg = join(dir, "lib", packageForDomain(domain));
    mkdirSync(pkg, { recursive: true });
    writeFileSync(join(pkg, "server.py"), "");
  }
  return dir;
}

/** A manifests dir holding exactly the given manifests. */
function fakeManifests(manifests: Array<Record<string, unknown>>, name?: (m: never) => string): string {
  const dir = mkdtempSync(join(tmpdir(), "zw-manifests-"));
  for (const manifest of manifests) {
    const file = name ? name(manifest as never) : `${manifest.domain}.json`;
    writeFileSync(join(dir, file), JSON.stringify(manifest));
  }
  return dir;
}

const PASSING_GATE = {
  domains: [],
  tools: [],
  license_tools: [...LICENSE_RESTRICTED_TOOLS],
};

describe("the vendored tree the registry launches", () => {
  it("has a server package for every domain group", () => {
    for (const group of DOMAIN_GROUPS) {
      const server = join(BIO_TOOLS_DIR, "lib", packageForDomain(group), "server.py");
      expect(existsSync(server), `missing ${server}`).toBe(true);
    }
  });

  it("defines the same domain slugs as schema.ts", () => {
    expect(Object.keys(readDomains()).sort()).toEqual([...DOMAIN_GROUPS].sort());
  });

  it("defines EXPECTED_TOOL_COUNT tools in total", () => {
    const total = Object.values(readDomains()).reduce((n, tools) => n + tools.length, 0);
    expect(total).toBe(EXPECTED_TOOL_COUNT);
  });
});

describe("ConnectorRegistry over the real manifests", () => {
  let registry: ConnectorRegistry;

  beforeAll(() => {
    registry = new ConnectorRegistry();
    registry.loadManifests(MANIFESTS_DIR);
  });

  it("validates", () => {
    expect(() => registry.validate()).not.toThrow();
  });

  it("registers every domain group and every tool", () => {
    expect(registry.getGroups().sort()).toEqual([...DOMAIN_GROUPS].sort());
    expect(registry.getMissingGroups()).toEqual([]);
    expect(registry.getTotalToolCount()).toBe(EXPECTED_TOOL_COUNT);
  });

  it("serves exactly the tool names domains.json lists, per domain", () => {
    const domains = readDomains();
    for (const group of DOMAIN_GROUPS) {
      const registered = registry
        .getToolsForGroup(group)
        .map((t) => t.name)
        .sort();
      expect(registered, group).toEqual([...domains[group]].sort());
    }
  });

  it("gives every tool a non-empty single-line description", () => {
    for (const group of DOMAIN_GROUPS) {
      for (const tool of registry.getToolsForGroup(group)) {
        expect(tool.description.trim(), tool.name).not.toBe("");
        expect(tool.description, tool.name).not.toContain("\n");
      }
    }
  });

  it("launches each domain through the documented launcher", () => {
    for (const group of DOMAIN_GROUPS) {
      const command = registry.getSchema(group)!.provider.command!;
      expect(command[0]).toBe("python");
      expect(command[1].endsWith("run_server.py"), command[1]).toBe(true);
      expect(existsSync(command[1]), command[1]).toBe(true);
      expect(command[2]).toBe(packageForDomain(group));
      expect(command).toHaveLength(3);
    }
  });

  it("never launches a domain as a python module", () => {
    // `python -m <pkg>.server` cannot start these servers: no package defines
    // __main__, `lib/` is not on sys.path, and the TLS posture step is skipped.
    for (const group of DOMAIN_GROUPS) {
      expect(registry.getSchema(group)!.provider.command).not.toContain("-m");
    }
  });

  it("withholds exactly the licence-restricted tools by default", () => {
    for (const name of LICENSE_RESTRICTED_TOOLS) {
      expect(registry.getTool(name), name).toBeDefined();
      expect(registry.isWithheld(name), name).toBe(true);
    }
    expect(registry.getAvailableToolCount()).toBe(DEFAULT_AVAILABLE_TOOL_COUNT);
    expect(registry.getAvailableToolNames()).not.toContain("cadd_variant_score");
  });

  it("reports the gate in its summary", () => {
    const summary = registry.getSummary();
    expect(summary.totalGroups).toBe(DOMAIN_GROUPS.length);
    expect(summary.totalTools).toBe(EXPECTED_TOOL_COUNT);
    expect(summary.withheldTools).toBe(LICENSE_RESTRICTED_TOOLS.length);
    expect(summary.availableTools + summary.withheldTools).toBe(EXPECTED_TOOL_COUNT);
  });
});

describe("the deferral gate", () => {
  it("matches LICENSE_RESTRICTED_TOOLS in the real tree", () => {
    const gate = readDeferralGate(BIO_TOOLS_DIR);
    expect([...gate.licenseTools].sort()).toEqual([...LICENSE_RESTRICTED_TOOLS].sort());
  });

  it("fails closed when the file is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "zw-nogate-"));
    expect(() => readDeferralGate(dir)).toThrow(/Deferral gate not found/);
  });

  it("fails closed when license_tools disagrees with schema.ts", () => {
    const dir = fakeBioTools({ ...PASSING_GATE, license_tools: ["cadd_variant_score"] });
    expect(() => readDeferralGate(dir)).toThrow(/disagrees with LICENSE_RESTRICTED_TOOLS/);
  });

  it("rejects a malformed list", () => {
    const dir = fakeBioTools({ domains: "all", tools: [], license_tools: [] });
    expect(() => readDeferralGate(dir)).toThrow(/"domains" must be an array of strings/);
  });

  it("withholds a whole deferred domain", () => {
    const bio = fakeBioTools({ ...PASSING_GATE, domains: ["zinc"] });
    const domains = readDomains();
    const manifests = fakeManifests(
      DOMAIN_GROUPS.map((domain) => ({
        domain,
        toolCount: domains[domain].length,
        tools: domains[domain].map((name) => ({ name, description: `d ${name}` })),
      })),
    );

    const registry = new ConnectorRegistry();
    registry.loadManifests(manifests, bio);
    registry.validate();

    for (const name of domains.zinc) expect(registry.isWithheld(name), name).toBe(true);
    expect(registry.getAvailableToolCount()).toBe(
      DEFAULT_AVAILABLE_TOOL_COUNT - domains.zinc.length,
    );
  });

  it("rejects a deferred name that matches no tool", () => {
    const bio = fakeBioTools({ ...PASSING_GATE, tools: ["not_a_tool"] });
    const domains = readDomains();
    const manifests = fakeManifests(
      DOMAIN_GROUPS.map((domain) => ({
        domain,
        toolCount: domains[domain].length,
        tools: domains[domain].map((name) => ({ name, description: `d ${name}` })),
      })),
    );

    const registry = new ConnectorRegistry();
    registry.loadManifests(manifests, bio);
    expect(() => registry.validate()).toThrow(/Deferred tool "not_a_tool" is not a registered tool/);
  });
});

describe("loadManifests rejects a manifest it cannot launch", () => {
  const bio = () => fakeBioTools(PASSING_GATE);
  const one = (over: Record<string, unknown> = {}) => ({
    domain: "zinc",
    toolCount: 1,
    tools: [{ name: "t", description: "d" }],
    ...over,
  });

  it("rejects an unknown domain slug", () => {
    const manifests = fakeManifests([one({ domain: "genomics" })]);
    expect(() => new ConnectorRegistry().loadManifests(manifests, bio())).toThrow(
      /unknown domain "genomics"/,
    );
  });

  it("rejects a file name that does not match its domain", () => {
    const manifests = fakeManifests([one()], () => "zinc-v2.json");
    expect(() => new ConnectorRegistry().loadManifests(manifests, bio())).toThrow(
      /must be "zinc\.json"/,
    );
  });

  it("rejects a toolCount that disagrees with the list", () => {
    const manifests = fakeManifests([one({ toolCount: 9 })]);
    expect(() => new ConnectorRegistry().loadManifests(manifests, bio())).toThrow(
      /toolCount 9 but 1 tools listed/,
    );
  });

  it("rejects a domain whose server package is absent", () => {
    // Every slug but `zinc` has a package in this tree.
    const withoutZinc = DOMAIN_GROUPS.filter((g) => g !== "zinc");
    const manifests = fakeManifests([one()]);
    expect(() =>
      new ConnectorRegistry().loadManifests(manifests, fakeBioTools(PASSING_GATE, withoutZinc)),
    ).toThrow(/has no server at/);
  });

  it("rejects a tree with no launcher", () => {
    const dir = mkdtempSync(join(tmpdir(), "zw-nolauncher-"));
    expect(() => new ConnectorRegistry().loadManifests(fakeManifests([one()]), dir)).toThrow(
      /MCP launcher not found/,
    );
  });
});
