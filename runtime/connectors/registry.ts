/**
 * Connector Registry
 *
 * Central registry for all 247 life-science MCP tools across 23 domain groups.
 * This registry validates tool name uniqueness and provides lookup functions.
 */

import type { ConnectorSchema, DomainGroup, ToolDefinition } from "./schema";

export class ConnectorRegistry {
  private schemas: Map<DomainGroup, ConnectorSchema> = new Map();
  private toolsByName: Map<string, { group: DomainGroup; tool: ToolDefinition }> = new Map();
  private toolsByGroup: Map<DomainGroup, ToolDefinition[]> = new Map();

  /**
   * Register a connector schema
   * @throws Error if tool names conflict
   */
  register(schema: ConnectorSchema): void {
    const groupId = schema.groupId as DomainGroup;

    // Validate tool name uniqueness
    for (const tool of schema.tools) {
      if (this.toolsByName.has(tool.name)) {
        const existing = this.toolsByName.get(tool.name)!;
        throw new Error(
          `Tool name conflict: "${tool.name}" already registered in group "${existing.group}"`,
        );
      }
      this.toolsByName.set(tool.name, { group: groupId, tool });
    }

    this.schemas.set(groupId, schema);
    this.toolsByGroup.set(groupId, schema.tools);
  }

  /**
   * Get connector schema by group ID
   */
  getSchema(groupId: DomainGroup): ConnectorSchema | undefined {
    return this.schemas.get(groupId);
  }

  /**
   * Get tool by name
   */
  getTool(name: string): { group: DomainGroup; tool: ToolDefinition } | undefined {
    return this.toolsByName.get(name);
  }

  /**
   * Get all tools for a group
   */
  getToolsForGroup(groupId: DomainGroup): ToolDefinition[] {
    return this.toolsByGroup.get(groupId) ?? [];
  }

  /**
   * Get all registered groups
   */
  getGroups(): DomainGroup[] {
    return Array.from(this.schemas.keys());
  }

  /**
   * Get total tool count
   */
  getTotalToolCount(): number {
    return this.toolsByName.size;
  }

  /**
   * Get public tools (no auth required)
   */
  getPublicTools(): Array<{ group: DomainGroup; tool: ToolDefinition }> {
    const publicTools: Array<{ group: DomainGroup; tool: ToolDefinition }> = [];
    for (const [name, entry] of this.toolsByName.entries()) {
      if (entry.tool.isPublic) {
        publicTools.push(entry);
      }
    }
    return publicTools;
  }

  /**
   * Validate registry integrity
   * @throws Error if validation fails
   */
  validate(): void {
    const totalTools = this.getTotalToolCount();
    if (totalTools !== 247) {
      throw new Error(
        `Expected 247 tools, but registry contains ${totalTools} tools`,
      );
    }

    const groups = this.getGroups();
    if (groups.length !== 23) {
      throw new Error(
        `Expected 23 groups, but registry contains ${groups.length} groups`,
      );
    }

    // Validate each schema
    for (const schema of this.schemas.values()) {
      if (!schema.version) {
        throw new Error(`Schema ${schema.groupId} missing version`);
      }
      if (schema.tools.length === 0) {
        throw new Error(`Schema ${schema.groupId} has no tools`);
      }
    }
  }
}

/** Global registry instance */
export const globalRegistry = new ConnectorRegistry();
