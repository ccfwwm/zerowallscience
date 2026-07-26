/**
 * ZeroWall Science Model Definitions and Role Bindings (P2)
 *
 * Defines the seven role-specific model slots and domestic model providers.
 * Each role has a primary and fallback model binding, supporting graceful
 * degradation when the primary endpoint is unavailable.
 */

/**
 * Agent roles in ZeroWall Science. Each role maps to a specific model binding.
 */
export type AgentRole = "general" | "research" | "code" | "data";

/**
 * Model slot identifier. Each slot corresponds to a role-specific use case.
 */
export type ModelSlot =
  | "general-primary"
  | "general-fallback"
  | "research-primary"
  | "research-fallback"
  | "code-primary"
  | "code-fallback"
  | "data-primary";

/**
 * Domestic model provider identifiers (P2 requirement: Kimi/GLM/DeepSeek probing).
 */
export type DomesticProvider = "kimi" | "glm" | "deepseek" | "baichuan" | "minimax";

/**
 * Model provider entry (detected via OpenCode /config/providers API).
 */
export interface ModelProvider {
  id: string;
  name: string;
  models: string[];
  authMethod?: "api" | "oauth";
  baseURL?: string;
}

/**
 * Role-specific model binding. Maps an agent role to primary and fallback models.
 */
export interface RoleModelBinding {
  role: AgentRole;
  primary: string; // "provider/model" format
  fallback?: string;
  reasoning?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
}

/**
 * Default model bindings for each role (can be overridden per session).
 */
export const DEFAULT_ROLE_BINDINGS: Record<AgentRole, RoleModelBinding> = {
  general: {
    role: "general",
    primary: "anthropic/claude-sonnet-5",
    fallback: "deepseek/deepseek-chat",
    reasoning: "medium",
  },
  research: {
    role: "research",
    primary: "anthropic/claude-opus-5",
    fallback: "kimi/moonshot-v1-128k",
    reasoning: "high",
  },
  code: {
    role: "code",
    primary: "anthropic/claude-sonnet-5",
    fallback: "deepseek/deepseek-coder",
    reasoning: "medium",
  },
  data: {
    role: "data",
    primary: "anthropic/claude-opus-5",
    fallback: "glm/glm-4-plus",
    reasoning: "high",
  },
};

/**
 * Domestic model endpoint defaults (for probing and fallback).
 */
export const DOMESTIC_MODEL_ENDPOINTS: Record<DomesticProvider, string> = {
  kimi: "https://api.moonshot.cn/v1",
  glm: "https://open.bigmodel.cn/api/paas/v4",
  deepseek: "https://api.deepseek.com",
  baichuan: "https://api.baichuan-ai.com/v1",
  minimax: "https://api.minimax.chat/v1",
};

/**
 * Probe a model endpoint for available models (via OpenAI-compatible /models).
 * Returns model IDs if successful, empty array if unavailable.
 */
export async function probeModels(
  baseURL: string,
  apiKey?: string,
): Promise<string[]> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const response = await fetch(`${baseURL}/models`, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    if (!data.data || !Array.isArray(data.data)) {
      return [];
    }

    return data.data.map((m: any) => m.id).filter((id: string) => !!id);
  } catch {
    return [];
  }
}

/**
 * Resolve the active model for a role, with fallback logic.
 * Returns the primary model if available, otherwise the fallback, otherwise undefined.
 */
export function resolveRoleModel(
  role: AgentRole,
  bindings: Record<AgentRole, RoleModelBinding>,
  availableProviders: Set<string>,
): string | undefined {
  const binding = bindings[role];
  const primaryProvider = binding.primary.split("/")[0];
  if (availableProviders.has(primaryProvider)) {
    return binding.primary;
  }
  if (binding.fallback) {
    const fallbackProvider = binding.fallback.split("/")[0];
    if (availableProviders.has(fallbackProvider)) {
      return binding.fallback;
    }
  }
  return undefined;
}

/**
 * Session model snapshot. Captured at session creation for reproducibility.
 * Stores the exact model, provider, and reasoning effort used.
 */
export interface SessionModelSnapshot {
  sessionId: string;
  createdAt: string; // ISO 8601
  role: AgentRole;
  model: string; // "provider/model"
  reasoning?: string;
  providerBaseURL?: string;
  providerVersion?: string;
}
