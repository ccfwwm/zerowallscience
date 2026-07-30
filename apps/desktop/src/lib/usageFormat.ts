// Pure formatting for the token/cost surfaces (per-reply tail, status bar,
// Usage settings). Kept framework-free so it can be unit-tested and reused
// across the three display sites. Number grouping is locale-aware via Intl;
// cost is fixed to 4 decimals (sub-cent token prices), and a null/undefined
// cost renders as "—" — never a fabricated "$0" (see AGENTS.md: fail honestly).

/** Group an integer with the active locale's thousands separator. */
export function formatCount(n: number, locale?: string): string {
  return new Intl.NumberFormat(locale).format(Math.max(0, Math.round(n)));
}

/** USD cost to 4 decimals ("$0.0021"), or "—" when unpriced (null/undefined).
 *  A real $0.00 (a priced-but-free reply) still shows "$0.0000" — distinct from
 *  unpriced, which the schema and this formatter keep apart. */
export function formatCost(cost: number | null | undefined): string {
  if (cost === null || cost === undefined) return "—";
  return `$${cost.toFixed(4)}`;
}

/** Context-window fill as a whole-number percent, or null when the window is
 *  unknown (0/absent) — the caller then drops the ctx segment entirely rather
 *  than dividing by a guessed ceiling. Clamped to [0, 100]. */
export function contextPercent(input: number, window: number | undefined): number | null {
  if (!window || window <= 0) return null;
  return Math.min(100, Math.max(0, Math.round((input / window) * 100)));
}
