import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import type { ConnectorSchema, DomainGroup, ToolDefinition } from "./schema";
import {
  DOMAIN_GROUPS,
  EXPECTED_TOOL_COUNT,
  LICENSE_RESTRICTED_TOOLS,
  packageForDomain,
} from "./schema";

/** The vendored implementation, relative to `runtime/connectors/manifests/`. */
const BIO_TOOLS_FROM_MANIFESTS = join("..", "bio-tools");

/** Launcher script inside the vendored tree. */
const LAUNCHER = "run_server.py";

/**
 * What `bio-tools/lib/mcp_bio/deferred.json` withholds.
 *
 * Two independent mechanisms share one file, and they are released differently:
 *
 * - `domains` / `tools` — net-new upstream resources pending legal review.
 *   Released by emptying both lists once review clears them.
 * - `license_tools` — upstreams whose own licence restricts redistribution or
 *   commercial use (DepMap, KEGG, CADD, PanglaoDB). Deliberately NOT on that
 *   switch; lifted per upstream only when legal clears that specific licence.
 */
export interface DeferralGate {
  domains: string[];
  tools: string[];
  licenseTools: string[];
}

/** Everything a gate withholds, as one set of tool names plus domain slugs. */
function gateAll(gate: DeferralGate): { tools: Set<string>; domains: Set<string> } {
  return {
    tools: new Set([...gate.tools, ...gate.licenseTools]),
    domains: new Set(gate.domains),
  };
}

/**
 * Read the deferral gate from the vendored tree.
 *
 * Fails closed: a missing or malformed file is an error, not an empty gate, and
 * `license_tools` must match `LICENSE_RESTRICTED_TOOLS` exactly. The Python
 * `load_deferred()` would let a typo through silently — a restricted tool then
 * ships — so the disagreement is caught here instead.
 */
export function readDeferralGate(bioToolsDir: string): DeferralGate {
  const path = join(bioToolsDir, "lib", "mcp_bio", "deferred.json");
  if (!existsSync(path)) {
    throw new Error(`Deferral gate not found: ${path}`);
  }

  const raw = JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
  const list = (key: string): string[] => {
    const value = raw[key];
    if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
      throw new Error(`Deferral gate ${path}: "${key}" must be an array of strings`);
    }
    return value as string[];
  };

  const gate: DeferralGate = {
    domains: list("domains"),
    tools: list("tools"),
    licenseTools: list("license_tools"),
  };

  const declared = [...LICENSE_RESTRICTED_TOOLS].sort();
  const actual = [...gate.licenseTools].sort();
  if (declared.join("\n") !== actual.join("\n")) {
    throw new Error(
      `Deferral gate ${path}: license_tools disagrees with LICENSE_RESTRICTED_TOOLS in schema.ts.\n` +
        `  only in deferred.json: ${actual.filter((t) => !declared.includes(t)).join(", ") || "—"}\n` +
        `  only in schema.ts:     ${declared.filter((t) => !actual.includes(t)).join(", ") || "—"}`,
    );
  }

  return gate;
}

/**
 * Central registry for all life-science MCP connectors.
 *
 * Loads manifests from `runtime/connectors/manifests/` and holds them against
 * the vendored implementation in `runtime/connectors/bio-tools/`: every domain
 * slug must name a package that exists on disk, and every withheld tool must
 * name a tool that was actually registered. The registry describes what ships;
 * it must not be able to describe a connector that cannot start.
 */
export class ConnectorRegistry {
  private schemas: Map<DomainGroup, ConnectorSchema> = new Map();
  private toolsByName: Map<string, { group: DomainGroup; tool: ToolDefinition }> = new Map();
  private gate: DeferralGate = { domains: [], tools: [], licenseTools: [] };

  /**
   * Load every manifest in `manifestsDir` and the deferral gate beside them.
   *
   * `bioToolsDir` defaults to the vendored tree's checked-in location next to
   * the manifests; pass it explicitly when the assets are staged elsewhere
   * (packaged app, test fixture).
   */
  loadManifests(
    manifestsDir: string,
    bioToolsDir: string = join(manifestsDir, BIO_TOOLS_FROM_MANIFESTS),
  ): void {
    const launcher = join(bioToolsDir, LAUNCHER);
    if (!existsSync(launcher)) {
      throw new Error(`MCP launcher not found: ${launcher}`);
    }
    this.gate = readDeferralGate(bioToolsDir);

    const files = readdirSync(manifestsDir).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      const path = join(manifestsDir, file);
      const manifest = JSON.parse(readFileSync(path, "utf-8"));
      const group = manifest.domain as DomainGroup;

      if (!DOMAIN_GROUPS.includes(group)) {
        throw new Error(
          `${path}: unknown domain "${manifest.domain}". Domain slugs are the keys of ` +
            `bio-tools/lib/mcp_bio/domains.json; regenerate the manifests rather than adding one.`,
        );
      }
      if (file !== `${group}.json`) {
        throw new Error(`${path}: file name must be "${group}.json" to match its domain`);
      }
      if (!Array.isArray(manifest.tools)) {
        throw new Error(`${path}: "tools" must be an array`);
      }
      if (manifest.toolCount !== manifest.tools.length) {
        throw new Error(
          `${path}: toolCount ${manifest.toolCount} but ${manifest.tools.length} tools listed`,
        );
      }

      // A slug with no package on disk is a connector that cannot start.
      const pkg = packageForDomain(group);
      const serverFile = join(bioToolsDir, "lib", pkg, "server.py");
      if (!existsSync(serverFile)) {
        throw new Error(`${path}: domain "${group}" has no server at ${serverFile}`);
      }

      this.register({
        version: "1.0.0",
        groupId: group,
        groupName: group,
        description: `${manifest.toolCount} tools served by ${pkg}`,
        tools: manifest.tools,
        provider: {
          type: "mcp",
          name: `mcp-${group}`,
          package: pkg,
          // The documented entry point (`run_server.py` module docstring). Not
          // `python -m <pkg>.server`: no package defines `__main__`, that form
          // needs `lib/` already on `sys.path`, and it skips the launcher's TLS
          // posture step. `python` is resolved to the managed interpreter by
          // `resolveMcpCommand` — never the user's own Python.
          command: ["python", launcher, pkg],
        },
      });
    }
  }

  /**
   * Register a connector schema. Validates that all tool names are unique
   * across all registered groups.
   */
  register(schema: ConnectorSchema): void {
    const group = schema.groupId as DomainGroup;

    // Check for tool name conflicts
    for (const tool of schema.tools) {
      if (this.toolsByName.has(tool.name)) {
        const existing = this.toolsByName.get(tool.name)!;
        throw new Error(
          `Tool name conflict: "${tool.name}" already registered in group "${existing.group}" (attempting to register in "${group}")`,
        );
      }
    }

    // Register all tools
    for (const tool of schema.tools) {
      this.toolsByName.set(tool.name, { group, tool });
    }

    this.schemas.set(group, schema);
  }

  /** The deferral gate in force, as loaded from the vendored tree. */
  getGate(): DeferralGate {
    return { ...this.gate };
  }

  /** Whether the gate withholds this tool (by name or by owning domain). */
  isWithheld(toolName: string): boolean {
    const { tools, domains } = gateAll(this.gate);
    if (tools.has(toolName)) return true;
    const entry = this.toolsByName.get(toolName);
    return entry ? domains.has(entry.group) : false;
  }

  /** Tool names served by default, i.e. those the gate does not withhold. */
  getAvailableToolNames(): string[] {
    return [...this.toolsByName.keys()].filter((name) => !this.isWithheld(name)).sort();
  }

  getAvailableToolCount(): number {
    return this.getAvailableToolNames().length;
  }

  /**
   * Validate the registry against the vendored implementation:
   * - every domain group registered
   * - the expected total tool count
   * - all tool names unique
   * - every withheld name actually names a registered tool or domain
   */
  validate(): void {
    const errors: string[] = [];

    const groupCount = this.schemas.size;
    if (groupCount !== DOMAIN_GROUPS.length) {
      errors.push(
        `Expected ${DOMAIN_GROUPS.length} domain groups, found ${groupCount}. Missing: ${this.getMissingGroups().join(", ")}`,
      );
    }

    const toolCount = this.getTotalToolCount();
    if (toolCount !== EXPECTED_TOOL_COUNT) {
      errors.push(
        `Expected ${EXPECTED_TOOL_COUNT} tools total, found ${toolCount} (gap: ${EXPECTED_TOOL_COUNT - toolCount})`,
      );
    }

    // A withheld name that matches nothing is a typo, and a typo means the tool
    // it was meant to withhold ships. Fail rather than silently serve it.
    for (const name of [...this.gate.tools, ...this.gate.licenseTools]) {
      if (!this.toolsByName.has(name)) {
        errors.push(`Deferred tool "${name}" is not a registered tool`);
      }
    }
    for (const domain of this.gate.domains) {
      if (!this.schemas.has(domain as DomainGroup)) {
        errors.push(`Deferred domain "${domain}" is not a registered group`);
      }
    }

    if (errors.length > 0) {
      throw new Error(
        `ConnectorRegistry validation failed:\n${errors.map((e) => `  - ${e}`).join("\n")}`,
      );
    }
  }

  /**
   * Get the list of domain groups that are defined but not yet registered.
   */
  getMissingGroups(): DomainGroup[] {
    const registered = new Set(this.schemas.keys());
    return DOMAIN_GROUPS.filter((g) => !registered.has(g));
  }

  /**
   * Get all registered domain groups.
   */
  getGroups(): DomainGroup[] {
    return Array.from(this.schemas.keys());
  }

  /**
   * Get the schema for a specific domain group.
   */
  getSchema(group: DomainGroup): ConnectorSchema | undefined {
    return this.schemas.get(group);
  }

  /**
   * Look up a tool by name across all groups.
   */
  getTool(toolName: string): { group: DomainGroup; tool: ToolDefinition } | undefined {
    return this.toolsByName.get(toolName);
  }

  /**
   * Get all tools in a specific domain group.
   */
  getToolsForGroup(group: DomainGroup): ToolDefinition[] {
    const schema = this.schemas.get(group);
    return schema ? schema.tools : [];
  }

  /**
   * Get total tool count across all registered groups, withheld ones included.
   */
  getTotalToolCount(): number {
    return this.toolsByName.size;
  }

  /**
   * Get tool count for a specific group.
   */
  getToolCount(group: DomainGroup): number {
    return this.getToolsForGroup(group).length;
  }

  /**
   * Get a summary report of the registry state.
   */
  getSummary(): {
    totalGroups: number;
    totalTools: number;
    availableTools: number;
    withheldTools: number;
    missingGroups: DomainGroup[];
    groupCounts: Record<string, number>;
  } {
    const groupCounts: Record<string, number> = {};
    for (const group of this.getGroups()) {
      groupCounts[group] = this.getToolCount(group);
    }

    const availableTools = this.getAvailableToolCount();
    return {
      totalGroups: this.schemas.size,
      totalTools: this.getTotalToolCount(),
      availableTools,
      withheldTools: this.getTotalToolCount() - availableTools,
      missingGroups: this.getMissingGroups(),
      groupCounts,
    };
  }
}
