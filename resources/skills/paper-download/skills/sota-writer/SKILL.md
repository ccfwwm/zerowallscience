---
name: sota-writer
description: >
  Write structured State-of-the-Art (SOTA) reviews / literature reviews
  for academic research projects with **zero hallucinated citations**.
  Activate this skill whenever the user wants to write, update, or
  expand a SOTA. Triggers (FR + EN) : "écris un SOTA", "état de l'art
  sur", "revue de littérature", "mise à jour SOTA", "survey sur",
  "nouveau SOTA", "write a SOTA on", "literature review on",
  "state-of-the-art review", "/paper-trail:new-sota". **MANDATORY** :
  this skill enforces an INVERTED workflow (research first → read
  validated PDFs → write). It REFUSES to write from memory to prevent
  the kind of citation hallucinations (inverted attributions, fabricated
  quotes) that led to retracted papers in the past. Make sure to use
  this skill whenever any SOTA work is requested, even if the user
  doesn't explicitly say "use sota-writer".
---

# Skill : SOTA Writer (research-first, anti-hallucination)

## Why this skill exists

Citation hallucinations in academic writing are systemic when the
author writes from memory and looks up sources afterward. They include
inverted attributions ("X proved Y" when X proved ¬Y), fabricated
quotes (text in quotation marks that doesn't appear in the cited
source), wrong attributions (citing the wrong author for a known
result), and confusion between similar-named papers (homonymy).

The plugin paper-trail exists because a retracted paper in 2026-02
contained 12 such errors, signaled by the misrepresented author
themselves. This skill encodes the **inverted workflow** : research
→ read → write. Slower in appearance, faster in practice : no
post-submission audit, no remediation, no reviewer embarrassment.

## Scope

- **Vault root** : `$RESEARCH_VAULT_PATH` (resolved via the adapter,
  default obsidian)
- **Registry** : `$RESEARCH_REGISTRY_PATH/refs/*.md` (one `.md` file
  per ref with YAML frontmatter)
- **SOTA output location** : resolved via
  `adapter.sota_output_path(topic_slug)`

## The supreme rule

**No claim in a SOTA without pointing to the notes body of a ref file
in state `page1_validated` (or higher).** If I want to write X but no
source supports X → either I find one, or I don't write X. No
rhetorical rephrasing to "keep" an unsourced claim.

## Mandatory 4-phase workflow

```
A. EXHAUSTIVE RESEARCH
   ├─ paper-search MCP (search_papers multi-source, 22 platforms)
   ├─ rtfm_search (optional — local indexed corpus if configured)
   ├─ NotebookLM (optional — books corpus if RESEARCH_ENABLE_NOTEBOOKLM=1)
   ├─ WebSearch (course pages, personal pages, archive.org)
   └─ → N candidate refs in state `candidate` (file `.md` created for each)

B. ACQUISITION + PAGE 1 VALIDATION
   ├─ Delegate to pdf-cascade skill (paper-trail)
   ├─ 10-source cascade (up to 17 with browser + opt-in routes) + mandatory
   │  page 1 anti-homonymy validation
   └─ → refs in state `page1_validated` (physical PDF + validated)

C. READING / EXTRACTION
   ├─ For each ref in `page1_validated` : read abstract + relevant sections
   ├─ Notes written in the markdown body of the ref file (under frontmatter)
   └─ → structured notes corpus (direct input for writing phase)

D. WRITING FROM NOTES ONLY
   ├─ Each citing sentence points to its ref file via wikilink
   ├─ Each cited ref transitions to `sota_cited_confirmed` as it's used
   ├─ If I want to write X and no note supports X :
   │     either return to phase A (find a source that says X)
   │     or don't write X
   └─ → publishable SOTA (all citations in `sota_cited_confirmed`)
```

## Phase A — Exhaustive research

### Pre-flight (mandatory, fast)

Before issuing any search call, run :

```bash
python3 -m pipeline preflight
```

If it reports `paper-search MCP non enregistré`, **stop and ask the user
to install it** — the recipe is printed in the preflight output. Do NOT
fall back to other searches without notifying the user : the cascade
and downstream phases need the unified multi-platform API.

### Tools by question type

| Question type | Priority tool |
|---------------|---------------|
| General academic papers | `mcp__paper-search__search_papers` (multi-source unified) |
| Recent preprints (CS, AI, NLP) | `mcp__paper-search__search_arxiv` |
| Formal linguistics, NLP | `mcp__paper-search__search_semantic` |
| Medical / biomedical | `mcp__paper-search__search_pubmed` |
| Cross-domain aggregator | `mcp__paper-search__search_openalex` |
| Lookup by exact DOI | `mcp__paper-search__get_crossref_paper_by_doi` |
| Local project corpus | `mcp__rtfm__rtfm_search`, `mcp__rtfm__rtfm_context` |
| Books (theory, domain-specific) | `mcp__notebooklm__notebook_ask` (if configured) |
| Course pages, personal sites | `WebSearch` |

### Correct call signatures (avoid TypeError)

The unified `search_papers` tool expects `max_results_per_source`, NOT
`max_results` :

```
mcp__paper-search__search_papers(
    query="your topic",
    max_results_per_source=10,
    sources=["openalex", "crossref", "semantic", "arxiv"],
)
```

Per-platform tools (`search_arxiv`, `search_semantic`, etc.) typically
accept `max_results` directly. When in doubt, omit the limit on the
first call and inspect the response shape.

### Phase A output

For each identified ref, create a file
`$RESEARCH_REGISTRY_PATH/refs/{author_year_short}.md` :

```markdown
---
uid: bibkey:author2020topic   # provisional, pdf-cascade will resolve to doi:/arxiv:/etc.
author: Author
year: 2020
title: Paper title (as best known)
state: candidate
cited_in:
  - {type: sota, name: SOTA_Current_Draft, section: "draft"}
state_history:
  - {state: candidate, at: <ISO>, by: sota-writer, meta: {search_source: paper-search}}
---

<!-- Body empty in phase A — filled in phase C after PDF read -->
```

### Filtering candidates : >30% DROP refusal

If more than 30% of candidate refs fail to reach `page1_validated`
(after phase B), the skill **refuses to write the SOTA** and reports
the candidates dropped + reason. The user must then either :
- Refine the search topic (too vague → too many irrelevant hits)
- Enable shadow libs (`RESEARCH_ENABLE_SHADOW_LIBS=1`) for paywall
  access
- Manually intervene on specific blocked refs

This anti-hallucination guard prevents writing a SOTA when the source
base is too thin or too noisy.

## Phase B — Delegate to pdf-cascade

```
"pdf-cascade skill : here are N refs in state `candidate` in
 $RESEARCH_REGISTRY_PATH/refs/. Resolve UIDs, download PDFs via the
 10-source cascade (up to 17 with browser and opt-in routes), validate page 1. Return with the session report."
```

**Do not attempt to acquire the PDFs yourself.** That's pdf-cascade's
job, and it has the complete cascade + integrated page 1 validation
+ anti-homonymy guard. Request, wait for return, then proceed to
phase C with **only** the refs in `page1_validated`.

## Phase C — Reading and notes extraction in markdown body

For each PDF in `page1_validated`, **enrich the markdown body** of the
existing ref file. The frontmatter (metadata) is already filled by
pdf-cascade ; the markdown body is the writer's zone.

```markdown
---
# (frontmatter already filled by pdf-cascade:)
uid: doi:10.1234/example
state: page1_validated
pdf_path: <relative path under SOURCES>
# ...
---

# Notes — Author 2020, Paper Title

## Abstract (verbatim)
> [Verbatim abstract text from the paper]

## Main claims
- **§1 (p.1)** : Key claim 1 with reference to specific section
- **§3 (p.5)** : Key claim 2
- **§7 (p.12)** : Key claim 3

## Verbatim useful quotes
- p.10 : « Exact quote useful for citing, copied verbatim from PDF. »

## Context / methodology
- Approach : description of the methodology
- Non-claims : what the paper does NOT claim (anti-attribution safeguard)

## Links to SOTA usage
- Use in `SOTA_Topic_Name` §3.2 for argument X
- Use in `SOTA_Topic_Name` §4.1 for counter-example Y
```

**The markdown body of the ref file is the institutional memory of a
reading.** It will be consulted every time this paper is cited. No
need to re-read the PDF. One file per ref = no drift between metadata
and notes.

## Phase D — Writing from notes

### Writing rules

1. **Every citation points to its ref file** via wikilink (Obsidian
   layout) `[[author_2020_topic|Author 2020]]` or markdown link (flat
   layout) `[Author 2020](refs/author_2020_topic.md)`. The exact
   format is provided by `adapter.format_citation(slug)`.
2. **Every factual claim relies on the notes body** : if I want to
   write « Shannon proved H(X) for natural languages », I open
   `shannon_1948_mathematical_theory.md` and verify. Either the note
   says it, or I rephrase, or I delete.
3. **Correct verb** : `prove`, `show`, `formulate`, `argue`, `suggest`
   are different. The notes body says what the source actually says.
4. **Verbatim quotes** : any text in quotation marks MUST be copy-pasted
   from the notes body (section "Verbatim useful quotes") or from
   the PDF directly.
5. **Update `cited_in[]` of the frontmatter** : each time a citation
   is added to the SOTA, update the ref file's frontmatter to record
   the SOTA + section.

### Forbidden anti-patterns

| Temptation | Why it's forbidden | Correct behavior |
|------------|--------------------|------------------|
| « X proved Y » without having read X | Structural hallucination | Read X (notes body) ; if Y isn't there → don't write it |
| Quotation marks « ... » on rephrased text | Quote fabrication | Verbatim copy from notes or PDF |
| « As X showed » when X wasn't read | Unverified attribution | Read X first, or write « According to [secondary source citing X]... » |
| Citing a ref in `candidate` state | PDF not validated, source not confirmed | Request acquisition, wait for `page1_validated` |
| Inferring a paper's content from title/abstract | Title/abstract don't say everything (and sometimes mislead) | Read relevant sections, enrich notes |
| « Probably X says Y » | Speculation presented as fact | Verify or delete the sentence |

## SOTA structure

| # | Section | Content |
|---|---------|---------|
| 1 | Introduction | Context, motivation, scope |
| 2 | Taxonomy | Classification of approaches |
| 3 | Detailed review | By approach/school, with validated citations |
| 4 | Comparative analysis | Synthesis table |
| 5 | Identified gaps | Gaps in the literature |
| 6 | Implications | Links with research goals |
| 7 | References | Format `[AuthorYear]` with wikilinks to `_registry/refs/*.md` |

## Conventions

- **Language** : as specified by user / project (English default)
- **References** : Format `[AuthorYear]` in text (e.g., `[Shannon1948]`,
  `[Chomsky1957]`)
- **Wikilinks (Obsidian layout)** : `[[shannon_1948_mathematical]]`
- **Markdown links (flat layout)** : `[Shannon 1948](refs/shannon_1948_mathematical.md)`
- **SOTA file location** : `adapter.sota_output_path(topic_slug)`

## Available tools (Phase A summary)

- `mcp__paper-search__*` — 22 platforms (Crossref, arXiv, OpenAlex,
  Semantic Scholar, HAL, etc.)
- `mcp__notebooklm__*` — query books (optional, if NotebookLM configured)
- `mcp__rtfm__rtfm_search` / `rtfm_context` — local corpus (optional)
- `WebSearch` — personal pages, course pages, archive.org

## Relationships with other skills

| Skill | Relationship |
|-------|--------------|
| `pdf-cascade` (paper-trail) | **Sub-task in phase B**. Writer requests acquisition, waits for return. |
| `sota-auditor` (paper-trail) | **Downstream audit**. Auditor verifies each citation (`sota_cited_confirmed`) or requests corrections. |
| `citation-receipts` (paper-trail) | **Per-citation protocol**. For each citation written, validates verb + quotes + attribution. |
| `paper-writer` (paper-trail) | **Consumes SOTAs**. When a paper is written, it relies on audited SOTAs. |
| `researcher` agent | **Phase A as sub-agent**. Use when search needs to be exhaustive and contextually isolated. |

## What this skill does NOT do

- **Does not write** without first having a validated PDF corpus (hard refusal)
- **Does not download** PDFs (that's pdf-cascade's job)
- **Does not decide** that a ref is hallucinated (that's sota-auditor's job)
- **Does not validate** each citation individually (citation-receipts at
  writing, sota-auditor at downstream audit)
- **Does not rephrase** a sentence to make a source say something it
  doesn't say

## Pre-finalization audit

Before marking a SOTA as completed :

1. All citations point to an existing `$RESEARCH_REGISTRY_PATH/refs/*.md`
   file
2. All cited refs' frontmatter is in `sota_cited_confirmed`
3. `pipeline doctor` passes without ERROR-level violations on the
   refs cited
4. `cited_in[]` of each cited ref's frontmatter is up-to-date (SOTA
   name + section)

If any of these conditions is not met → the SOTA is not finalized,
return to the appropriate phase.

The plugin's hook `PreToolUse(Write)` on SOTA files enforces points
1 and 2 mechanically — attempting to write a SOTA citing
non-`page1_validated` refs will be blocked.
