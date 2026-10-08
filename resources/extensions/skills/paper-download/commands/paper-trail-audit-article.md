---
description: Per-citation audit of an academic article (LaTeX or Markdown). Produces RECEIPTS.md classifying each citation as VALID/ADJUST/INVALID/UNVERIFIABLE. Optional --warn inserts inline warnings in a .bak copy of the source.
---

# `/paper-trail:audit-article` — Per-citation audit of an article

Invoke the `citation-receipts` skill to audit every citation in an
academic article file against the actual source PDFs.

## Usage

```
/paper-trail:audit-article <path-to-paper.tex>
/paper-trail:audit-article <path-to-paper.md>
/paper-trail:audit-article <path> --warn       # insert inline warnings in .bak
```

## What it does

1. Parses citations from the file :
   - LaTeX : `\cite{key}`, `\citep{key}`, `\citet{key}`
   - Markdown : `[[slug]]` (Obsidian) or `[text](refs/slug.md)` (flat)
2. For each citation :
   - Resolves the slug to a ref in the registry
   - If ref isn't `sota_cited_confirmed` → flag as TO_AUDIT_REF first
   - Reads the PDF (via `lib/validate_pdf_content` and `pdftotext`)
   - Invokes `claim-checker` sub-agent for the specific claim audit
3. Produces `RECEIPTS.md` at the same location as the article

## Output

`RECEIPTS.md` format (inspired by James Weatherhead's receipts plugin
MIT) :

```markdown
# RECEIPTS — <article path>

Generated: <ISO timestamp>
Source: <count> citations parsed
Skill: paper-trail/citation-receipts

---

## Citation 1 — [Smith2020] (DOI:10.1234/example)

**Status**: VALID

**Claim in manuscript** (line 42):
> "Smith and Doe proved that X is NP-hard for case Y."

**Source statement** (PDF p.5, §3.2):
> "Theorem 3.2. The problem X is NP-hard for all instances satisfying Y."

**Notes**: Attribution correct, verb « proved » matches the source's
formal theorem statement.

---

## Citation 2 — [Jones2019]

**Status**: INVALID

**Claim in manuscript** (line 78):
> "Jones (2019) showed that Z is decidable in polynomial time."

**Source statement** (PDF p.12):
> "We leave the question of Z's complexity as future work."

**Required correction**: Remove citation or replace with the actual
source proving Z's polynomial decidability.

---

## Recap

| Status | Count |
|---|---|
| VALID | 14 |
| ADJUST | 3 |
| INVALID | 2 |
| UNVERIFIABLE | 1 |

Total: 20 citations audited.

Action required: 6 citations needing rework before submission.
```

## `--warn` mode

In addition to `RECEIPTS.md`, inserts inline warnings in a `.bak`
copy of the article :

- **LaTeX** (`.tex`) : `\todo[color=red]{REF AUDIT: <verdict> — <reason>}`
  adjacent to the offending `\cite{key}`
- **Markdown** (`.md`) : `> [!warning] Ref audit: <verdict> — <reason>`
  adjacent to the citation

The original file is never modified.

## Pre-submission

Mandatory before any paper submission. Iterate :

1. `/paper-trail:audit-article paper.tex`
2. Fix INVALID and ADJUST citations
3. Decide on UNVERIFIABLE (enable shadow libs or remove claim)
4. Re-run audit
5. Until all VALID → submission package ready

## Cross-reference

- `/paper-trail:audit-sota` — upstream existence audit
- `/paper-trail:receipts` — local audit only (no remote API calls)
- `/paper-trail:cascade <slug>` — acquire missing refs
