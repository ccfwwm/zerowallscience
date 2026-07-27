/**
 * P2: Domestic Model Probing and Gateway Switching
 *
 * Implements automatic detection of Kimi/GLM/DeepSeek/Baichuan/MiniMax models
 * with primary/backup gateway failover (network errors only).
 */

import { DOMESTIC_MODEL_ENDPOINTS, probeModels } from "@zerowall/shared";

/**
 * Gateway configuration with tenant isolation.
 */
export interface GatewayConfig {
  url: string;
  priority: "primary" | "backup";
  tenant?: string;
}

/**
 * Default gateways for domestic model probing.
 */
export const DEFAULT_GATEWAYS: GatewayConfig[] = [
  { url: "https://code.aicodeme.xyz", priority: "primary" },
  { url: "https://code.aicodeme.cn", priority: "backup" },
];

/**
 * Probe result for a single provider.
 */
export interface ProbeResult {
  provider: string;
  models: string[];
  gateway: string;
  latency: number; // milliseconds
}

/**
 * Error types for gateway switching logic.
 */
export type ProbeErrorType =
  | "network" // Network error, timeout, 5xx
  | "auth"    // 401, 403
  | "quota"   // 429, quota exceeded
  | "other";  // Everything else

/**
 * Classify an error for gateway switching decisions.
 * Only network errors should trigger gateway failover.
 */
export function classifyProbeError(error: unknown): ProbeErrorType {
  if (error instanceof TypeError) {
    // Fetch network errors (CORS, DNS, connection refused)
    return "network";
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Timeout errors
    if (message.includes("timeout") || message.includes("aborted")) {
      return "network";
    }

    // Check for HTTP status in error message
    if (message.includes("401") || message.includes("403")) {
      return "auth";
    }

    if (message.includes("429") || message.includes("quota") || message.includes("balance")) {
      return "quota";
    }

    // 5xx errors are network-level issues
    if (/5\d{2}/.test(message)) {
      return "network";
    }
  }

  return "other";
}

/**
 * Probe a single provider through a gateway with timeout and error classification.
 */
async function probeProvider(
  provider: string,
  endpoint: string,
  gateway: GatewayConfig,
  apiKey?: string,
): Promise<ProbeResult | null> {
  const startTime = Date.now();

  try {
    // Use gateway as proxy prefix if configured
    const probeURL = gateway.tenant
      ? `${gateway.url}/${gateway.tenant}${endpoint}`
      : endpoint;

    const models = await probeModels(probeURL, apiKey);

    if (models.length === 0) {
      return null;
    }

    return {
      provider,
      models,
      gateway: gateway.url,
      latency: Date.now() - startTime,
    };
  } catch (error) {
    const errorType = classifyProbeError(error);

    // Only throw network errors for retry logic
    if (errorType === "network") {
      throw error;
    }

    // Auth/quota errors don't trigger failover
    return null;
  }
}

/**
 * Probe domestic models with primary/backup gateway failover.
 * Returns results from all reachable providers.
 */
export async function probeDomesticModels(
  gateways: GatewayConfig[] = DEFAULT_GATEWAYS,
  apiKeys?: Record<string, string>,
): Promise<Record<string, ProbeResult>> {
  const results: Record<string, ProbeResult> = {};
  const providers = Object.entries(DOMESTIC_MODEL_ENDPOINTS);

  // Sort gateways by priority
  const sortedGateways = [...gateways].sort((a, b) =>
    a.priority === "primary" ? -1 : b.priority === "primary" ? 1 : 0
  );

  // Probe each provider through gateways (primary first, backup on network error)
  for (const [provider, endpoint] of providers) {
    const apiKey = apiKeys?.[provider];

    for (const gateway of sortedGateways) {
      try {
        const result = await probeProvider(provider, endpoint, gateway, apiKey);

        if (result) {
          results[provider] = result;
          break; // Success - no need to try backup
        }
      } catch (error) {
        // Network error - try next gateway
        const errorType = classifyProbeError(error);

        if (errorType === "network" && gateway !== sortedGateways[sortedGateways.length - 1]) {
          continue; // Try backup gateway
        }

        // Last gateway or non-network error - skip this provider
        break;
      }
    }
  }

  return results;
}

/**
 * Local storage key for RoleModelBinding persistence.
 */
const ROLE_BINDING_STORAGE_KEY = "zerowall:roleModelBindings";

/**
 * Load RoleModelBinding from localStorage.
 */
export function loadRoleBindings(): Record<string, any> | null {
  try {
    const stored = localStorage.getItem(ROLE_BINDING_STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

/**
 * Save RoleModelBinding to localStorage.
 */
export function saveRoleBindings(bindings: Record<string, any>): void {
  try {
    localStorage.setItem(ROLE_BINDING_STORAGE_KEY, JSON.stringify(bindings));
  } catch (error) {
    console.error("Failed to save role bindings:", error);
  }
}

/**
 * Create a session model snapshot for reproducibility.
 */
export interface SessionModelSnapshot {
  sessionId: string;
  createdAt: string;
  role: string;
  model: string;
  reasoning?: string;
  gateway?: string;
  providerBaseURL?: string;
}

/**
 * Capture current model configuration as a snapshot.
 */
export function createModelSnapshot(
  sessionId: string,
  role: string,
  model: string,
  reasoning?: string,
  gateway?: string,
  providerBaseURL?: string,
): SessionModelSnapshot {
  return {
    sessionId,
    createdAt: new Date().toISOString(),
    role,
    model,
    reasoning,
    gateway,
    providerBaseURL,
  };
}

/**
 * Store session snapshot in sessionStorage (session-scoped).
 */
export function saveSessionSnapshot(snapshot: SessionModelSnapshot): void {
  try {
    const key = `zerowall:session:${snapshot.sessionId}`;
    sessionStorage.setItem(key, JSON.stringify(snapshot));
  } catch (error) {
    console.error("Failed to save session snapshot:", error);
  }
}

/**
 * Load session snapshot from sessionStorage.
 */
export function loadSessionSnapshot(sessionId: string): SessionModelSnapshot | null {
  try {
    const key = `zerowall:session:${sessionId}`;
    const stored = sessionStorage.getItem(key);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}
