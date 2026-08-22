---
name: traceability-review
description: Use when the user asks to review, verify, or audit a report, manuscript, or analysis in the workspace for traceability — resolving citations, flagging numbers with no source, and checking figures against the code that generated them. Emits a structured review block the app renders as reviewer findings. Verifies traceability, never "correctness".
license: MIT
zerowall:
  schema_version: 1
  domains: [general, scientific-literature]
  research_stages: [validation, synthesis]
  roles: [critic, validator]
  evidence_types: [literature, project-data, computational]
  outputs: [evidence-matrix, validation-plan]
  side_effects: network
---

# Traceability Review

Audit a workspace document (report, manuscript, or notebook) with three checks.
You verify **traceability** — that claims trace to sources, data, and code —
not truth. Never state or imply that the document is error-free.

## PDF manuscripts — extract first, never guess

If the document is a **PDF**, do not read the raw bytes or infer its contents.
Run the bundled extractor first — it pulls the text plus the concrete citation
identifiers and quantitative claims deterministically, so you audit real
identifiers, not ones recalled from memory:

After `use_skill`, run the absolute `pdf_extract.py` path listed under
`Bundled Resources`:

```text
python "<absolute path to pdf_extract.py>" MANUSCRIPT.pdf
```

It prints JSON: `{backend, pages, chars, citations:{dois,arxiv,pmids},
claims:[{kind,text,context}], text}`. Use `citations` as the input to Check 1,
`claims` as the input to Check 2, and `text` to locate figure references for
Check 3. If it returns `{"error": …}` (no PDF backend installed), say so plainly
and fall back to whatever text you can read — do not fabricate identifiers.

## Check 1 · Citation audit

1. Extract every citation identifier from the document: DOI (`10.xxxx/…`),
   arXiv id, PMID, or title + year when no identifier is given.
2. Resolve each against a public registry (no API key needed):
   - DOI: `curl -s "https://api.crossref.org/works/<doi>"`
   - arXiv: `curl -s "http://export.arxiv.org/api/query?id_list=<id>"`
   - PMID: `curl -s "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=<pmid>&retmode=json"`
3. Findings:
   - `error` — the identifier does not resolve (HTTP 404 / empty result).
   - `warn` — it resolves, but the registry's title/authors/year clearly
     disagree with how the document cites it.
   - `warn` — network unavailable: report "could not verify (offline)" rather
     than skipping silently.

## Check 2 · Untraceable numbers

1. List the document's quantitative claims: statistics, percentages, sample
   sizes, effect sizes, p-values, model scores.
2. For each, look for its source inside the workspace: a data file, a code or
   notebook output, or an execution log that produces that value.
3. Finding: `warn` for any number with no traceable source. Quote the exact
   sentence in the evidence.

## Check 3 · Figure ↔ code consistency

1. Call `inspect_project_provenance` with every referenced figure and candidate
   generator path. Use the returned project-isolated status and evidence. A
   status of `unknown` means the stored evidence is insufficient; do not turn
   it into `untracked` or a clean result.
2. For each figure the document references:
   - Stored ArtifactVersion, Run, or execution provenance for the figure and
     candidate generator.
   - Filesystem mtimes may be compared as a separate freshness hint after the
     stored provenance status is reported.
3. Findings:
   - `warn` — the generating code has a newer version than the figure:
     "figure may be stale — regenerate it from the current code".
   - `warn` — a referenced figure is `untracked`, or its status is `unknown` and
     the audit cannot establish a stored provenance chain.

## Output contract

End the reply with exactly one fenced block (the app renders it as reviewer
cards; keep it as the LAST thing in the message):

```review
{"findings":[{"level":"error","check":"citation","title":"DOI does not resolve","evidence":"10.9999/fake.2026 → Crossref 404"}],"note":"Traceability review — verified what could be traced. Absence of findings is not a guarantee of correctness."}
```

- `level`: `error` | `warn` | `ok` · `check`: `citation` | `number` | `figure`.
- One finding per issue; `ok` findings are allowed for confirmed traceable
  items worth stating explicitly.
- Evidence: the exact identifier / quoted sentence / file paths, plus what you
  observed.
- The note must never claim the document has no errors.
