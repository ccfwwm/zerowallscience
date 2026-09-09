---
description: Audit a SOTA's bibliography. Classify each cited ref by validation state. Optional --purge removes citations to retracted refs from the SOTA (with .bak backup).
---

# `/paper-trail:audit-sota` — Audit a SOTA's bibliography

Invoke the `sota-auditor` skill to audit references cited in an
existing SOTA file.

## Usage

```
/paper-trail:audit-sota <path-to-SOTA.md>
/paper-trail:audit-sota <glob-pattern>
/paper-trail:audit-sota <path> --purge      # auto-remove retracted citations
```

## What it does

1. Reads the SOTA markdown file
2. Extracts all cited refs via the adapter (wikilinks Obsidian, or
   markdown links flat)
3. For each cited ref, looks up the state in the registry
4. Produces a classification report :

   | Cited ref | State | Status |
   |---|---|---|
   | `arnold_1982_*` | `sota_cited_confirmed` | OK |
   | `chemillier_2003_*` | `page1_validated` | TO_VALIDATE (claim audit needed) |
   | `wilson_2021_*` | `retracted` | HALLUCINATION (to remove) |
   | `unknown_slug` | (not in registry) | UNKNOWN (broken wikilink) |
   | `paywall_2020_*` | `blocked_human:cascade_exhausted` | INACCESSIBLE |

5. If `--purge` is set, AUTO-REMOVE the HALLUCINATION wikilinks from
   the SOTA (in a `.bak` copy first), and add a note at the bottom
   of the SOTA listing what was removed

## Output

Markdown audit report :

```
# Audit SOTA — <path>

## Status summary
- OK: N
- TO_VALIDATE: N
- HALLUCINATION: N (purged) or N (action required: remove)
- UNKNOWN: N
- INACCESSIBLE: N

## Details
[Table of all cited refs with their status]

## Required actions
[List of action items for the curator]
```

## Pre-submission

For papers, run `/paper-trail:audit-sota` on every SOTA cited by the
paper, then `/paper-trail:audit-article` on the paper itself.

## Cross-reference

- `/paper-trail:audit-article` — per-citation audit (downstream)
- `/paper-trail:cascade <slug>` — acquire missing refs
- `/paper-trail:doctor` — check registry-level invariants
