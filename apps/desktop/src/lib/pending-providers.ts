import type { AcpHostCustomProviderOptions } from "@zerowall/sdk";

const STORAGE_KEY = "zerowall.pendingCustomProviders.v1";

export interface PendingProvider {
  id: string;
  options: AcpHostCustomProviderOptions;
}

function read(): PendingProvider[] {
  if (typeof window === "undefined") return [];
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is PendingProvider => {
      if (!item || typeof item !== "object") return false;
      const entry = item as Record<string, unknown>;
      return typeof entry.id === "string" && !!entry.options && typeof entry.options === "object";
    });
  } catch {
    return [];
  }
}

export function queuePendingProvider(provider: PendingProvider): void {
  if (typeof window === "undefined") return;
  const next = read().filter((item) => item.id !== provider.id);
  next.push(provider);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function pendingProviders(): PendingProvider[] {
  return read();
}

export function removePendingProvider(id: string): void {
  if (typeof window === "undefined") return;
  const next = read().filter((item) => item.id !== id);
  if (next.length === 0) window.localStorage.removeItem(STORAGE_KEY);
  else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}
