/**
 * A viewport width tests can control.
 *
 * jsdom does no layout, so its `window.matchMedia` answers `false` to every
 * query. That pins every test to the desktop branch and makes the phone-width
 * paths — `useIsMobile` and everything gated on it (drawer sidebar, single-pane
 * live surface, no split controls) — impossible to reach.
 *
 * `installViewportStub` (called once from `src/test/setup.ts`) replaces
 * `matchMedia` with one that evaluates `(max-width: …)` / `(min-width: …)`
 * against a settable width and notifies subscribers when it changes. The
 * default is a desktop width, so a test that never calls `setViewportWidth`
 * sees exactly the same `false` jsdom gave it.
 */

/** Default width: a desktop window — the "not mobile" answer jsdom gave. */
export const DESKTOP_WIDTH = 1280;

/** Reference phone width (iPhone 12–15, CSS pixels). */
export const PHONE_WIDTH = 390;

let width = DESKTOP_WIDTH;

interface StubList {
  mql: MediaQueryList;
  notify: () => void;
}

/** Query lists with at least one live listener — the ones a width change wakes. */
const subscribed = new Set<StubList>();

/** Answer a media query against the current width. Only the width forms the app
 *  uses are understood; anything else (e.g. `prefers-color-scheme`) stays
 *  `false`, matching jsdom. */
function evaluate(query: string): boolean {
  const max = /\(\s*max-width\s*:\s*(\d+)px\s*\)/.exec(query);
  if (max) return width <= Number(max[1]);
  const min = /\(\s*min-width\s*:\s*(\d+)px\s*\)/.exec(query);
  if (min) return width >= Number(min[1]);
  return false;
}

function makeList(query: string): MediaQueryList {
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  const entry = {} as StubList;
  const mql = {
    media: query,
    get matches() {
      return evaluate(query);
    },
    onchange: null as ((e: MediaQueryListEvent) => void) | null,
    addEventListener(type: string, cb: (e: MediaQueryListEvent) => void) {
      if (type !== "change") return;
      listeners.add(cb);
      subscribed.add(entry);
    },
    removeEventListener(type: string, cb: (e: MediaQueryListEvent) => void) {
      if (type !== "change") return;
      listeners.delete(cb);
      if (listeners.size === 0) subscribed.delete(entry);
    },
    // Deprecated aliases, still used by some libraries.
    addListener(cb: (e: MediaQueryListEvent) => void) {
      mql.addEventListener("change", cb);
    },
    removeListener(cb: (e: MediaQueryListEvent) => void) {
      mql.removeEventListener("change", cb);
    },
    dispatchEvent: () => false,
  } as unknown as MediaQueryList;
  entry.mql = mql;
  entry.notify = () => {
    const event = { matches: mql.matches, media: query } as MediaQueryListEvent;
    mql.onchange?.(event);
    for (const cb of [...listeners]) cb(event);
  };
  return mql;
}

/** Install the stub on `window`. Idempotent; called once from the setup file. */
export function installViewportStub(): void {
  window.matchMedia = ((query: string) => makeList(query)) as typeof window.matchMedia;
}

/**
 * Render the rest of this test at `px` CSS pixels wide, waking any live
 * media-query listener (so a mounted `useIsMobile` re-renders). `setup.ts`
 * restores the desktop default after every test.
 */
export function setViewportWidth(px: number): void {
  if (px === width) return;
  width = px;
  for (const entry of [...subscribed]) entry.notify();
}

/** Back to the desktop default. Runs after every test. */
export function resetViewport(): void {
  setViewportWidth(DESKTOP_WIDTH);
  subscribed.clear();
}
