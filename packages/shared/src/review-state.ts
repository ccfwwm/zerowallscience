/**
 * Persisted review state vocabularies.
 *
 * These are the exact sets the M006 CHECK constraints enforce
 * (apps/desktop/src-tauri/migrations/M006__review.sql). They are `as const`
 * arrays rather than bare unions because a union erases at compile time and
 * could not be compared against the migration — `review-state.test.ts` reads
 * the SQL and asserts set equality, which is what actually stops the schema
 * and the app from drifting apart.
 *
 * Provenance matters here: only `RESOLUTION_ACTIONS` and `VERIFICATION_RESULTS`
 * are named upstream. The other two are derived from their own columns and
 * deliberately kept at the minimum the schema can express.
 */

/**
 * Lifecycle of one reviewer run.
 *
 * `complete` is the only value named upstream — `runtime/agents/reviewer.json`
 * hands control back to OPERON on a `review_complete` trigger. The other three
 * are what `reviewer_runs.started_at` / `finished_at` (both nullable) already
 * distinguish: not started, started, and ended without completing.
 */
export const REVIEWER_RUN_STATUSES = ["pending", "running", "complete", "failed"] as const;
export type ReviewerRunStatus = (typeof REVIEWER_RUN_STATUSES)[number];

/**
 * Whether a claim has been resolved.
 *
 * The reviewer agent rates claims by type and strength, never by status, so no
 * claim status vocabulary is attested. Two states are what the schema itself
 * expresses — a claim either has a `resolutions` row or it does not. Anything
 * finer would be invented.
 */
export const CLAIM_STATUSES = ["open", "resolved"] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

/**
 * Verdict of one verification check.
 *
 * The same closed set the shipping ```review``` block contract uses, so a
 * finding rendered in the chat card and a stored check verdict cannot diverge
 * (`FindingLevel` in ./index.ts is this type). A check that could not run —
 * offline citation lookup, for instance — is a `warn` in that contract, so
 * there is no separate "skipped" state.
 */
export const VERIFICATION_RESULTS = ["ok", "warn", "error"] as const;
export type VerificationResult = (typeof VERIFICATION_RESULTS)[number];

/**
 * How a claim was resolved.
 *
 * Enumerated verbatim by the reviewer agent's system prompt
 * (`runtime/agents/reviewer.json`, step 5 RESOLUTION), which writes them
 * uppercase as prose labels; stored lowercase to match every other state
 * column in this schema.
 */
export const RESOLUTION_ACTIONS = [
  "verified",
  "conditional",
  "inconclusive",
  "refuted",
] as const;
export type ResolutionAction = (typeof RESOLUTION_ACTIONS)[number];
