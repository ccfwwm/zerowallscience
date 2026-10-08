---
description: Create a new State-of-the-Art review on a topic, guaranteed without hallucinated citations. Inverted workflow (research → acquire PDFs → read → write), refuses to write from memory.
---

# `/paper-trail:new-sota` — Create a SOTA on a topic

Invoke the `sota-writer` skill to produce a new SOTA / literature
review on a given topic.

## Usage

```
/paper-trail:new-sota <topic>
/paper-trail:new-sota <topic> --depth shallow|standard|exhaustive
/paper-trail:new-sota <topic> --max-candidates 30
```

## What it does

0. **Pré-vol** : invoke `python3 -m pipeline preflight` to verify the
   environment (vault path, Python deps, `paper-search` MCP registered).
   If pre-flight reports `paper-search MCP non enregistré`, **halt and
   show the install recipe printed by preflight** before going further.
   The user must install the MCP, restart Claude Code, then re-run.
1. **Phase A — Research** : invokes `researcher` sub-agent for
   multi-source academic search (paper-search MCP across 22
   platforms ; optionally NotebookLM + WebSearch)
2. **Phase B — Acquisition** : pushes candidates into the registry
   with state `candidate`, then invokes `pdf-cascade` to download +
   page 1 validation
3. **Phase C — Reading** : for each ref in `page1_validated`, opens
   the PDF and writes structured notes in the ref's markdown body
4. **Phase D — Writing** : produces the SOTA at
   `adapter.sota_output_path(<topic_slug>)`, citing only refs in
   `page1_validated`+, with a separate « Refs écartées » section
   listing rejected candidates and reasons

## Safeguards

- **Refuses to write from memory** : every claim must trace back to
  a `page1_validated` ref's notes body
- **>30% DROP refusal** : if more than 30% of candidates fail to
  reach `page1_validated`, refuses to write the SOTA and reports
  the situation (user must refine topic, enable shadow libs, or
  intervene manually on specific refs)
- **PreToolUse hook** : the plugin blocks the final SOTA write if
  any cited wikilink points to a non-`page1_validated` ref (see
  `tools/precheck_sota_wikilinks.py`)

## Shadow libraries

To maximize acquisition success, activate shadow libs **before**
running new-sota (see `DISCLAIMER.md`) :

```bash
export RESEARCH_ENABLE_SHADOW_LIBS=1
/paper-trail:new-sota "Petri nets in music notation"
```

Without shadow libs, paywall papers go to `blocked_human:cascade_exhausted`
and won't be cited in the SOTA (will appear in « Refs écartées »).

## Output

- New SOTA markdown file at the path resolved by the adapter
- Each cited ref's frontmatter updated with `cited_in[]`
- Phase report (number of candidates, validated, dropped, rejected)
- Recap of next actions if any refs need human intervention

## Examples

### Standard usage

```
/paper-trail:new-sota "Petri nets in music notation"
```

### Limited depth

```
/paper-trail:new-sota "GPT-style transformer for symbolic music" --max-candidates 15
```

### With explicit domain hint

```
/paper-trail:new-sota "polyrhythmic structure quantification" --depth exhaustive
```

## Cross-reference

- `/paper-trail:audit-sota <path>` to audit an existing SOTA
- `/paper-trail:cascade <slug>` to acquire a specific ref manually
- `pipeline/USAGE.md` for the underlying worker B CLI
