---
name: sota-auditor
description: >
  Final authority on the truthfulness of references cited in State-of-the-Art
  reviews and academic papers. Activate this skill whenever the session
  involves auditing, correcting, or cleaning citations in a SOTA or article,
  or when responding to verdicts from `pdf-cascade` / `registry-doctor`.
  Triggers (FR + EN) : "audit SOTA", "corriger SOTA", "vérifier hallucinations",
  "purger refs", "déclarer une ref véridique ou hallucinée", "audit
  references", "verify citations", "purge hallucinations", "/paper-trail:audit-sota".
  Does NOT download (that's pdf-cascade) and does NOT write (that's sota-writer
  / paper-writer). Decides VRAI vs HALLUCINATION and applies consequences
  (correct attribution, transition to sota_cited_confirmed, or retract +
  purge from SOTA). Binary decision, no grey zone.
---

# Skill : SOTA Auditor

## Why this skill exists

Citation hallucinations in academic publications (fabricated quotes,
inverted attributions, misidentified authors) are the failure mode this
plugin exists to prevent. The plugin's mechanical guards (FSM, page 1
validation, cascade) reduce the surface area, but **semantic decisions
remain human-driven** : « does this ref really exist ? Is this claim
really in this paper ? Is this the right author ? »

`sota-auditor` is the role that makes those decisions. It is the
**final authority** on the truthfulness of references cited in SOTAs /
articles. It can :

- Confirm a citation (transition `page1_validated → sota_cited_confirmed`)
- Retract a fabrication (transition `* → retracted` with reason)
- Correct an attribution (modify the SOTA + the ref frontmatter)
- Rollback a technical transition by `pdf-cascade` if a homonymy was
  missed

## The supreme rule

**For each problematic reference, the decision is binary :**

- **VRAI** → confirm (correct attribution if needed), transition to
  `sota_cited_confirmed` once the specific claim has been validated
- **HALLUCINATION** → transition to `retracted` with **mandatory
  WebSearch documenting the absence** (≥ 2 independent sources
  confirming inexistence or error), then **purge the citation** from
  the SOTA(s) where it appears

**No grey zone.** No "roughly correct that we can rephrase". No
"keep it just in case". An unverifiable citation is a research debt
that eventually explodes.

## When to activate

- The user asks for an audit of a SOTA or article bibliography
- `pipeline doctor` reports invariant violations on cited refs
- `pdf-cascade` returned `blocked_human:title_mismatch` or
  `blocked_human:cascade_exhausted` on important refs
- `pipeline events --to retracted` lists newly retracted refs
- Before paper submission (pre-submission audit)
- The user mentions "vérité", "hallucination", "purger", "retraiter"
- `/paper-trail:audit-sota` command is invoked

## Worker B transitions the auditor can drive

The auditor has authority over these FSM transitions. Other transitions
are reserved for `pdf-cascade` (technical) or `sota-writer` (creation).

| Transition | Conditions |
|---|---|
| `page1_validated → sota_cited_confirmed` | Section read, verb verified, verbatim quotes if present, verdict ∈ {CONFIRMED, NUANCED}, textual evidence cited |
| `* → retracted` | WebSearch mandatory (≥ 2 independent sources confirming absence/error), `retracted_reason` ∈ {hallucination, homonymy_purged, off_topic, duplicate}, purge from ALL SOTAs (verifiable by absence in markdown files) |
| **Rollback** of a `pdf-cascade` technical transition | If an invariant is violated downstream (late homonymy discovery, false attribution found, off-domain missed) |

The auditor **never triggers** `∅ → candidate` (writer's job) nor the
technical transitions `candidate → uid_resolved → pdf_acquired →
page1_validated` (pdf-cascade's job, invokable as sub-task).

## Inputs the auditor reacts to

Sources of « refs to audit » in the paper-trail workflow :

1. **`pipeline doctor` invariants** — violations on cited refs (especially
   I11 cited_in orphans, I12 reciprocity broken, I14 transition from
   terminal)
2. **`pipeline events --to retracted` or `--to page1_validated`** — refs
   that have moved recently and need attention
3. **`pdf-cascade` blocked outputs** — refs in `blocked_human:title_mismatch`
   or `blocked_human:cascade_exhausted`
4. **User-driven request** — "audit this SOTA", "audit this paper"
5. **`/paper-trail:audit-sota <path>`** command output
6. **`pipeline doctor --correlate-rtfm`** — RTFM signals that an
   acquired PDF has format/OCR issues

## 5-step method per problematic ref

Apply in order — don't skip steps.

### Step 1 — Locate in the SOTA / paper

`grep -n` or `Read` to find the exact line(s) where the ref is cited.
A ref is often cited multiple times — check each occurrence.

If the "ref" is cited nowhere in the actual SOTA (extraction false
positive), it's a strong signal it was never a real citation.

### Step 2 — Read the context

Read the complete sentence(s) citing the ref. What does the SOTA claim
about this reference ? What argument depends on it ? What's the nuance
(verb used, type of argument) ?

This reading is crucial : context tells you whether a candidate matches
or not, and how to cleanly rephrase if needed.

### Step 3 — Verify existence and attribution

Choices depending on the case :

- **Multiple candidates from `pdf-cascade`** (title-fallback returned
  N matches) : compare each candidate's title to the SOTA context.
  Pick the one matching the sentence meaning. If none matches → step 4
  without candidate.
- **Fuzzy match by `pdf-cascade`** : read the top match's title. If
  semantic overlap with context is strong → confirm. Otherwise → step 4.
- **No candidate found by cascade** : external search (paper-search MCP
  on multiple platforms, WebSearch on Google Scholar, arXiv) with the
  title, context keywords, author. Give yourself 2 searches before
  concluding hallucination.
- **Acronym / capitalized non-author** (e.g., "MARBLE", "HaMSE",
  "CCG", "MIDI") : analyze if it's (a) an extraction false positive
  (section title captured as ref), (b) a corporate author legitimate
  (W3C, AMEI, etc.), or (c) an attribution error in the SOTA (the
  acronym is a system name, not the author).

For verifications, use the `paper-search` MCP rather than inferring
from internal knowledge — the `citation-receipts` skill details that
protocol.

### Step 4 — Binary decision

One of two outcomes :

**VRAI** : the ref exists, the SOTA can rely on it.
- If the attribution in the SOTA is correct → no SOTA edit needed
- If the attribution is wrong (wrong author, wrong year) → **correct
  the SOTA** (edit the `.md` file). Keep the claim, fix the names/year
- Update the registry : transition the ref to `sota_cited_confirmed`
  via `pipeline run --ref <slug>` (with appropriate FSM
  acknowledgment), or directly edit the frontmatter and run `pipeline
  doctor` to verify

**HALLUCINATION** : the ref doesn't exist (nothing found after serious
searches) or isn't attributable to an identifiable author.
- **Remove the citation from the SOTA** (`Edit` the `.md`). Do not
  rephrase, soften, or "[citation needed]" — remove the citation and
  reword the sentence so it stands without it. If the entire sentence
  depends on this ref, **delete the entire sentence**.
- Update the ref's frontmatter : `state: retracted` +
  `retracted_reason: hallucination` (or `homonymy_purged`, `duplicate`,
  `off_topic`, `extraction_artifact_*`)

### Step 5 — Verify the consequence in the registry

After any state change :

```bash
python -m pipeline doctor --severity warn
# Should report 0 violations on the touched refs
# I11/I12 reciprocity should be coherent

python -m pipeline events --since YYYY-MM-DD --ref <slug>
# Audit trail of the state change
```

If `pipeline doctor` reports a downstream violation (e.g., I12 SOTA still
cites a now-retracted ref), the audit is not complete : fix the SOTA
markdown until the doctor is clean.

## `/paper-trail:audit-sota --purge` automation

If invoked with `--purge`, the auditor :

1. Reads the target SOTA(s)
2. Extracts all cited refs (via the adapter — wikilinks Obsidian or
   markdown links flat)
3. For each cited ref :
   - If state = `sota_cited_confirmed` or `page1_validated` → KEEP
   - If state = `retracted` → **AUTO-REMOVE** the citation from the SOTA
     + add a note at the bottom of the SOTA listing what was removed
   - If state = `blocked_human:cascade_exhausted` → KEEP (the ref is
     real but inaccessible, leave the citation but flag as INACCESSIBLE
     in audit report)
   - If state = `candidate` / `uid_resolved` / etc. → KEEP + flag as
     UNCONFIRMED in audit report
4. Outputs a markdown audit report classifying each ref
5. If `--purge`, applies the AUTO-REMOVE actions in a `.bak` copy first

## What this skill does NOT do

- **Doesn't download sources** (`pdf-cascade`'s job)
- **Doesn't invent an author** from context ("it sounds like Freedman
  could have written this"). Either verification confirms, or it's a
  hallucination
- **Doesn't soften a sentence to mask a hallucination** ("we say
  suggests instead of proves"). An unverifiable citation is invalid
  at 100%, not "to rephrase"
- **Doesn't touch SOTAs without a truthfulness reason**. No stylistic
  refactoring, no editorial improvement, no formatting updates. The
  only motive for editing a SOTA from this skill is : correct a false
  attribution or remove a hallucination
- **Doesn't proceed when doubt persists** without flagging to the
  user. If after serious external research you can't decide
  VRAI/HALLUCINATION, mark the ref `blocked_human:pending_decision`
  and move on

## Relationships with other skills

| Skill | Relationship |
|---|---|
| `citation-receipts` | **Complementary (downstream)**. Once a ref is declared VRAI, citation-receipts validates each individual citation (verbatim quote check, verb check, attribution check) |
| `sota-writer` | **Upstream**. The writer creates new SOTAs ; the auditor audits what was written |
| `paper-writer` | **Upstream**. Same for papers. Before submission, run a complete `sota-auditor` audit on the paper's bibliography |
| `pdf-cascade` | **Sub-task**. If the auditor decides a ref is VRAI but not yet acquired, invokes pdf-cascade to download |
| `registry-doctor` | **Audit support**. The auditor consults `pipeline doctor` to identify violations and confirms fixes by re-running doctor |

## Pre-submission audit checklist

Before a paper is submitted, run a complete `sota-auditor` pass on all
source SOTAs of the paper :

1. `pipeline doctor --severity error` returns 0 violations on cited
   refs
2. All citations in the paper resolve to refs in
   `sota_cited_confirmed`
3. `pipeline events --since <session_start>` shows no surprising
   transition
4. The registry has no `blocked_human:title_mismatch` on refs cited
   by the paper

If any of these conditions isn't met → the paper is not ready for
submission.
