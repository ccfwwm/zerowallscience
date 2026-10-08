---
name: pdf-cascade
description: >
  Acquire PDFs for bibliographic references via a strict 8-source cascade
  (Crossref OA → arXiv → OpenAlex → Unpaywall → HAL → CORE → archive.org →
  WebSearch queue; optionally Sci-Hub + Anna's Archive, plus Anna's via a
  windowed browser, in opt-in mode).
  Each acquired PDF is validated against expected author/title/year (page 1
  anti-homonymy) before being accepted. Trigger this skill whenever the user
  wants to download a PDF for a reference, fill a cascade, retry an acquisition,
  or push a `candidate`/`uid_resolved` ref forward in the FSM. Use also for
  `/paper-trail:cascade <slug>` and `/paper-trail:reactivate-ocr`. Triggers on
  French and English phrases: "télécharge le PDF", "lance la cascade", "acquérir
  les sources", "DL ce papier", "passer en pdf_acquired", "valider page 1",
  "reprise OCR", "download this paper", "acquire PDFs", "run cascade",
  "retry acquisition", "advance candidates". The skill never decides whether a
  citation is truthful — that is the curator's role (sota-auditor skill). It
  only executes the technical state transitions of the worker B.
---

# Skill : pdf-cascade

## Purpose

Wraps the paper-trail worker B's acquisition cascade. Given a single
reference slug or a state filter, it advances the matching refs from
`candidate` toward `page1_validated` through the FSM, with strict page 1
anti-homonymy validation.

Anchors all downloads in the local registry (`pdf_path`, `pdf_sha256`,
`acquisition_attempts[]`) so the curator can audit everything.

## When to invoke

Trigger this skill for any of:

- The user wants to fetch a PDF for a ref by slug
- The user wants to push the whole batch of `candidate` or `uid_resolved`
  refs forward
- The user explicitly calls `/paper-trail:cascade`,
  `/paper-trail:reactivate-ocr`, or `/paper-trail:status`
- `sota-writer` sub-task needs PDFs acquired for its proposed candidates

Do NOT invoke for semantic decisions (is this citation correct?) — that
belongs to `sota-auditor`.

## How it works

The skill delegates to the worker B Python CLI:

```bash
# Single ref by slug
python -m pipeline run --ref <slug>

# Batch by state filter
python -m pipeline run --state candidate --limit 50

# Dry-run (no mutation)
python -m pipeline run --state candidate --dry-run

# Reactivate refs waiting for OCR
python -m pipeline reactivate-ocr
```

The CLI invokes the 8-source cascade (10 with
`RESEARCH_ENABLE_SHADOW_LIBS=1` — see DISCLAIMER.md — and 11 when the
browser route is available too, see `docs/ACQUISITION_HEADFUL.md`). Each acquired
PDF must pass page 1 validation (author + title similarity ≥ 0.3 +
zero off-domain keywords) before being accepted into the registry.

## Cascade order (default, without shadow libs)

```
1. Crossref OA       (DOI-based, open-access metadata)
2. arXiv             (preprints CS/math/physics/q-bio/q-fin/etc.)
3. OpenAlex          (cross-domain academic graph)
4. Unpaywall         (OA discovery, fallback)
5. HAL               (Hyper Articles en Ligne, French academia)
6. CORE              (UK-based open repository aggregator)
7. archive.org       (digitized books and articles)
8. WebSearch queue   (manual fallback — adds the ref to a queue for
                     human-driven search via Claude Code interactive)
```

If shadow libs are activated, sources 8 and 9 are inserted before
WebSearch:

```
8. scihub_optin       (Sci-Hub multi-mirror)
9. annas_archive_optin (Anna's Archive via scidb DOI + title search)
10. websearch
```

## Anti-homonymy safety net

Every successful PDF download passes through `_save_and_validate` which:

1. Verifies PDF integrity (magic bytes, page count > 0)
2. Extracts page 1 text via `pdftotext`
3. Compares to expected metadata:
   - Author surname must appear
   - Title similarity ≥ 0.3 (keyword-based)
   - Zero off-domain keywords (e.g., arachnology terms for a CS paper)
4. Sets `state: page1_validated` if all 3 pass; `pdf_acquired` if PDF
   structure OK but text not extractable (likely scan, will trigger
   OCR via `awaiting_rtfm_ocr`); quarantines if validation fails

Quarantined PDFs go to `_registry/_quarantine/<slug>_HOMONYM_*.pdf`
with the suffix indicating the failure mode.

## Output

The CLI prints a session recap:

```
Récap session : planned=N done=N pending=N blocked=N skipped_terminal=N
```

And the doctor runs in the end (unless `--no-doctor`) to flag any
invariant violation introduced.

For each ref processed, the `acquisition_attempts[]` field is appended
in its registry file, providing a complete audit trail.

## Examples

### Acquire one specific ref

User: "télécharge le PDF de arnold_1982"
Skill: invokes `python -m pipeline run --ref arnold_1982 -v`

### Run cascade on all candidates

User: "lance la cascade sur les 30 prochaines candidates"
Skill: invokes `python -m pipeline run --state candidate --limit 30`

### Dry-run to see what would happen

User: "qu'est-ce qui se passerait si je lançais sur tous les uid_resolved ?"
Skill: invokes `python -m pipeline run --state uid_resolved --dry-run`

### Reactivate refs after RTFM OCR completed

User: "reprise OCR sur les awaiting_rtfm_ocr"
Skill: invokes `python -m pipeline reactivate-ocr`

## Failure modes

- `cascade_exhausted` : all sources failed → `blocked_human:cascade_exhausted`,
  the ref needs human-driven action (e.g., contact author, institutional
  access)
- `title_mismatch` : downloaded PDF doesn't match expected metadata →
  quarantined + `blocked_human:title_mismatch`
- `breaker_open` : a source had ≥ 5 consecutive failures, it's
  temporarily disabled for this session (Couche 2 circuit-breaker)
- `worker_crash` : exception in a source's helper → logged in journal,
  ref left in its previous state

Each is logged in `acquisition_attempts[]` with `verdict` and `reason`.

## Recovery when the cascade exhausts (NEW v0.3.11)

When a ref ends in `blocked_human:cascade_exhausted_needs_manual`, the
pipeline writes `_registry/_hints/<slug>.md` listing what was tried.
**Don't grab the PDF outside the pipeline and dump it manually** —
that breaks acquisition_attempts tracking, page 1 validation, and
quarantine. Use one of three proper entry points :

### Path A — You know an OA URL

If a quick web search surfaces a working URL (HAL page, university
deposit, NIME proceedings, author homepage), inject it via the slash
command :

```
/paper-trail:inject-url <slug> https://example.edu/path/to/paper
```

This sets `oa_url:` in the ref frontmatter, unblocks the ref, re-runs
the cascade. The `manual_oa_url` source is at the head of the cascade
and benefits from the landing→PDF resolver (so a deposit page URL
works — no need for the direct PDF URL).

### Path B — `paper-search` MCP `download_with_fallback`

For paywalled-but-on-RG / scidb references, the `paper-search` MCP
handles ResearchGate, Sci-Hub fallback, and other anti-bot sites that
our internal cascade can't reach :

```python
# Inside Claude Code, not bash :
mcp__paper-search__download_with_fallback(
    title="<title>",
    doi="<doi>",
    save_dir="/tmp/paper-trail-recovered",
)
```

Then move the returned PDF to `10_SOURCES/<domain>/Sources/` and set
the ref's `pdf_path` to its relative path. The next `pipeline run
--ref <slug>` will pick it up via the local-PDF step and apply page 1
validation.

### Path C — You already have the PDF locally

Just place it in `10_SOURCES/<domain>/Sources/` and edit the ref's
frontmatter :

```yaml
pdf_path: 11_Biblio_MIR/Sources/Author_Year_Title.pdf
```

Then `python3 -m pipeline run --ref <slug>` will validate page 1.

### What NOT to do

- Don't bypass the registry by directly writing the file path into a
  SOTA — the doctor will flag it as an unanchored citation.
- Don't skip page 1 validation by manually editing `state:
  page1_validated` in the frontmatter — homonymies will leak in.
- Don't reach for `_check_local_pdf` from custom Python code — use the
  three entry points above.
