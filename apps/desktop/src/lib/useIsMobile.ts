import { useSyncExternalStore } from "react";

// A viewport is "mobile" below this width (phones / narrow LAN-web windows).
// The desktop shell (fixed sidebar that shares horizontal space) is unusable
// there, so mobile turns the sidebar into an overlay drawer.
const MOBILE_QUERY = "(max-width: 768px)";

function subscribe(cb: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mql = window.matchMedia(MOBILE_QUERY);
  mql.addEventListener("change", cb);
  return () => mql.removeEventListener("change", cb);
}

function getSnapshot(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(MOBILE_QUERY).matches;
}

/** True on phone-width viewports. SSR/test-safe (returns false). */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
