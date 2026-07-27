import type { FindingLevel, MethodContext, MethodContextBlock, ReviewFinding } from "@zerowall/shared";
import { isTauri } from "./tauri";
import { isGatewayWeb } from "./webMode";

// MethodChoiceVerifier bridge — the front-end side of RV-Loop's method-fit check.
//
// The verdict is computed by the deterministic Rust core
// (`src-tauri/src/method_check.rs`), never by a model: given a structured
// description of one analysis, it returns findings that map straight onto the
// reviewer vocabulary. kimi-k3's role is upstream — extracting this context from
// a free-text plan/report — and downstream, explaining each verdict in prose.
//
// The science DB and the Rust engine both live on the desktop, so this is
// desktop-only: `checkMethod` returns null in the gateway web client rather than
// offering a control that can't run there.

const FENCE = /```method\s*\n([\s\S]*?)\n```/;

/** One method-fit verdict returned by the Rust engine. */
export interface MethodFinding {
  level: FindingLevel;
  /** Stable id of the rule that fired, e.g. "paired_design_independent_test". */
  rule: string;
  title: string;
  evidence: string;
}

/** True when the method check can run at all (desktop only). */
export const canCheckMethod = isTauri && !isGatewayWeb;

/**
 * Map an engine finding onto a reviewer finding. Pure and total, so it is unit
 * tested without Tauri. `check` is fixed to `method_choice` so the card labels
 * it and the persisted `verification_checks.check_kind` matches the plan.
 */
export function toReviewFinding(f: MethodFinding): ReviewFinding {
  return {
    level: f.level,
    title: f.title,
    evidence: f.evidence || undefined,
    check: "method_choice",
  };
}

/**
 * Evaluate a method context against the deterministic rules and return reviewer
 * findings. Returns null off-desktop (no Rust engine, no science DB).
 */
export async function checkMethod(context: MethodContext): Promise<ReviewFinding[] | null> {
  if (!canCheckMethod) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  const findings = await invoke<MethodFinding[]>("method_check_evaluate", { context });
  return findings.map(toReviewFinding);
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const bool = (v: unknown): boolean | undefined => (typeof v === "boolean" ? v : undefined);

/** Pull only the known fields off a candidate object — junk keys are dropped so
 *  what reaches the engine is exactly the typed context. */
function coerceContext(raw: Record<string, unknown>): MethodContext {
  return {
    design: str(raw.design),
    outcomeType: str(raw.outcomeType),
    groups: num(raw.groups),
    sampleSize: num(raw.sampleSize),
    normality: str(raw.normality),
    testUsed: str(raw.testUsed),
    nComparisons: num(raw.nComparisons),
    correctionApplied: bool(raw.correctionApplied),
  };
}

/**
 * Extract the ```method fenced JSON block kimi-k3 emits — the extracted method
 * context, evaluated later by the deterministic engine. Accepts either a nested
 * `{ "context": {...}, "note": "..." }` or the context fields at top level.
 * Returns the markdown with the fence removed plus the parsed block, or
 * method: null when absent/malformed (the text is left as-is).
 */
export function splitMethodContext(markdown: string): {
  clean: string;
  method: MethodContextBlock | null;
} {
  const m = FENCE.exec(markdown);
  if (!m) return { clean: markdown, method: null };
  let method: MethodContextBlock | null = null;
  try {
    const parsed = JSON.parse(m[1]) as Record<string, unknown>;
    const rawContext =
      parsed.context && typeof parsed.context === "object"
        ? (parsed.context as Record<string, unknown>)
        : parsed;
    method = {
      kind: "method-context",
      context: coerceContext(rawContext),
      note: str(parsed.note),
    };
  } catch {
    return { clean: markdown, method: null }; // malformed JSON: leave the text as-is
  }
  const clean = markdown.replace(FENCE, "").trim();
  return { clean, method };
}
