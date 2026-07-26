/**
 * ZeroWall Science Agent Definitions (P2)
 *
 * Provides agent loading, validation, and routing logic.
 */

import type { AgentRole } from "./models";

/**
 * Agent capability flags.
 */
export interface AgentCapabilities {
  tools: boolean;
  reasoning: boolean;
  multimodal: boolean;
  codeExecution?: boolean;
  webAccess?: boolean;
}

/**
 * Agent permission policy.
 */
export interface AgentPermissions {
  mode: "off" | "approve" | "full";
  allowedTools: string[];
  blockedTools?: string[];
  maxConcurrentCalls?: number;
}

/**
 * Agent model binding (primary + fallback).
 */
export interface AgentModelBinding {
  primary?: string;
  fallback?: string;
  reasoning?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
}

/**
 * Agent definition (matches runtime/agents/schema-v1.json).
 */
export interface AgentDefinition {
  version: string;
  id: string;
  name: string;
  role: AgentRole;
  description?: string;
  capabilities: AgentCapabilities;
  permissions: AgentPermissions;
  modelBinding?: AgentModelBinding;
  systemPrompt?: string;
  metadata?: Record<string, any>;
}

/**
 * Agent handoff record (logged for replay and provenance).
 */
export interface AgentHandoff {
  timestamp: string; // ISO 8601
  fromAgent: string | null; // null for user-initiated
  toAgent: string;
  sessionId: string;
  reason: string; // "user-selected" | "role-routing" | "fallback"
  model: string; // resolved model at handoff time
}

/**
 * Validate an agent definition against the v1 schema.
 * Returns true if valid, throws with a descriptive error otherwise.
 */
export function validateAgentDefinition(def: any): def is AgentDefinition {
  if (def.version !== "1") {
    throw new Error(`Invalid agent version: expected "1", got "${def.version}"`);
  }
  if (!def.id || typeof def.id !== "string" || !/^[a-z][a-z0-9-]*$/.test(def.id)) {
    throw new Error(`Invalid agent id: "${def.id}"`);
  }
  if (!def.name || typeof def.name !== "string") {
    throw new Error(`Invalid agent name: "${def.name}"`);
  }
  if (!["general", "research", "code", "data"].includes(def.role)) {
    throw new Error(`Invalid agent role: "${def.role}"`);
  }
  if (!def.capabilities || typeof def.capabilities !== "object") {
    throw new Error(`Missing or invalid capabilities in agent "${def.id}"`);
  }
  if (!def.permissions || typeof def.permissions !== "object") {
    throw new Error(`Missing or invalid permissions in agent "${def.id}"`);
  }
  if (!["off", "approve", "full"].includes(def.permissions.mode)) {
    throw new Error(`Invalid permission mode: "${def.permissions.mode}"`);
  }
  return true;
}

/**
 * Load agent definitions from JSON files.
 * Returns a map of agent ID → definition.
 */
export function loadAgentDefinitions(agents: Record<string, any>): Map<string, AgentDefinition> {
  const map = new Map<string, AgentDefinition>();
  for (const [id, raw] of Object.entries(agents)) {
    try {
      if (validateAgentDefinition(raw)) {
        map.set(id, raw);
      }
    } catch (error) {
      console.error(`Failed to load agent "${id}":`, error);
    }
  }
  return map;
}

/**
 * Check if a tool matches an allowed pattern (glob-style).
 * Supports '*' wildcard and exact matches.
 */
export function isToolAllowed(
  tool: string,
  allowedPatterns: string[],
  blockedPatterns: string[] = [],
): boolean {
  // Check blocked list first
  for (const pattern of blockedPatterns) {
    if (matchesPattern(tool, pattern)) {
      return false;
    }
  }
  // Check allowed list
  for (const pattern of allowedPatterns) {
    if (matchesPattern(tool, pattern)) {
      return true;
    }
  }
  return false;
}

function matchesPattern(tool: string, pattern: string): boolean {
  if (pattern === "*") return true;
  if (pattern === tool) return true;
  if (pattern.endsWith("/*")) {
    const prefix = pattern.slice(0, -2);
    return tool === prefix || tool.startsWith(prefix + "/");
  }
  return false;
}

/**
 * The four built-in agent IDs.
 */
export const BUILT_IN_AGENTS = [
  "general-purpose",
  "research-assistant",
  "code-specialist",
  "data-analyst",
] as const;

export type BuiltInAgentId = typeof BUILT_IN_AGENTS[number];
