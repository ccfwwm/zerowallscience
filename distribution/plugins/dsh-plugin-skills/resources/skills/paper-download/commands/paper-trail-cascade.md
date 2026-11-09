---
description: Acquire PDFs via the 8-source cascade (11 with opt-in extended sources) for a single ref by slug, or a batch filtered by state. Validates page 1 anti-homonymy on each download.
---

# `/paper-trail:cascade` — Run the PDF acquisition cascade

Invoke the `pdf-cascade` skill to push refs through the FSM via the
strict acquisition cascade.

## Usage

```
/paper-trail:cascade <slug>                # one ref by slug
/paper-trail:cascade --state candidate     # batch by state
/paper-trail:cascade --state candidate --limit 20
/paper-trail:cascade --ref <slug> --dry-run
```

## What it does

1. Parses the argument (slug, `--state X`, optional `--limit N`,
   `--dry-run`, `--cited-in <SOTA_name>`)
2. Invokes the worker B :

   ```bash
   python -m pipeline run <args>
   ```

3. Reports session recap : `planned / done / pending / blocked /
   skipped_terminal`
4. Each acquired PDF is validated page 1 anti-homonymy automatically
   before being accepted
5. Doctor runs at the end (unless `--no-doctor`) to flag any new
   invariant violation

## Shadow libraries

By default, the cascade has 10 sources (no Sci-Hub, no Anna's Archive).
To enable shadow libs for this session (cf. `DISCLAIMER.md`) :

```bash
export RESEARCH_ENABLE_SHADOW_LIBS=1
/paper-trail:cascade --state candidate --limit 10
```

The cascade then has 15 sources — 17 with the browser routes available
as well (Playwright + a display, see `docs/ACQUISITION_HEADFUL.md`).
A disclaimer prints to stderr at the first cascade load of the session.

## Output trace

Every attempt is logged in the registry under `acquisition_attempts[]` :

```yaml
acquisition_attempts:
  - n: 1
    source: crossref_oa
    verdict: no_source
    reason: no_doi
  - n: 2
    source: arxiv
    verdict: success
    pdf_path: 13_Biblio_Maths/Sources/Smith_2020.pdf
    pdf_sha256: a3f5...
```

Use `/paper-trail:status` to see overall registry state, or
`/paper-trail:doctor` to verify post-cascade consistency.
