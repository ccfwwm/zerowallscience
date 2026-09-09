---
name: paper-download
description: "Full paper-download academic research workflow with strict PDF acquisition, page-one identity validation, citation audit, registry maintenance, and reproducible research artifacts. Use for downloading or acquiring academic PDFs, running a source cascade, resuming failed acquisitions, validating paper identity, auditing citations, or managing a literature registry."
---

# paper-download

This is the complete upstream workflow copied into ZeroWall Science as `paper-download`. The runtime is kept intact in this directory: `pipeline/`, `lib/`, `skills/`, `agents/`, `commands/`, `hooks/`, `tools/`, and the supporting documentation remain available for direct use.

## Runtime

Run commands from this skill directory so Python resolves the bundled `pipeline` and `lib` packages:

```text
python -m pipeline preflight
python -m pipeline status
python -m pipeline acquire <sota-path> --apply
python -m pipeline run --state candidate --limit 50
python -m pipeline reactivate-ocr
python -m pipeline doctor --json
```

The `skills/` directory contains the original focused workflows, including `skills/pdf-cascade/SKILL.md`, `skills/citation-receipts/SKILL.md`, `skills/sota-writer/SKILL.md`, `skills/sota-auditor/SKILL.md`, `skills/paper-writer/SKILL.md`, and `skills/registry-doctor/SKILL.md`. Load the focused file when the request is narrower than the complete workflow.

## ZeroWall environment mapping

Use ZeroWall Environment settings for configuration. Do not create a second `.env` or print secrets. The process inherits these variables:

- `RESEARCH_VAULT_PATH` (required by the upstream registry worker)
- `RESEARCH_SOURCES_PATH`, `RESEARCH_REGISTRY_PATH`, `RESEARCH_VAULT_LAYOUT`
- `RESEARCH_CONTACT_EMAIL`, `S2_API_KEY`, `UNPAYWALL_EMAIL`
- `RESEARCH_ENABLE_SHADOW_LIBS`, `RESEARCH_ENABLE_NOTEBOOKLM`, `RESEARCH_RTFM_DB`
- `RESEARCH_BROWSER_COOKIES`, `RESEARCH_BROWSER_PROFILE`, `RESEARCH_ANNAS_HEADFUL_BUDGET_S`
- `RESEARCH_SKIP_END_DOCTOR`, `RESEARCH_LIBGEN_MIRRORS`, `RESEARCH_MIN_BOOK_PAGES`

When invoked from `zerowall-literature`, first use its metadata resolution and task output, then use this skill's `pdf-cascade` workflow for the download/validation step when the user requests the full Paper Trail path. Keep the task directory and registry paths explicit in the result.

## Evidence and authorization

Every accepted PDF must pass the existing page-one identity checks and remain linked to its registry entry. Preserve acquisition attempts, source ledger entries, hashes, quarantine files, and review queues. Use only sources and accounts the user is authorized to access; optional shadow-library routes stay disabled unless the user explicitly enables `RESEARCH_ENABLE_SHADOW_LIBS` for that session. Never invent metadata, quotes, author profiles, or validation results.
