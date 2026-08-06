import type { ProviderInfo } from "@zerowall/sdk";

export interface ModelOption {
  key: string;
  providerID: string;
  providerName: string;
  modelID: string;
  modelName: string;
}

export type ModelFilter =
  | { kind: "all" }
  | { kind: "favorites" }
  | { kind: "recent" }
  | { kind: "provider"; providerID: string };

/**
 * Provider ids in the ZeroWall namespace are application-managed group
 * entries. Older installs persisted a gateway product name in `name`, which
 * is rendered in filters and under each model. Keep that implementation detail
 * out of the UI while leaving user-owned provider names untouched.
 */
export function displayProviderName(provider: ProviderInfo): string {
  if (!provider.id.startsWith("zerowall-")) return provider.name;
  const name = provider.name
    .replace(/^sub2api(?:\s*[·.:/-]\s*)?/i, "")
    .trim();
  return name || "AI 云平台";
}

export function flattenModelOptions(providers: ProviderInfo[]): ModelOption[] {
  return providers.flatMap((provider) =>
    provider.models.map((model) => ({
      key: `${provider.id}/${model.id}`,
      providerID: provider.id,
      providerName: displayProviderName(provider),
      modelID: model.id,
      modelName: model.name,
    })),
  );
}

/**
 * Where the configured default model should land after a provider change made
 * it dangling (provider removed, or its models renamed): null when the default
 * is still available — or nothing is available to fall back to — otherwise the
 * closest valid "provider/model" key: the same provider's first model when the
 * provider survived, else the first model of the first provider.
 */
export function fallbackDefaultModel(providers: ProviderInfo[], defaultModel: string): string | null {
  const options = flattenModelOptions(providers);
  if (options.length === 0 || options.some((m) => m.key === defaultModel)) return null;
  const providerID = defaultModel.split("/")[0];
  return (options.find((m) => m.providerID === providerID) ?? options[0]).key;
}

function baseOptions(
  options: ModelOption[],
  filter: ModelFilter,
  favorites: string[],
  recent: string[],
): ModelOption[] {
  if (filter.kind === "provider") return options.filter((m) => m.providerID === filter.providerID);
  if (filter.kind === "favorites") {
    const favoriteSet = new Set(favorites);
    return options.filter((m) => favoriteSet.has(m.key));
  }
  if (filter.kind === "recent") {
    const byKey = new Map(options.map((model) => [model.key, model]));
    return recent.flatMap((key) => {
      const model = byKey.get(key);
      return model ? [model] : [];
    });
  }
  return options;
}

export function filterModelOptions(
  options: ModelOption[],
  filter: ModelFilter,
  query: string,
  favorites: string[],
  recent: string[],
): ModelOption[] {
  const normalized = query.trim().toLocaleLowerCase();
  const candidates = baseOptions(options, filter, favorites, recent);
  if (!normalized) return candidates;
  return candidates.filter((model) =>
    [model.modelName, model.modelID, model.providerName, model.providerID]
      .join(" ")
      .toLocaleLowerCase()
      .includes(normalized),
  );
}
