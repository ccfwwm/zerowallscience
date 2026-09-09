---
description: Start writing an academic paper (IMRaD structure) on a topic, with anti-hallucination citation verification at every step. Builds on existing audited SOTAs.
---

# `/paper-trail:new-paper` — Start writing an academic paper

Invoke the `paper-writer` skill to start drafting an academic paper.

## Usage

```
/paper-trail:new-paper <topic>
/paper-trail:new-paper <topic> --venue ISMIR|SMC|NeurIPS|ACL|...
/paper-trail:new-paper <topic> --based-on <SOTA1>,<SOTA2>,...
```

## What it does

1. Identifies SOTAs in the vault relevant to the topic (via the
   adapter)
2. Verifies the SOTAs are audited (`/paper-trail:audit-sota` underneath)
3. Sets up the paper structure (IMRaD by default, venue-specific
   conventions if `--venue` is set)
4. Drafts each section :
   - Methods & Results : skeleton with TODOs for user content
   - Related Work : draws from audited SOTAs, citing
     `sota_cited_confirmed` refs only
5. Updates `cited_in[]` of each cited ref's frontmatter
6. Pre-submission : prompts user to run `/paper-trail:audit-article`

## Safeguards

- **PreToolUse hook** (`tools/precheck_sota_wikilinks.py`) blocks the
  write if any cited wikilink points to a non-validated ref
- **Citation-receipts** mandatory before considering the paper
  ready for submission
- **No inventing references** : only consumes from the audited registry

## Examples

### Standard usage

```
/paper-trail:new-paper "Petri nets for music notation"
```

Skill identifies relevant SOTAs (e.g., `SOTA_Music_Notation_Formal`,
`SOTA_Petri_Nets_in_Arts`), proposes draft outline.

### Venue-specific

```
/paper-trail:new-paper "Polyrhythm quantification" --venue ISMIR
```

6-page IMRaD structure matching ISMIR LaTeX template.

### Based on specific SOTAs

```
/paper-trail:new-paper "Generation-recognition asymmetry" \
  --based-on SOTA_Asymmetry_Languages,SOTA_Formal_Grammars
```

Restricts the Related Work section to these specific SOTAs.

## Output

- Draft paper file at the location appropriate for the venue
  (e.g., `40_OUTPUT/Papers/<topic>/<paper>.tex` for LaTeX, or
  Markdown if Markdown-based workflow)
- `.bib` file generated from the cited refs
- A TODO list of sections needing user content (Methods, Results)

## Pre-submission workflow

```
/paper-trail:audit-article <paper.tex>      # per-citation audit
/paper-trail:audit-sota <each_source_SOTA>  # bibliography audit
pipeline doctor --severity error             # registry integrity
```

All three must be clean before submission.

## Cross-reference

- `/paper-trail:audit-article` — pre-submission audit
- `/paper-trail:new-sota` — upstream SOTA creation
- `/paper-trail:cascade` — acquire missing refs cited in your draft
