// Route a turn with image attachments through a vision-capable model.
//
// Background: the app's default model is kimi-k3 (domestic, cheap, fast — but
// text-only). Sending an image to a non-vision model wastes the turn: the
// gateway strips the file part or the model replies "I don't support image
// input". The user's intent when they attach a picture is "look at this", not
// "let me manually swap models first" — so we do the swap for them, one turn
// at a time, and leave the user's default alone.
//
// The predicate is a name-based heuristic (there is no reliable capability
// flag on the /config/providers payload). It covers the vision-capable families
// the app can reach today (GPT-4o/5.x, Claude 3+/4/5, Gemini 1.5+, Qwen-VL,
// GLM-4V, InternVL). If nothing in the catalog matches, we don't swap — the
// original model handles the turn and the user sees the model's own refusal
// rather than a silent redirect.

import type { ProviderInfo } from "@zerowall/sdk";
import type { PromptAttachment } from "@zerowall/sdk";

const RASTER_MIMES = new Set(["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"]);

export function attachmentsHaveImage(attachments?: PromptAttachment[]): boolean {
  if (!attachments) return false;
  return attachments.some((a) => RASTER_MIMES.has(a.mime.toLowerCase()));
}

// Substrings on the model id/name that mark a vision-capable family. Kept
// broad on purpose — a false positive still lands on a real model, whereas a
// missed match sends the user's photo to a text-only model.
const VISION_PATTERNS: RegExp[] = [
  /gpt-4o/i,
  /gpt-4\.1/i,
  /gpt-4-turbo/i,
  /gpt-4v/i,
  /gpt-5/i, // gpt-5.x family
  /o1(?!-mini)/i, // o1 / o1-preview see images; o1-mini does not
  /claude-3/i,
  /claude-4/i,
  /claude-5/i,
  /claude-sonnet/i,
  /claude-opus/i,
  /claude-haiku/i,
  /gemini-1\.5/i,
  /gemini-2/i,
  /qwen.*vl/i,
  /qwen2.*vl/i,
  /glm-4v/i,
  /internvl/i,
  /llava/i,
  /pixtral/i,
];

export function isVisionModel(providerName: string, modelId: string, modelName: string): boolean {
  const haystack = `${providerName} ${modelId} ${modelName}`;
  return VISION_PATTERNS.some((rx) => rx.test(haystack));
}

/** Pick a vision-capable model from the catalog when `current` (a full
 *  "provider/model" key) is not one. Returns the full key of the replacement,
 *  or null when no vision model is configured. When the current model IS
 *  vision-capable, returns null (no swap needed). */
export function pickVisionModel(
  providers: ProviderInfo[],
  current: string | null,
): string | null {
  if (providers.length === 0) return null;
  // If the current model is already vision-capable, don't swap.
  if (current) {
    const [pid, ...rest] = current.split("/");
    const mid = rest.join("/");
    const prov = providers.find((p) => p.id === pid);
    const model = prov?.models.find((m) => m.id === mid);
    if (prov && model && isVisionModel(prov.name ?? prov.id, model.id, model.name ?? model.id)) {
      return null;
    }
  }
  // Prefer models on the SAME provider first (avoids cross-provider auth
  // surprises), otherwise scan the whole catalog. Stable order → prefer the
  // first match in the catalog so behavior is deterministic across launches.
  const currentProviderId = current?.split("/")[0];
  const ordered = currentProviderId
    ? [
        ...providers.filter((p) => p.id === currentProviderId),
        ...providers.filter((p) => p.id !== currentProviderId),
      ]
    : providers;
  for (const p of ordered) {
    for (const m of p.models) {
      if (isVisionModel(p.name ?? p.id, m.id, m.name ?? m.id)) {
        return `${p.id}/${m.id}`;
      }
    }
  }
  return null;
}
