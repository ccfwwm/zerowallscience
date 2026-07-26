import {
  VERIFICATION_RESULTS,
  type ClaimStatus,
  type FindingLevel,
  type ResolutionAction,
  type ReviewCheck,
  type ReviewerBlock,
} from "@zerowall/shared";
import { isTauri } from "./tauri";
import { isGatewayWeb } from "./webMode";

const FENCE = /```review\s*\n([\s\S]*?)\n```/;
// Reuse the persisted vocabulary rather than a second copy of the literals.
const LEVELS: readonly string[] = VERIFICATION_RESULTS;
const CHECKS: ReviewCheck[] = ["citation", "number", "figure", "domain", "integrity"];

/**
 * Extract a structured reviewer result the agent was asked to emit as a
 * ```review fenced JSON block. Returns the markdown without the fence plus
 * the parsed block, or review: null when absent/malformed.
 */
export function splitReview(markdown: string): { clean: string; review: ReviewerBlock | null } {
  const m = FENCE.exec(markdown);
  if (!m) return { clean: markdown, review: null };
  let review: ReviewerBlock | null = null;
  try {
    const parsed = JSON.parse(m[1]) as {
      findings?: Array<{
        level?: string;
        title?: string;
        evidence?: string;
        check?: string;
        tag?: string;
      }>;
      note?: string;
    };
    const findings = (parsed.findings ?? [])
      .filter((f) => f.title)
      .map((f) => ({
        level: LEVELS.includes(f.level ?? "") ? (f.level as FindingLevel) : "warn",
        title: String(f.title),
        evidence: f.evidence ? String(f.evidence) : undefined,
        check: (CHECKS as string[]).includes(f.check ?? "") ? (f.check as ReviewCheck) : undefined,
        tag: f.tag ? String(f.tag) : undefined,
      }));
    if (findings.length > 0 || parsed.note) {
      review = { kind: "reviewer", findings, note: parsed.note };
    }
  } catch {
    return { clean: markdown, review: null }; // malformed JSON: leave the text as-is
  }
  const clean = review ? markdown.replace(FENCE, "").trim() : markdown;
  return { clean, review };
}

// ---- persisted review state (M006, via src-tauri/src/review_store.rs) -------
// The science database lives inside the workspace folder, so only the desktop
// app can reach it: the gateway web client is a browser talking over HTTP and
// has no such path. Every call below returns null off-desktop, and the card
// hides its controls rather than offering one that fails.

/** One persisted finding: its claim row, current state, and last resolution. */
export interface StoredFinding {
  claimId: string;
  status: ClaimStatus;
  /** Action of the newest resolution, or null when never resolved. Survives a
   *  reopen, so the card can still show what the last verdict was. */
  resolution: ResolutionAction | null;
  resolvedAt: string | null;
}

/** A persisted reviewer run: `findings` is positional against the block's own
 *  findings, in the same order they were sent. */
export interface StoredReview {
  runId: string;
  findings: StoredFinding[];
}

/** True when review state can be persisted at all (desktop only). */
export const canPersistReview = isTauri && !isGatewayWeb;

/**
 * Persist a reviewer block for a session and read its state back. Idempotent
 * per block: re-sending the same findings finds the run already stored instead
 * of duplicating it, so a card remount is free. Returns null off-desktop.
 */
export async function syncReview(
  sessionId: string,
  block: ReviewerBlock,
): Promise<StoredReview | null> {
  if (!canPersistReview) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<StoredReview>("review_sync", {
    sessionId,
    findings: block.findings,
    note: block.note ?? null,
  });
}

/** Resolve a claim; returns the whole run's new state. Null off-desktop. */
export async function resolveClaim(
  claimId: string,
  action: ResolutionAction,
  note?: string,
): Promise<StoredReview | null> {
  if (!canPersistReview) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<StoredReview>("review_resolve", { claimId, action, note: note ?? null });
}

/** Reopen a resolved claim. The resolution history is kept — see
 *  `review_store::reopen_claim`. Null off-desktop. */
export async function reopenClaim(claimId: string): Promise<StoredReview | null> {
  if (!canPersistReview) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<StoredReview>("review_reopen", { claimId });
}
