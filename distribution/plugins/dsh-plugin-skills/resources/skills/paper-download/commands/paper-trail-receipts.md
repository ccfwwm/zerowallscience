---
description: Local-only per-citation audit (no remote API). Reads the cited PDFs from the local registry, generates RECEIPTS.md. Faster than audit-article (no Crossref / paper-search calls).
---

# `/paper-trail:receipts` — Local audit only (no remote API)

Variant of `/paper-trail:audit-article` that operates **only on local
data** (registry + PDFs on disk). No `paper-search` MCP calls, no
WebSearch, no Crossref API.

## Usage

```
/paper-trail:receipts <path-to-paper.tex>
/paper-trail:receipts <path-to-paper.md>
```

No `--warn` mode here (use `/paper-trail:audit-article --warn` if you
want inline warnings).

## What it does

Same as `audit-article` but :

- **Skips UNVERIFIABLE escalation** : if a cited ref isn't in the
  registry or its PDF isn't on disk, the verdict is UNVERIFIABLE
  without further investigation
- **No remote search** : doesn't try to fetch missing PDFs via
  cascade
- **No metadata enrichment** : doesn't cross-check author/year via
  Crossref

Useful when :

- You're offline
- You want a fast first-pass audit (~10s for 20 citations)
- You want to verify the claims against PDFs you already have, without
  triggering acquisition of missing ones

## Output

`RECEIPTS.md` with the same format as `audit-article`.

Citations with no local PDF will be marked `UNVERIFIABLE (no local PDF,
run /paper-trail:cascade <slug> to acquire)`.

## Cross-reference

- `/paper-trail:audit-article` — full audit with remote enrichment
- `/paper-trail:cascade <slug>` — acquire missing PDFs
- `/paper-trail:audit-sota` — bibliography-level audit (no per-claim
  verification)
