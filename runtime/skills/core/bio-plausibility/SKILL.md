---
name: bio-plausibility
description: Use when a report or analysis asserts a biological fact that can be checked against a public database — a protein or gene exists in an organism, a GO term is real and current, or a gene belongs to a pathway. You EXTRACT the claimed entities and relations; ZeroWall's deterministic engine re-checks each one against live, license-clear sources (UniProt / QuickGO / Reactome). Flags entities that do not exist or relations not supported by the source; never certifies the biology is correct.
---

# Bio-plausibility re-check

Re-check biological claims **against live sources** — the check a generic
reviewer does not perform. Your job here is narrow and important: **extract** the
concrete biological claims from the report; you do **not** decide the verdict.
ZeroWall's deterministic engine (`bio_check_evaluate`) resolves each claim against
a live, license-clear registry, so the judgement is reproducible and never
invented — the same claims always yield the same findings.

## What to extract

Read the report/analysis and identify each checkable biological claim. Every
claim needs a `kind` and a `statement` (the sentence, verbatim, that made the
claim — so the verdict is auditable). Supported kinds:

- **`protein`** (or `gene`) — a protein/gene said to exist.
  - `symbol` — the gene/protein symbol (e.g. `TP53`, `BRCA1`).
  - `organismId` — NCBI taxon id when stated (defaults to human, `9606`).
- **`go_term`** — a Gene Ontology term said to be real.
  - `goId` — the identifier, form `GO:` + 7 digits (e.g. `GO:0006915`).
  - `term` — the term name, when stated.
- **`gene_pathway`** — a gene said to belong to a pathway.
  - `symbol` — the gene symbol.
  - `pathway` — the pathway name or Reactome stId (e.g. `Apoptosis`, `R-HSA-109581`).
  - `organismId` — NCBI taxon id when stated.

Optional on any claim:

- `source` — the database the report cited, if any. Note: **KEGG, DisGeNET,
  DepMap, CADD, and PanglaoDB are license-gated** — the engine cannot query them
  and will emit a `warn` noting the gap rather than a silent pass.

Include only claims you can actually pin to specific entities — omit vague
statements rather than inventing a symbol or id. Do not guess a taxon id or a GO
id from context; leave the field out and let the engine default or warn.

## Output contract

End the reply with exactly one fenced block, and keep it as the LAST thing in the
message. The block is the extracted claims, **not** a verdict:

```bio
{"claims":[{"kind":"protein","symbol":"TP53","organismId":9606,"statement":"We measured TP53 abundance across the cohort."},{"kind":"gene_pathway","symbol":"CASP3","pathway":"Apoptosis","statement":"CASP3 acts within the apoptosis pathway."},{"kind":"go_term","goId":"GO:0006915","term":"apoptotic process","statement":"Enriched for the apoptotic process (GO:0006915)."}],"note":"Claims read from the Results section; symbols and the GO id quoted verbatim from the report."}
```

- `claims` carries the entries above; `note` is your one-line account of **where
  in the report** you read each claim (so the verdict is auditable).
- The app runs the deterministic engine over `claims` and renders the resulting
  `bio_plausibility` findings as reviewer cards, which persist to the workspace's
  science database and appear in the research graph. Each finding cites the source
  tool and the resolved accession in its evidence.

## After the verdict

When the user asks, explain each rendered finding in prose — what the engine
found and what it means (e.g. "UniProt has no reviewed human entry for that
symbol, so the protein as named likely does not exist — check for a typo or an
outdated alias"). Explaining is your job; deciding is the engine's.

A missing relation is **not** proof of absence: Reactome coverage is incomplete,
so a `gene_pathway` claim the engine could not confirm returns a `warn`, not an
`error`. Never tell the user the biology is "correct" or the claims are "verified"
beyond what the cited source actually shows — the engine checks existence and
listed membership only, and absence of findings is not a guarantee.
