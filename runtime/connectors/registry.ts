import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import type { ConnectorSchema, DomainGroup, ToolDefinition } from "./schema";
import { DOMAIN_GROUPS, EXPECTED_TOOL_COUNT } from "./schema";

/**
 * Central registry for all life-science MCP connectors.
 * Loads manifests from runtime/connectors/manifests/ and validates
 * tool name uniqueness across all 23 domain groups.
 */
export class ConnectorRegistry {
  private schemas: Map<DomainGroup, ConnectorSchema> = new Map();
  private toolsByName: Map<
    string,
    { group: DomainGroup; tool: ToolDefinition }
  > = new Map();

  /**
   * Load all manifest JSON files from the manifests directory.
   */
  loadManifests(manifestsDir: string): void {
    const files = readdirSync(manifestsDir).filter((f) => f.endsWith(".json"));

    for (const file of files) {
      const path = join(manifestsDir, file);
      const content = readFileSync(path, "utf-8");
      const manifest = JSON.parse(content);

      // Convert manifest JSON to ConnectorSchema
      const schema: ConnectorSchema = {
        version: "1.0.0",
        groupId: manifest.domain,
        groupName: manifest.domain,
        description: `${manifest.toolCount} tools for ${manifest.domain}`,
        tools: manifest.tools,
        provider: {
          type: "mcp",
          name: `mcp-${manifest.domain}`,
          package: `mcp-${manifest.domain}`,
          command: ["python", "-m", `mcp_${manifest.domain.replace(/-/g, "_")}.server`],
        },
      };

      this.register(schema);
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
          `Tool name conflict: "${tool.name}" already registered in group "${existing.group}" (attempting to register in "${group}")`
        );
      }
    }

    // Register all tools
    for (const tool of schema.tools) {
      this.toolsByName.set(tool.name, { group, tool });
    }

    this.schemas.set(group, schema);
  }

  /**
   * Validate that the registry meets P4 Phase 1 requirements:
   * - Exactly 23 domain groups
   * - Exactly 247 tools total
   * - All tool names unique
   */
  validate(): void {
    const groupCount = this.schemas.size;
    const toolCount = this.getTotalToolCount();

    const errors: string[] = [];

    if (groupCount !== 23) {
      errors.push(
        `Expected 23 domain groups, found ${groupCount}. Missing: ${this.getMissingGroups().join(", ")}`
      );
    }

    if (toolCount !== EXPECTED_TOOL_COUNT) {
      errors.push(
        `Expected ${EXPECTED_TOOL_COUNT} tools total, found ${toolCount} (gap: ${EXPECTED_TOOL_COUNT - toolCount})`
      );
    }

    // Check for duplicate tool names (should never happen if register() works correctly)
    const namesSeen = new Set<string>();
    const duplicates: string[] = [];
    for (const [name] of this.toolsByName) {
      if (namesSeen.has(name)) {
        duplicates.push(name);
      }
      namesSeen.add(name);
    }

    if (duplicates.length > 0) {
      errors.push(`Duplicate tool names detected: ${duplicates.join(", ")}`);
    }

    if (errors.length > 0) {
      throw new Error(
        `ConnectorRegistry validation failed:\n${errors.map((e) => `  - ${e}`).join("\n")}`
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
  getTool(
    toolName: string
  ): { group: DomainGroup; tool: ToolDefinition } | undefined {
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
   * Get total tool count across all registered groups.
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
    missingGroups: DomainGroup[];
    groupCounts: Record<string, number>;
  } {
    const groupCounts: Record<string, number> = {};
    for (const group of this.getGroups()) {
      groupCounts[group] = this.getToolCount(group);
    }

    return {
      totalGroups: this.schemas.size,
      totalTools: this.getTotalToolCount(),
      missingGroups: this.getMissingGroups(),
      groupCounts,
    };
  }
}
