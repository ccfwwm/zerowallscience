// Per-agent ACP runtime configuration (Sub2Api auto-injection).
//
// The problem this solves: the built-in ACP presets (Claude Code, Codex) name
// only the env var + provider id their KEY comes from — they carry no gateway
// address, so a bare launch hits the vendor's own endpoint (api.anthropic.com /
// api.openai.com). To route an ACP agent through the Sub2Api gateway we must
// also inject a base URL and a concrete model. Both are non-secret; the key
// itself still lives in the OS keychain and is materialized server-side at
// spawn (see acp_consumer.rs). Nothing here holds a secret value.
//
// Storage is localStorage, keyed per preset id, written by Sub2Api auto-setup
// after a group is provisioned and read by `connect()` when it builds the
// launch request. Injecting via env keeps the effect scoped to the child
// process this app spawns — a user's own `claude` / `codex` CLI, which reads
// the same vars from its own shell, is never touched.
import type { AcpLaunchRequest } from "./acp";
import type { AcpPreset } from "./acp-presets";

const CONFIG_KEY_PREFIX = "zerowall.acp.config.";

/** What a provisioned Sub2Api group contributes to an ACP agent: which keychain
 *  entry holds the key, the gateway base URL, and the model to pin. */
export interface AcpAgentConfig {
  /** Keychain provider id the group's key is stored under (`zerowall-<groupId>`). */
  providerId: string;
  /** Gateway base URL exactly as provisioning returned it (ends with `/v1`). */
  baseUrl: string;
  /** Concrete model id to pin via the agent's launch env. */
  model: string;
  /** Gateway group protocol. Optional for descriptors written by older builds. */
  platform?: string;
}

function configKey(presetId: string): string {
  return `${CONFIG_KEY_PREFIX}${presetId}`;
}

/** Persist a preset's gateway config. Best-effort — a storage failure just means
 *  the agent falls back to its own login on next launch. */
export function saveAcpConfig(presetId: string, config: AcpAgentConfig): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(configKey(presetId), JSON.stringify(config));
  } catch {
    /* storage full / unavailable — non-fatal */
  }
}

/** Read a preset's stored gateway config, or null when none was provisioned. */
export function loadAcpConfig(presetId: string): AcpAgentConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(configKey(presetId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AcpAgentConfig>;
    if (!parsed.providerId || !parsed.baseUrl || !parsed.model) return null;
    return {
      providerId: parsed.providerId.trim(),
      baseUrl: parsed.baseUrl.trim(),
      model: parsed.model.trim(),
      ...(typeof parsed.platform === "string" && parsed.platform.trim()
        ? { platform: parsed.platform.trim() }
        : {}),
    };
  } catch {
    return null;
  }
}

/** Drop a preset's stored config (e.g. on Sub2Api logout). */
export function clearAcpConfig(presetId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(configKey(presetId));
  } catch {
    /* non-fatal */
  }
}

/** Build the launch request for a preset, merging any stored gateway config.
 *
 *  With config: inject the key (under the group's keychain id, via both
 *  ANTHROPIC_API_KEY and ANTHROPIC_AUTH_TOKEN so either the x-api-key or the
 *  Bearer auth path the gateway uses is satisfied) plus the base URL and model.
 *  Without config: return the preset unchanged so the agent uses its own login
 *  — a model-agnostic host must still launch for users with no Sub2Api account.
 */
export function buildAcpLaunchRequest(
  preset: AcpPreset,
  conversationId: string | undefined,
  projectRoot: string,
): AcpLaunchRequest {
  const config = loadAcpConfig(preset.id);
  if (!config) {
    throw new Error(`${preset.label} requires a complete AI gateway configuration`);
  }
  return { profileId: preset.id, conversationId, projectRoot, gateway: config };
}
