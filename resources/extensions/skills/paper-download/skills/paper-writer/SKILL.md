---
name: paper-writer
description: >
  Write academic papers (IMRaD structure) for conferences and journals,
  with mandatory anti-hallucination citation verification. Triggers
  (FR + EN) : "écris un paper", "article pour conférence", "rédige pour
  la conférence", "structure IMRaD", "soumission paper", "write a paper
  on", "academic article", "/paper-trail:new-paper". Builds on existing
  SOTAs in the registry — does NOT invent references. Every citation
  passes through citation-receipts validation before being accepted in
  the final draft.
---

# Skill : Paper Writer

## Role

Write research articles in IMRaD structure (Introduction, Methods,
Results, and Discussion) for conferences and journals, with every
citation rigorously verified against the actual source.

## Workflow

Like `sota-writer`, this skill enforces an **inverted workflow** :
sources are built / verified **before** writing, not after. The
difference with sota-writer is that paper-writer assumes the SOTA
corpus already exists in the registry (it consumes audited SOTAs to
build the Related Work section) and focuses on producing the IMRaD
sections + their citations.

```
A. SOTA CONSUMPTION
   ├─ Identify the SOTAs in the vault relevant to the paper's topic
   ├─ Verify they're audited (no ref in candidate / blocked_human)
   └─ → corpus of refs in `sota_cited_confirmed` available

B. STRUCTURE
   ├─ Choose target venue (ISMIR, SMC, NeurIPS, ACL, etc.)
   ├─ Adapt IMRaD to venue conventions (page limit, abstract length)
   └─ Outline each section with bullet points

C. WRITE PER SECTION
   ├─ Methods & Results : new content from the user's research
   ├─ Related Work : draw from audited SOTAs, no new claims
   ├─ Each citation passes citation-receipts protocol
   └─ → draft with placeholder citations (e.g., \cite{author2020topic})

D. PRE-SUBMISSION AUDIT
   ├─ /paper-trail:audit-article <paper.tex> [--warn]
   ├─ Fix all INVALID and ADJUST citations
   ├─ Decide on UNVERIFIABLE (enable shadow libs or remove claim)
   └─ → submittable draft
```

## Standard IMRaD structure

1. **Abstract** — 150–250 words
2. **Introduction** — context, problem, contribution
3. **Related Work** — based on existing SOTAs in the registry
4. **Methods** — formalism, algorithms, model
5. **Results** — experiments, evaluations
6. **Discussion** — interpretation, limitations
7. **Conclusion** — summary of contributions, future work
8. **References** — BibTeX

## Venue adaptation

Common venue conventions to respect :

| Venue | Pages | Template | Notes |
|---|---|---|---|
| ISMIR | 6 | ISMIR LaTeX | Music information retrieval |
| SMC | 8 | SMC template | Sound and music computing |
| NeurIPS | 8 + appendix | NeurIPS LaTeX | Machine learning |
| ACL | 8 | ACL LaTeX | Computational linguistics |
| ICASSP | 4–5 | ICASSP LaTeX | Signal processing |
| Generic journal | varies | Journal-specific | Refer to author guide |

For a non-standard venue, ask the user for the page limit, citation
style (APA / IEEE / Chicago / ACM), and reference format (BibTeX,
RIS, etc.).

## Citation protocol — MANDATORY

Every citation in the paper MUST :

1. Resolve to a ref in the registry (`$RESEARCH_REGISTRY_PATH/refs/<slug>.md`)
2. The ref's state MUST be `sota_cited_confirmed` (audited as VRAI)
3. The specific claim being cited must pass `citation-receipts`
   (CONFIRMED or NUANCED verdict)

Failure modes :

- Citation pointing to a ref in `candidate` or `blocked_human:*` →
  blocked by the PreToolUse hook (`precheck_sota_wikilinks.py`)
- Citation pointing to a ref in `retracted` → blocked, must be removed
- Claim that doesn't match the source → flagged by `citation-receipts`
  in `RECEIPTS.md`, must be corrected before submission

## Workflow integration

### Phase A — Identify source SOTAs

```bash
# Find SOTAs in the vault related to the paper's topic
# Use the configured adapter
python -c "
from adapters import get_adapter
adapter = get_adapter()
for sota_path in adapter.find_sotas():
    # filter by topic
    ...
"
```

For each relevant SOTA, verify it's audited :

```bash
python -m pipeline doctor --severity error
# Should report 0 violations on the refs cited by the source SOTAs
```

### Phase B — Draft

Use the chosen LaTeX or markdown template. Write the structure first
(section headers, bullet outline), then fill in section by section.
For Related Work, **copy + adapt** content from the audited SOTAs —
don't paraphrase from memory.

### Phase C — Cite

For each `\cite{slug}` (LaTeX) or `[[slug]]` (Markdown) added :

1. Verify the ref exists in registry
2. Verify the ref state is `sota_cited_confirmed`
3. Verify the specific claim via `citation-receipts` skill (read the
   PDF section, match verb, verify verbatim quotes)
4. Update the ref's `cited_in[]` to record this paper + section

### Phase D — Pre-submission audit

```
/paper-trail:audit-article <paper.tex>
```

Reviews each citation, produces `RECEIPTS.md`. Iterate until all
citations are VALID.

```
/paper-trail:audit-article <paper.tex> --warn
```

Same audit + inserts inline warnings in `.tex.bak` for INVALID /
ADJUST / UNVERIFIABLE citations.

## What this skill does NOT do

- **Doesn't invent references** — only consumes from the audited
  registry
- **Doesn't download PDFs** — that's `pdf-cascade`
- **Doesn't decide ref existence** — that's `sota-auditor`
- **Doesn't verify each citation's claim individually** — that's
  `citation-receipts` (downstream)
- **Doesn't bypass the PreToolUse hook** — if the hook blocks the
  write, the citation must be fixed first
- **Doesn't write Related Work from memory** — copies + adapts from
  audited SOTAs only

## Conventions

- **Language** : as specified by user / venue (English default)
- **Citation style** : as specified by venue (BibTeX keys = slug of
  the ref file, e.g., `\cite{shannon_1948_mathematical}`)
- **Wikilinks (Markdown drafts)** : `[[shannon_1948_mathematical]]` —
  the adapter renders to the appropriate format at compile time
- **References file** : `.bib` file derived from the registry refs
  (one entry per cited slug, generated automatically)

## Cross-reference

- `/paper-trail:new-paper <topic>` — entry point for this skill
- `/paper-trail:audit-article <paper.tex>` — pre-submission audit
- `pipeline/USAGE.md` for the underlying CLI
- `skills/sota-writer/SKILL.md` for the upstream SOTA creation
- `skills/citation-receipts/SKILL.md` for per-citation verification
