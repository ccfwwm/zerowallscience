---
name: citation-receipts
description: >
  Systematic per-citation verification protocol for academic writing.
  MUST be used whenever writing content that cites sources — papers,
  blog posts, SOTAs, or any document making factual claims about external
  work. Triggers (FR + EN) on any writing task involving references,
  citations, or bibliographic claims, or when the user asks to "verify
  citations", "check sources", "audit references", "validate bibliography",
  "produce receipts", "/paper-trail:audit-article", "/paper-trail:receipts".
  Produces a structured RECEIPTS.md report classifying each citation as
  VALID / ADJUST / INVALID with reason. Optional --warn mode inserts
  inline warnings into a .bak copy of the source document. Combined with
  sota-auditor (upstream existence audit), this skill is the **downstream**
  per-claim check.
---

# Skill : Citation Receipts

## Why this skill exists

The plugin's mechanical safeguards (FSM, page 1 anti-homonymy, cascade)
prevent citing a fabricated reference. But they don't prevent citing a
real reference for a claim it doesn't actually make. Examples that have
occurred :

- **Inverted result** : citing a paper as proving NP-hardness when it
  proves tractability
- **Fabricated quote** : putting words in quotation marks that don't
  appear in the cited source
- **Wrong attribution** : citing the wrong author for a known result
  (attribution chains)
- **Equivalent ≠ formulated as** : saying X "is equivalent to" Y is
  much stronger than X "is formulated as" Y

This skill enforces a per-citation read-before-cite protocol. Inspired
by the `receipts` plugin (MIT, James Weatherhead) for the audit-PDF↔claim
pattern.

## The golden rule

**Read the source before you cite it.** Not the title. Not the abstract.
Not what you think it probably says based on the author's reputation.
The actual text where the result is stated. If you can't access the
source, mark it UNVERIFIABLE explicitly — don't guess.

## When this skill activates

This protocol applies to EVERY citation in :

- Research papers (`paper-writer` skill output)
- SOTAs / literature reviews (`sota-writer` skill output)
- Blog posts and other academic content
- `/paper-trail:audit-article <path>` — runs this skill on an existing
  article file
- `/paper-trail:receipts <path>` — local audit (no remote API calls)
- Pre-submission audit checklist

## Verification workflow (per citation)

For each source you intend to cite (or that's already cited in the
document under audit), follow these steps in order.

### Step 1 — Locate the source

Check these locations, in order :

1. **Local registry** : `$RESEARCH_REGISTRY_PATH/refs/<slug>.md`. If
   state is `page1_validated` or higher, the PDF is at
   `$RESEARCH_SOURCES_PATH/<pdf_path>`.
2. **`paper-search` MCP** for not-yet-acquired sources :
   `mcp__paper-search__search_papers(query=<title>)` then
   `get_crossref_paper_by_doi(<doi>)` for confirmed metadata
3. **`notebooklm` MCP** (optional, if configured) for book chapters
4. **Not found anywhere** → mark UNVERIFIABLE, flag to user, do not
   proceed with the citation as-is

### Step 2 — Procure the source if missing

If the ref is in `candidate` state in the registry :
- Invoke `pdf-cascade` skill to acquire and validate
- Wait for `page1_validated` before proceeding to step 3

If the ref isn't in the registry at all :
- Create a stub : `$RESEARCH_REGISTRY_PATH/refs/<slug>.md` with
  `state: candidate`
- Invoke `pdf-cascade` to acquire

### Step 3 — Read the relevant section

Once the PDF is available locally, read the section containing the
claim being cited. Extraction tools :

- `pdftotext -layout <pdf> -` for general extraction
- `pdftotext -layout -f N -l N <pdf>` for a specific page
- Use `Read` tool on the corresponding ref's markdown body (which
  should already contain notes from `sota-writer` phase C if the SOTA
  was created via the plugin)

### Step 4 — Verify the claim

Before writing or accepting the citation, check :

1. **Does the source actually say what we claim ?** Read the relevant
   section — not just the abstract.
2. **Are we using the right verb ?** "prove" vs "show" vs "argue" vs
   "suggest" have different strengths. Match the source's own language.
3. **Are quotes verbatim ?** If using quotation marks, the exact words
   must appear in the source. If you can't verify, paraphrase instead.
4. **Is the attribution correct ?** The result belongs to the author
   who first established it, not necessarily the author who cites it in
   a survey.
5. **Are indices/numbers correct ?** Double-check any specific values
   (complexity bounds, page numbers, counts).

### Step 5 — Classify the citation

| Verdict | Meaning | Action |
|---|---|---|
| **VALID** | Claim matches source exactly | Proceed |
| **ADJUST** | Claim is approximately right but needs softening or rephrasing | Reformulate citing sentence before submitting |
| **INVALID** | Claim contradicts source or quote is fabricated | Do not cite as-is. Fix or remove. Consider transitioning the ref to `retracted` via `sota-auditor` if the contradiction is structural. |
| **UNVERIFIABLE** | Cannot access source after exhaustive search | Flag to user. Do not cite specific results from this source. |

## RECEIPTS.md output format

When invoked via `/paper-trail:audit-article` or
`/paper-trail:receipts`, produces a `RECEIPTS.md` file at the same
location as the audited article. Format inspired by the `receipts`
plugin (MIT) :

```markdown
# RECEIPTS — <audited file path>

Generated: <ISO timestamp>
Source: <count> citations parsed
Skill: paper-trail/citation-receipts

---

## Citation 1 — [Smith2020] (DOI:10.1234/example)

**Status**: VALID

**Claim in manuscript** (line 42):
> "Smith and Doe proved that X is NP-hard for case Y."

**Source statement** (PDF p.5, §3):
> "Theorem 3.2. The problem X is NP-hard for all instances satisfying Y."

**Notes**: Attribution correct, verb « proved » matches the source's
formal theorem statement.

---

## Citation 2 — [Jones2019] (no DOI found)

**Status**: INVALID

**Claim in manuscript** (line 78):
> "Jones (2019) showed that Z is decidable in polynomial time."

**Source statement** (PDF p.12):
> "We leave the question of Z's complexity as future work."

**Required correction**: Remove citation or replace with the actual
source that proved Z's polynomial decidability (likely Brown 2021,
which Jones cites in their future work section).

---

## Citation 3 — [Anderson2018]

**Status**: UNVERIFIABLE

**Claim in manuscript** (line 91):
> "Anderson reported a 15% accuracy gain on the benchmark."

**Source availability**: Paywall, no OA version found via cascade.
Sci-Hub opt-in not active. Cannot verify the 15% figure.

**Recommended action**: Either activate `RESEARCH_ENABLE_SHADOW_LIBS=1`
for one acquisition attempt, or remove the specific 15% claim and
keep only a vaguer "improvement reported" wording.

---

## Recap

| Status | Count |
|---|---|
| VALID | 14 |
| ADJUST | 3 |
| INVALID | 2 |
| UNVERIFIABLE | 1 |

Total: 20 citations audited.

Action required: 3 ADJUST + 2 INVALID + 1 UNVERIFIABLE = 6 citations
needing rework before submission.
```

## Red flags — patterns that caused real errors

These patterns have caused actual citation errors in submitted papers.
Watch for them when auditing :

- **Inferring results from the title** : "Complexity of X" doesn't tell
  you if they proved hardness or tractability
- **Quoting from memory** : if you didn't just read the exact words,
  don't put them in quotes
- **Attribution chains** : Author A cites a result from Author B. Cite
  Author B, not Author A, unless you're specifically discussing A's
  interpretation
- **Equivalent ≠ formulated as** : "X is equivalent to TSP" is much
  stronger than "X is formulated as a variant of TSP". Use the weaker
  claim unless the paper proves formal equivalence
- **Survey-based citations** : if your knowledge of a paper comes from
  a survey or textbook rather than the paper itself, say so or read
  the original

## `--warn` mode

When invoked as `/paper-trail:audit-article <path> --warn`, in addition
to producing `RECEIPTS.md`, the skill inserts inline warnings in a
`.bak` copy of the source document :

- **LaTeX** (`.tex`) : inserts `\todo[color=red]{REF AUDIT FAILED:
  <reason>}` adjacent to the offending `\cite{key}`
- **Markdown** (`.md`) : inserts callout
  `> [!warning] Ref audit failed: <reason>` adjacent to the citation

The original file is never modified — only the `.bak` copy. The user
reviews the `.bak`, accepts/rejects each warning manually.

## Integration with other skills

| Skill | Relationship |
|---|---|
| `sota-writer` | **Upstream**. Writes SOTAs which this skill audits per-citation. |
| `sota-auditor` | **Complementary upstream**. Auditor decides ref existence (VRAI/HALLUCINATION) at the ref level. This skill audits the specific claim within a verified ref (verb, quote, attribution). |
| `paper-writer` | **Upstream**. Writes papers ; pre-submission this skill runs full audit. |
| `pdf-cascade` | **Sub-task**. If a cited ref isn't yet acquired, invokes pdf-cascade. |
| `claim-checker` agent | **Sub-task for per-citation verification**. This skill orchestrates ; the agent does the PDF↔claim deep dive. |

## Mandatory tool usage

A citation is NOT verified unless at least one of these tools has been
called for it (the call must appear in the session transcript) :

| Source type | Required tool | Command |
|---|---|---|
| Article / proceedings | paper-search MCP | `mcp__paper-search__get_crossref_paper_by_doi(DOI)` |
| Book chapter (if NotebookLM configured) | notebooklm MCP | `mcp__notebooklm__ask_question(...)` |
| Local PDF in registry | Bash + pdftotext | `pdftotext -layout <pdf_abs_path> -` |
| Local PDF notes | Read tool | `Read(<registry/refs/slug.md>)` |

"I know what this paper says" is NOT verification. The MCP call must
appear in the transcript. If the relevant MCP isn't available, mark the
citation UNVERIFIABLE.

## Pre-submission audit

Before a paper is submitted :

1. Run `/paper-trail:audit-article <paper.tex>` (or `.md`)
2. Review the produced `RECEIPTS.md`
3. Fix all INVALID + ADJUST citations
4. Decide on UNVERIFIABLE : enable shadow libs for one acquisition
   attempt, OR remove the specific claim that depends on the source
5. Re-run audit ; iterate until only VALID remain
6. Document the final audit report in the paper's submission package
