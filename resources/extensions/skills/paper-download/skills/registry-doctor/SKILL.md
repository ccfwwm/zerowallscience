---
name: registry-doctor
description: >
  Audit the bibliography registry for consistency via 19 mechanical
  invariants (I1-I19) covering state validity, slug uniqueness, UID
  format, PDF path normalization, file presence on disk, sha256 integrity,
  page-1 validation log coherence, state history monotonicity, attempt
  numbering, blocked-reason presence, citation reciprocity with SOTAs,
  PDF duplicates, terminal state escapes, RTFM OCR overdue. Trigger this
  skill whenever the user wants to audit the registry, fix obvious drift,
  check invariants, or run a coherence sweep. Use for `/paper-trail:doctor`,
  `/paper-trail:doctor --fix`, `/paper-trail:doctor --correlate-rtfm`.
  Triggers : "audit registre", "doctor", "vérifier invariants", "fix drift",
  "check le registre", "audit registry", "run doctor", "auto-fix invariants",
  "rapport invariants".
---

# Skill : registry-doctor

## Purpose

Wraps the paper-trail worker B's invariant doctor. Runs all 19 checks
(I1-I19) on the registry, reports violations classified by severity
(ERROR / WARN / INFO), and offers auto-fix for safe cases.

The doctor is **read-only by default**. Auto-fixes (`--fix`) only apply
to invariants whose semantic is mechanically safe : I4 (path prefix
strip), I6 (sha256 recompute), I9 (attempt renumber), I5/I7 semi
(state → `needs_reacquisition` when PDF missing or page1 log broken).

Never decides anything semantic — that's `sota-auditor`.

## When to invoke

- User asks to audit the registry, run doctor, fix drift
- User runs `/paper-trail:doctor` or `/paper-trail:doctor --fix`
- Hooks trigger it post-edit on a ref or at session end (cf.
  `hooks/hooks.json`)
- `sota-writer` validates that all proposed refs are coherent before
  using them in a SOTA

## How it works

The skill delegates to the worker B Python CLI:

```bash
# Run all 19 invariants, severity ≥ info, no fix
python -m pipeline doctor

# Filter to errors only
python -m pipeline doctor --severity error

# Auto-fix safe invariants (I4, I6, I9, I5 semi, I7 semi)
python -m pipeline doctor --fix --severity warn

# JSON output for machine processing
python -m pipeline doctor --json

# Couche 5 — correlate with RTFM indexing failures
python -m pipeline doctor --correlate-rtfm

# Couche 5 (slow) — recompute sha256 on all PDFs to detect drift
python -m pipeline doctor --check-sha
```

## Invariants reference

| Inv | Severity | Description | Auto-fix |
|---|---|---|---|
| I1 | ERROR | `state` is a valid FSM state | no |
| I2 | ERROR | `slug` is unique across the registry | no |
| I3 | ERROR | `uid` has a valid prefix (doi:, arxiv:, isbn:, etc.) | no |
| I4 | WARN | `pdf_path` is properly relative (no `10_SOURCES/` prefix) | **yes** |
| I5 | ERROR | If state implies PDF, file exists on disk | semi (→ needs_reacquisition) |
| I6 | ERROR | `pdf_sha256` is 64 hex chars (recompute if missing) | **yes** |
| I7 | ERROR | If `page1_validated`, the log is consistent | semi (→ needs_reacquisition) |
| I8 | ERROR | `state_history` is monotonic in `at` timestamps | no |
| I9 | WARN | `acquisition_attempts[].n` is strictly 1..N (no gap) | **yes** |
| I10 | ERROR | If `blocked_human:*`, `blocked_reason` is non-empty | no |
| I11 | WARN | Each `cited_in[].name` exists in vault | no |
| I12 | WARN | Each SOTA citation `[[slug]]` is declared in `cited_in` | no |
| I13 | WARN | `pdf_sha256` is unique (no duplicates) | no |
| I14 | ERROR | No transition out of `sota_cited_confirmed` or `retracted` | no |
| I15 | INFO | `awaiting_rtfm_ocr` not older than 30 days | no |
| I16 | WARN/ERROR | RTFM failure mirrored (Couche 5, opt-in via `--correlate-rtfm`) | no |
| I17 | ERROR | PDF format defective (Couche 5, opt-in) | no |
| I18 | ERROR | sha256 drift between YAML and disk (Couche 5, opt-in `--check-sha`) | no |
| I19 | INFO | PDF image-only without alternative text source tested (Couche 5) | no |

## Output format

Markdown report by default :

```
# Pipeline doctor — YYYY-MM-DD

## ERROR (N)
- I5 ref_slug : pdf_path inexistant sur disque
- ...

## WARN (N)
- I4 ref_slug : pdf_path préfixé "10_SOURCES/" (auto-fixable)
- ...

## INFO (N)
- I15 ref_slug : awaiting_rtfm_ocr depuis 47 jours, last check il y a 12j
- ...

Récap : N ERROR / N WARN / N INFO — N auto-fixable(s) avec --fix
```

JSON format with `--json` :

```json
{
  "violations": [
    {"invariant": "I5", "ref_slug": "...", "severity": "ERROR",
     "message": "...", "auto_fixable": false},
    ...
  ],
  "summary": {"error": N, "warn": N, "info": N, "auto_fixable": N}
}
```

## Auto-fix safety

`--fix` only applies to invariants whose correction is semantically
safe. It NEVER auto-fixes :

- I10 (`blocked_reason` empty) — humain must decide the reason
- I8 (`state_history` non-monotonic) — likely a bug, needs investigation
- I14 (transition from terminal) — likely a manual mutation, needs
  audit

For these, the doctor reports them but the curator (you) handles them.

## Integration with hooks

The plugin's `hooks/hooks.json` invokes `pipeline doctor` :

- `PostToolUse(Write|Edit)` on `**/refs/*.md` → mini-check on the
  edited ref (warn-level)
- `SessionEnd` → full doctor sweep (error-level)

These are non-blocking by default — they emit warnings but don't fail
the session. To skip the SessionEnd doctor, set
`RESEARCH_SKIP_END_DOCTOR=1`.

## Examples

### Quick audit

User: "lance le doctor"
Skill: `python -m pipeline doctor`

### Fix the cosmetic drift

User: "auto-fix les warn"
Skill: `python -m pipeline doctor --fix --severity warn`

### Inspect RTFM correlation

User: "vérifie les invariants avec RTFM"
Skill: `python -m pipeline doctor --correlate-rtfm --severity warn`

### Slow integrity check (recompute all sha256)

User: "vérifie l'intégrité des PDFs"
Skill: `python -m pipeline doctor --check-sha`

## When NOT to use

- If the user wants to delete a ref or change its state manually →
  guide them to edit the YAML directly (PostToolUse will catch any
  invariant violation)
- If the user asks "is this citation hallucinated ?" → that's
  `sota-auditor`, not `registry-doctor`
- If the user wants to audit a SOTA or article → that's `sota-auditor`
  or `citation-receipts`
