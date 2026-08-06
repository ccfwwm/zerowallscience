import {
  VERIFICATION_RESULTS,
  type ClaimStatus,
  type FindingLevel,
  type ResolutionAction,
  type ReviewCheck,
  type ReviewFinding,
  type ReviewerBlock,
  type ReviewMetadata,
  type ThreadBlock,
} from "@zerowall/shared";
import { isTauri } from "./tauri";
import { isGatewayWeb } from "./webMode";

const FENCE = /```review\s*\n([\s\S]*?)\n```/;
// Reuse the persisted vocabulary rather than a second copy of the literals.
const LEVELS: readonly string[] = VERIFICATION_RESULTS;
const CHECKS: ReviewCheck[] = [
  "citation",
  "number",
  "figure",
  "domain",
  "integrity",
  "method_choice",
  "reasoning_trace",
  "bio_plausibility",
];

const REVIEWABLE_BLOCKS = new Set<ThreadBlock["kind"]>([
  "agent",
  "reasoning",
  "tool-call",
  "reviewer",
  "method-context",
  "bio-claims",
  "table",
  "figure",
  "artifact",
  "usage",
]);

/** Serialize only inspectable work product. User prompts and interaction/status
 * controls are context, not evidence, and never enter an isolated review. */
export function reviewableThreadOutput(blocks: ThreadBlock[]): string {
  return JSON.stringify(blocks.filter((block) => REVIEWABLE_BLOCKS.has(block.kind)), null, 2);
}

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
        artifactPath?: string;
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
        artifactPath: f.artifactPath ? String(f.artifactPath) : undefined,
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

// ---- review prompts (Claude-Code style /review) ----------------------------
// The active-review and auto-fix triggers reuse the ordinary sendPrompt path:
// no new pipeline. The agent audits (or fixes) with these instructions and
// emits its verdict as the same ```review fenced JSON that splitReview parses.

/**
 * Instruction for the current agent to audit this session's research output and
 * report findings as a ```review fenced JSON block. The fields it asks for match
 * `splitReview` exactly, so the emitted block renders as a ReviewerCard and
 * persists through review_sync unchanged. Read-only: the agent must not edit
 * files during a review.
 */
export function buildReviewPrompt(): string {
  return [
    "Perform a rigorous self-review of the scientific work produced in this",
    "session so far — claims, methods, statistics, code, figures, and results.",
    "This is a READ-ONLY audit: inspect the artifacts and reasoning, but do NOT",
    "edit any files or re-run anything as part of this review.",
    "",
    "For each issue you find, judge its severity as one of:",
    '  - "ok"    — verified correct / no concern',
    '  - "warn"  — questionable, needs attention or a caveat',
    '  - "error" — likely wrong, unsupported, or reproducibility-breaking',
    "",
    "Report every finding in a single fenced code block tagged `review`,",
    "containing JSON of this exact shape:",
    "",
    "```review",
    "{",
    '  "findings": [',
    "    {",
    '      "level": "ok" | "warn" | "error",',
    '      "title": "<one-line statement of the finding>",',
    '      "evidence": "<optional: file:line, numbers, or quoted text>",',
    '      "check": "<optional: citation|number|figure|domain|integrity|method_choice|reasoning_trace|bio_plausibility>",',
    '      "tag": "<optional: freeform label, e.g. \\"stats · prereg\\">",',
    '      "artifactPath": "<optional: workspace-relative path this finding is about>"',
    "    }",
    "  ],",
    '  "note": "<optional: overall summary>"',
    "}",
    "```",
    "",
    "If a method or biological claim warrants a deterministic check, you may also",
    "emit a `method` or `bio` block alongside the `review` block. Be specific and",
    "cite concrete evidence; do not invent findings when the work is sound.",
  ].join("\n");
}

/**
 * Instruction for the current agent to fix one specific finding. Unlike the
 * review prompt this is NOT read-only: the agent edits files / re-runs work to
 * address the issue — through the normal approval flow, never bypassing it.
 */
export function buildAutoFixPrompt(finding: ReviewFinding): string {
  const lines = [
    "Fix the following review finding, and only this finding:",
    "",
    `- Severity: ${finding.level}`,
    `- Finding: ${finding.title}`,
  ];
  if (finding.artifactPath) lines.push(`- Artifact: ${finding.artifactPath}`);
  if (finding.tag) lines.push(`- Tag: ${finding.tag}`);
  if (finding.check) lines.push(`- Check: ${finding.check}`);
  if (finding.evidence) lines.push("- Evidence:", "", "```", finding.evidence, "```");
  lines.push(
    "",
    "Make the smallest correct change that resolves it. Edit files or re-run work",
    "as needed, going through the normal approval flow. When done, briefly state",
    "what you changed so the finding can be marked resolved.",
  );
  return lines.join("\n");
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
  metadata?: ReviewMetadata,
): Promise<StoredReview | null> {
  if (!canPersistReview) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<StoredReview>("review_sync", {
    sessionId,
    findings: block.findings,
    note: block.note ?? null,
    metadata: metadata ?? block.metadata ?? null,
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

// ---- aggregate review browsing (review_list) --------------------------------

/** One persisted finding enriched with the block content needed to render it
 *  outside the live thread (the aggregate panel has no ReviewerBlock in hand). */
export interface StoredReviewFinding extends StoredFinding {
  level: FindingLevel;
  title: string;
  evidence: string | null;
  checkKind: string | null;
}

/** A persisted reviewer run with its findings, for the aggregate panel. */
export interface StoredReviewRun {
  runId: string;
  createdAt: string;
  findings: StoredReviewFinding[];
}

/** All reviewer runs for a session, newest first. Null off-desktop. */
export async function listReviews(sessionId: string): Promise<StoredReviewRun[] | null> {
  if (!canPersistReview) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<StoredReviewRun[]>("review_list", { sessionId });
}
