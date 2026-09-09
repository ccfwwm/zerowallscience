# Usage

Daily workflows with the `paper-trail` plugin.

## Contents

1. [Installation](#1-installation)
2. [Initial configuration](#2-initial-configuration)
3. [Creating a literature review without fabricated citations](#3-creating-a-literature-review)
4. [Auditing an existing SOTA or paper](#4-auditing-an-existing-sota-or-paper)
5. [Daily registry maintenance](#5-daily-registry-maintenance)
6. [Shadow libraries opt-in](#6-shadow-libraries-opt-in)
7. [When acquisition is only temporarily stuck](#7-when-acquisition-is-only-temporarily-stuck)
8. [Integrity hooks](#8-integrity-hooks)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. Installation

In a Claude Code session:

```
/plugin install file:///path/to/paper-trail
```

Or via marketplace (when published):

```
/plugin marketplace add roomi-fields
/plugin install paper-trail
```

Verify:

```
/plugin list   # paper-trail v0.1.0 should appear
```

## 2. Initial configuration

Environment variables (set in your shell profile or
`<project>/.env`):

```bash
# Vault paths (defaults: ~/research_vault and subdirectories)
export RESEARCH_VAULT_PATH=/path/to/your/vault
export RESEARCH_SOURCES_PATH=$RESEARCH_VAULT_PATH/sources
export RESEARCH_REGISTRY_PATH=$RESEARCH_SOURCES_PATH/_registry

# Vault layout (defaults: obsidian)
export RESEARCH_VAULT_LAYOUT=obsidian   # obsidian | flat | zotero (V2)

# Shadow libraries (see §6) — strict opt-in
# export RESEARCH_ENABLE_SHADOW_LIBS=1

# Optional: NotebookLM integration
# export RESEARCH_ENABLE_NOTEBOOKLM=1

# Optional: skip the SessionEnd consistency check
# export RESEARCH_SKIP_END_DOCTOR=1
```

External MCPs used (configured independently in `~/.claude/mcp.json`
or `<project>/.mcp.json`):

- **`paper-search`**: multi-platform academic search (used by
  `sota-writer`, `researcher` agent)
- **`notebooklm`**: book corpus (optional)
- **`rtfm`**: local indexing (optional)

None of these MCPs are bundled with paper-trail. The plugin operates
in degraded mode without them (you will be prompted to provide
references manually).

## 3. Creating a literature review

### Without fabricated citations

```
/paper-trail:new-sota "Petri nets in music notation"
```

What happens:

1. **Phase A — Research**: the `researcher` sub-agent queries the
   `paper-search` MCP across 22 platforms and proposes N candidate
   references
2. **Human selection**: you choose the relevant candidates
3. **Phase B — Acquisition**: the `pdf-cascade` skill downloads PDFs
   via the 8-source cascade (or 10 if shadow libraries are opt-in
   enabled)
4. **Phase C — Reading**: for each PDF in `page1_validated`, the
   plugin writes structured notes into the reference's markdown body
   (verbatim abstract, main claims, verbatim quotes)
5. **Phase D — Writing**: the SOTA is produced citing **only**
   validated references. A final "Discarded references" section
   lists rejected candidates with reasons.

Mechanical safeguards:

- If more than 30% of candidates fail to reach `page1_validated`,
  the plugin **refuses to write the SOTA** (signal that the topic is
  too vague or that the cascade is failing)
- The `PreToolUse` hook refuses writing if any citation points to an
  unvalidated reference

### With a specific scope

```
/paper-trail:new-sota "GPT transformers for symbolic music" --max-candidates 20
```

### For details

See `skills/sota-writer/SKILL.md` for the full 4-phase workflow.

## 4. Auditing an existing SOTA or paper

### Audit an existing SOTA

```
/paper-trail:audit-sota path/to/SOTA_Existing.md
```

Output: report classifying each cited reference by state (OK,
TO_VALIDATE, HALLUCINATION, UNKNOWN, INACCESSIBLE).

With auto-purge of hallucinations:

```
/paper-trail:audit-sota path/to/SOTA_Existing.md --purge
```

Removes wikilinks to `retracted` references, adds a footer note
listing what was removed, saves to `.bak`.

### Audit a paper (LaTeX or Markdown)

Per-citation audit against local PDFs:

```
/paper-trail:audit-article path/to/Paper.tex
```

Output: `RECEIPTS.md` adjacent to the source file, classifying each
citation as VALID / ADJUST / INVALID / UNVERIFIABLE with evidence
quoted from the source.

With inline warnings in `.tex.bak`:

```
/paper-trail:audit-article path/to/Paper.tex --warn
```

Inserts `\todo[color=red]{REF AUDIT: <verdict> — <reason>}` adjacent
to each problematic `\cite{key}`.

### Local-only audit (no remote API)

Faster, does not query `paper-search` / Crossref:

```
/paper-trail:receipts path/to/Paper.tex
```

## 5. Daily registry maintenance

### Registry overview

```
/paper-trail:status
```

Counts of references per FSM state (active, waiting, blocked,
terminal).

### Invariant audit

```
/paper-trail:doctor
/paper-trail:doctor --severity error      # errors only
/paper-trail:doctor --fix --severity warn # safe auto-fix
/paper-trail:doctor --correlate-rtfm      # RTFM correlation invariants
/paper-trail:doctor --check-sha           # recompute sha256 (slow)
```

### Manual acquisition of a reference

```
/paper-trail:cascade <slug>           # one specific ref
/paper-trail:cascade --state candidate --limit 50
/paper-trail:cascade --ref <slug> --dry-run
```

### Resume OCR-waiting references

After RTFM has finished indexing OCR on `awaiting_rtfm_ocr` refs:

```
/paper-trail:reactivate-ocr
```

## 6. Shadow libraries opt-in

⚠️ **Read `DISCLAIMER.md` before enabling.**

Sci-Hub and Anna's Archive are disabled by default. To enable:

```bash
export RESEARCH_ENABLE_SHADOW_LIBS=1
```

On the first cascade load of the session, a disclaimer is printed to
stderr.

All shadow-library acquisitions are prefixed `_optin` in the registry
(`acquisition_attempts[].via = scihub_optin`, `annas_archive_optin` or
`annas_headful_optin`) for traceability.

Valid for the duration of the parent shell. To disable:

```bash
unset RESEARCH_ENABLE_SHADOW_LIBS
```

### The browser route (`annas_headful_optin`)

Anna's Archive now answers the plain HTTP route with an anti-bot
challenge, and its file server rejects a headless browser. A third source
drives a *windowed* Chromium instead — which needs no screen: a virtual
display in a container is enough.

It joins the cascade only when Playwright **and** a display are both
available. When they are not, it prints one line to stderr at cascade
build time and the other sources carry on unchanged:

```
[cascade] annas_headful source unavailable (no_display_run_under_xvfb) — …
```

That line is informational, not an error. To make the source available:

```bash
pip install playwright && playwright install chromium
RESEARCH_ENABLE_SHADOW_LIBS=1 xvfb-run -a python -m pipeline run --loop
```

Because slots are rationed, one reference can take up to
`RESEARCH_ANNAS_HEADFUL_BUDGET_S` (600 s by default) before the source
gives up and the reference is retried later.

### Targeting a few references

A full pass walks every waiting reference and replays each known failure.
When you only want the three you just added, name them:

```bash
python -m pipeline run --ref smith_2019_beat,doe_2021_entrainment
```

See [`ACQUISITION_HEADFUL.md`](ACQUISITION_HEADFUL.md) for the container
recipe, the scheduled-job command and the things to watch for.

## 7. When acquisition is only temporarily stuck

A reference whose cascade failed for reasons that time alone will fix — a
mirror rationing its slots, an open circuit-breaker, a 502 — is **not**
locked for human arbitration. It gets two frontmatter fields instead:

| Field | Meaning |
|---|---|
| `retry_after` | UTC timestamp before which the pipeline skips this reference |
| `transient_retries` | Consecutive waits so far — drives the back-off |

The wait starts at 15 minutes and doubles on each consecutive failure, up
to 8 hours; both fields are cleared as soon as the PDF is acquired. Such a
reference resumes on its own, so it needs no action — it will simply be
skipped by any pass running before its retry date.

A reference that hit a *definitive* failure (404, no DOI, page 1 rejected,
a file already refused once) still gets `blocked_by:
cascade_exhausted_needs_manual` and waits for your arbitration, as before.

To lift those automatic locks in bulk — after adding a source, typically —
and retry them in the same pass:

```bash
python -m pipeline run --retry-exhausted
```

Locks placed by a human are left untouched. This is a one-off gesture: in
a recurring job it replays the full cascade, on every run, over references
whose exhaustion has already been established.

## 8. Integrity hooks

Three hooks built into the plugin:

### PreToolUse (Write|Edit) — blocks invalid SOTA writes

Refuses writing/editing a `SOTA_*.md` file (Obsidian layout) or
`sotas/*.md` file (flat layout) if any citation points to an
unvalidated reference.

Block reasons:

- Reference absent from the registry
- Reference in `candidate`, `uid_resolved`, `pdf_acquired`,
  `needs_reacquisition`, `blocked_human:*`, or `retracted`

To unblock:

- `/paper-trail:cascade <slug>` to acquire the missing reference
- Or remove the offending wikilink from the SOTA

### PostToolUse (Write|Edit) — doctor on edited reference

After each edit of a `_registry/refs/*.md` file, the plugin runs a
mini-doctor on that reference and prints warnings to stderr
(non-blocking).

### SessionEnd — final consistency check

At the end of each Claude Code session, the plugin runs
`pipeline doctor --severity error` and prints the summary to stderr.

Skip via `export RESEARCH_SKIP_END_DOCTOR=1`.

## 9. Troubleshooting

### `/paper-trail:cascade` says "another pipeline session running"

The `WorkerLock` prevents concurrent mutating sessions. Check no
other `pipeline run` is running:

```bash
ps aux | grep "pipeline run"
```

If a zombie process is detected, the lock auto-releases on the next
attempt (via PID liveness check).

### Doctor reports many ERROR I8

I8 = `state_history` non-monotonic. Likely a migration artifact or
a manual mutation. Auto-fix not available (structural signal).

Investigation:

```bash
python -m pipeline doctor --json | jq '.violations[] | select(.invariant=="I8")'
```

### A reference stays in `awaiting_rtfm_ocr` for a long time

RTFM OCR job pending. Check:

```bash
rtfm check --slug <slug> -f json
rtfm failed -f json | jq '.failures[] | select(.filepath | contains("<slug>"))'
```

If OCR genuinely failed: manually transition to
`needs_reacquisition` to retry the cascade with a text source.

### `pipeline run` reports nothing but `skipped_terminal`

Two different situations, distinguished by the reference's frontmatter:

- `retry_after` set — the reference is *waiting*, not stuck. It hit only
  transient unavailability and will resume on its own after that
  timestamp. Nothing to do. See §7.
- `blocked_by: cascade_exhausted_needs_manual` — the cascade genuinely
  ran out, and your arbitration is needed:

```bash
/paper-trail:decide <slug>          # inspect and decide one reference
python -m pipeline run --retry-exhausted   # or retry them all in bulk
```

If neither field is set and the state is terminal (`page1_validated`,
`sota_cited_confirmed`, `retracted`), there is simply nothing left to do
on that reference.

### Cascade systematically fails on a source

The per-source circuit breaker opens after N=5 consecutive failures
within a 60-second window. The worker continues with the other
sources.

To reset: end the current session (breakers are in-memory, not
persisted).

### Plugin doesn't find the registry

Check environment variables:

```bash
echo $RESEARCH_VAULT_PATH
echo $RESEARCH_SOURCES_PATH
echo $RESEARCH_REGISTRY_PATH
```

If unset, defaults assume a specific development layout. For any
other vault, set `RESEARCH_VAULT_PATH` at minimum.

## Cross-references

- `docs/ARCHITECTURE.md` — system overview
- `docs/LEGAL.md` — licenses and attributions
- `DISCLAIMER.md` — shadow libraries
- `ACQUISITION_HEADFUL.md` — browser-based acquisition in a headless
  container
- `pipeline/USAGE.md` — underlying worker CLI
- `pipeline/ARCHITECTURE.md` — FSM and cascade detail
