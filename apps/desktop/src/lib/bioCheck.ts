import type { BioClaim, BioClaimsBlock, FindingLevel, ReviewFinding } from "@zerowall/shared";
import { isTauri } from "./tauri";
import { isGatewayWeb } from "./webMode";

// BioPlausibilityVerifier bridge — the front-end side of RV-Loop's
// "re-check against live sources" leg.
//
// The verdict is computed by the deterministic Rust core
// (`src-tauri/src/bio_check.rs`), which resolves each claimed biological entity
// or relation against a live, license-clear registry (UniProt / QuickGO /
// Reactome). kimi-k3's role is upstream — extracting the claims from a free-text
// report — and downstream, explaining each verdict; it does not decide the
// verdict. This is the check Claude Science's Reviewer explicitly declines.
//
// Desktop-only: the science DB and the network client live on the desktop, so
// `checkBio` returns null in the gateway web client rather than offering a
// control that can't run there.

const FENCE = /```bio\s*\n([\s\S]*?)\n```/;

/** One plausibility verdict returned by the Rust engine. */
export interface BioFinding {
  level: FindingLevel;
  /** Stable id of the rule that fired, e.g. "bio_entity_not_found". */
  rule: string;
  title: string;
  evidence: string;
}

/** True when the bio check can run at all (desktop only). */
export const canCheckBio = isTauri && !isGatewayWeb;

/**
 * Map an engine finding onto a reviewer finding. Pure and total, so it is unit
 * tested without Tauri. `check` is fixed to `bio_plausibility` so the card
 * labels it and the persisted `verification_checks.check_kind` matches the plan.
 */
export function toReviewFinding(f: BioFinding): ReviewFinding {
  return {
    level: f.level,
    title: f.title,
    evidence: f.evidence || undefined,
    check: "bio_plausibility",
  };
}

/**
 * Re-check biological claims against live sources and return reviewer findings.
 * Returns null off-desktop (no Rust engine, no network client, no science DB).
 */
export async function checkBio(claims: BioClaim[]): Promise<ReviewFinding[] | null> {
  if (!canCheckBio) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  const findings = await invoke<BioFinding[]>("bio_check_evaluate", { claims });
  return findings.map(toReviewFinding);
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** Pull only the known fields off a candidate claim — junk keys are dropped and
 *  `kind` is required (a claim with no kind is not a claim the engine checks). */
function coerceClaim(raw: Record<string, unknown>): BioClaim | null {
  const kind = str(raw.kind);
  if (!kind) return null;
  const claim: BioClaim = { kind };
  const symbol = str(raw.symbol);
  if (symbol) claim.symbol = symbol;
  const organismId = num(raw.organismId);
  if (organismId !== undefined) claim.organismId = organismId;
  const goId = str(raw.goId);
  if (goId) claim.goId = goId;
  const term = str(raw.term);
  if (term) claim.term = term;
  const pathway = str(raw.pathway);
  if (pathway) claim.pathway = pathway;
  const source = str(raw.source);
  if (source) claim.source = source;
  const statement = str(raw.statement);
  if (statement) claim.statement = statement;
  return claim;
}

/**
 * Extract the ```bio fenced JSON block kimi-k3 emits — the biological claims to
 * be re-checked by the deterministic engine. Accepts either a nested
 * `{ "claims": [...], "note": "..." }` or a bare array of claims. Returns the
 * markdown with the fence removed plus the parsed block, or bio: null when
 * absent/malformed or when no valid claim survives coercion.
 */
export function splitBioClaims(markdown: string): { clean: string; bio: BioClaimsBlock | null } {
  const m = FENCE.exec(markdown);
  if (!m) return { clean: markdown, bio: null };
  let bio: BioClaimsBlock | null = null;
  try {
    const parsed = JSON.parse(m[1]) as unknown;
    const rawClaims = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>).claims)
        ? ((parsed as Record<string, unknown>).claims as unknown[])
        : [];
    const claims = rawClaims
      .filter((c): c is Record<string, unknown> => Boolean(c) && typeof c === "object")
      .map(coerceClaim)
      .filter((c): c is BioClaim => c !== null);
    if (claims.length === 0) return { clean: markdown, bio: null };
    const note = !Array.isArray(parsed) && parsed && typeof parsed === "object"
      ? str((parsed as Record<string, unknown>).note)
      : undefined;
    bio = { kind: "bio-claims", claims, note };
  } catch {
    return { clean: markdown, bio: null }; // malformed JSON: leave the text as-is
  }
  const clean = markdown.replace(FENCE, "").trim();
  return { clean, bio };
}
