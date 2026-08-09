// Pure Sub2Api provisioning helpers, shared by the settings card (interactive
// path) and the runtime store's headless auto-provision on startup. Kept free of
// React and of any import from runtime.ts so runtime.ts can import it without a
// cycle (Sub2ApiCard.tsx already imports from runtime.ts).
import type { AcpAgentConfig } from "./acp-config";
import type { Sub2ApiProvisionedGroup } from "./tauri";

/** Namespace every gateway-provisioned provider lives under. A neutral brand
 *  prefix keeps the assistant's identity clean; a per-group suffix keeps one
 *  group's key from overwriting another. */
export const PROVIDER_NAMESPACE = "zerowall";

/** Substrings that mark a model as one of the domestic families this app leads
 *  with. Used only for ordering and a badge — nothing is hidden. */
const DOMESTIC = [
  "kimi", "moonshot", "deepseek", "glm", "zhipu", "qwen", "qwq", "ernie",
  "hunyuan", "minimax", "step", "baichuan", "yi-",
];

export function isDomesticModel(id: string): boolean {
  const lower = id.toLowerCase();
  return DOMESTIC.some((needle) => lower.includes(needle));
}

/** Return every group the service exposes. The service owns visibility and the
 * desktop client must not silently hide model channels from the user. A group
 * can opt out explicitly with `visible`, `available`, or `enabled: false`;
 * older responses without those fields remain visible for backwards
 * compatibility. */
export function openGroups<
  T extends { name: string; visible?: boolean; available?: boolean; enabled?: boolean },
>(groups: T[]): T[] {
  return groups.filter(
    (group) => group.visible !== false && group.available !== false && group.enabled !== false,
  );
}

/** Domestic models first, then everything else, alphabetical within each group. */
export function orderModels(models: string[]): string[] {
  return [...new Set(models)].sort((a, b) => {
    const da = isDomesticModel(a);
    const db = isDomesticModel(b);
    if (da !== db) return da ? -1 : 1;
    return a.localeCompare(b);
  });
}

/** The model the app defaults to after provisioning. Leads with Kimi. */
const DEFAULT_MODEL_PREFERENCE = ["kimi-k3", "kimi"];

export function pickDefaultModel(models: string[]): string | undefined {
  for (const pref of DEFAULT_MODEL_PREFERENCE) {
    const hit = models.find((m) => m.toLowerCase().includes(pref));
    if (hit) return hit;
  }
  return models.find(isDomesticModel) ?? models[0];
}

/** Provider id a group's key is stored under. `zerowall-<groupId>`: one uniform
 *  rule, no bare special case. `_primaryGroupId` is kept for call-site
 *  compatibility — it no longer affects the mapping. */
export function providerIdForGroup(groupId: number, _primaryGroupId: number): string {
  void _primaryGroupId;
  return `${PROVIDER_NAMESPACE}-${groupId}`;
}

/** Upstream API protocol the provider speaks. The openai-compatible adapter
 *  calls `/v1/chat/completions`, the openai adapter calls `/v1/responses`. Chat
 *  Completions is the default — the gateway only carries image parts there. */
export type Protocol = "chat" | "responses";

export const PROTOCOL_KEY = "sub2api.protocol";

/** The chosen protocol, from localStorage; defaults to chat. Shared so the
 *  headless bootstrap registers providers with the same adapter the card would. */
export function loadProtocol(): Protocol {
  try {
    return localStorage.getItem(PROTOCOL_KEY) === "responses" ? "responses" : "chat";
  } catch {
    return "chat";
  }
}

/** The AI-SDK adapter that speaks the chosen protocol. */
export function npmForProtocol(p: Protocol): string {
  return p === "responses" ? "@ai-sdk/openai" : "@ai-sdk/openai-compatible";
}

// ---- ACP-config classification (Sub2Api auto-injection) --------------------

/** Names/models that mark a Claude (Anthropic-protocol) group vs a GPT/Codex
 *  (OpenAI-protocol) one. The gateway routes any key to either protocol, so the
 *  only thing that must match is the MODEL: Claude Code needs a claude model,
 *  Codex needs a gpt model. */
function isClaudeModel(id: string): boolean {
  return /claude/i.test(id);
}
function isGptModel(id: string): boolean {
  return /gpt|o1|o3|o4|codex/i.test(id);
}

export interface ProvisionedGroupNamed extends Sub2ApiProvisionedGroup {
  /** The group's display name, for classifying claude vs gpt channels. */
  name: string;
}

/** From the provisioned groups, derive the ACP launch config for Claude Code and
 *  Codex: pick the group whose name or models best fit each protocol, and pin a
 *  concrete model of the right family. Either may be absent when the account has
 *  no matching channel. */
export function deriveAcpConfigs(provisioned: ProvisionedGroupNamed[]): {
  claudeCode?: AcpAgentConfig;
  codex?: AcpAgentConfig;
} {
  const out: { claudeCode?: AcpAgentConfig; codex?: AcpAgentConfig } = {};

  // Claude Code: prefer a group named claude/science, else any group that
  // actually serves a claude model. Pin the first claude model it lists.
  const claudeGroup =
    provisioned.find((g) => /claude|science/i.test(g.name) && g.models.some(isClaudeModel)) ??
    provisioned.find((g) => g.models.some(isClaudeModel));
  if (claudeGroup) {
    const model = claudeGroup.models.find(isClaudeModel);
    if (model) {
      out.claudeCode = { providerId: claudeGroup.providerId, baseUrl: claudeGroup.baseUrl, model };
    }
  }

  // Codex: prefer a GPT-named group serving a gpt/codex model, else any group
  // that serves one. Pin the first such model.
  const gptGroup =
    provisioned.find((g) => /gpt/i.test(g.name) && g.models.some(isGptModel)) ??
    provisioned.find((g) => g.models.some(isGptModel));
  if (gptGroup) {
    const model = gptGroup.models.find(isGptModel);
    if (model) {
      out.codex = { providerId: gptGroup.providerId, baseUrl: gptGroup.baseUrl, model };
    }
  }

  return out;
}
