---
name: singlecell-qc
description: Use when designing, reviewing, or implementing single-cell RNA-seq QC in Python or R with a human-in-the-loop, data-driven approach. Trigger for scRNA QC metrics, per-sample diagnosis, threshold discussion, mitochondrial/ambient/doublet assessment, MAD vs fixed cutoffs, or refactoring automated merge-first QC. The analyst confirms key decisions at each step—agents must inspect data, propose options, and wait for approval before filtering, doublet removal, or merging. Not a turnkey pipeline skill.
---

# Single-Cell QC

## ZeroWall execution contract

These host rules override workflow examples below when they differ.

- Use ZeroWall tools by their actual names and inspect sample metadata before computing or applying thresholds.
- Use `python` or `r` for short inspection work and `run_in_context` with Run Manager for full multi-sample QC jobs.
- Resolve credentials only through **Settings > Credentials**. Never create, scan, or load project `.env` files and never print secret values.
- Keep network access, large writes, filtering, overwrites, and destructive cleanup approval-gated; threshold application requires explicit human review.
- Do not install Python, R, or other dependencies automatically. Report the exact missing runtime or package instead.
- Keep metrics, threshold records, and filtered outputs inside the active project or Session workspace.

## Overview

Use this skill for **data-driven, human-centered** single-cell QC. The analyst inspects distributions and confirms decisions; code computes metrics and executes only what was agreed.

```text
inspect data → compute metrics → human reviews → confirm thresholds → small action → re-inspect
```

**Not** a one-click pipeline. Do not chain calculate → filter → doublet → merge unless the user explicitly requests full execution after reviewing pilot results.

Follow `code-organization` for script layout. Communicate in Chinese unless asked otherwise.

**Read first:** `references/human-in-the-loop.md`

## When To Use

- "帮我看看这个样本 QC"
- "算一下 QC 指标，阈值我来定"
- "逐样本诊断，先别过滤"
- "这个 merge-first QC 太粗，怎么改成人工确认"
- "参考 GZL metrics 脚本，但要分步做"

Do **not** use for integration/Harmony, annotation, or spatial QC unless only expression-matrix QC is needed.

## Operating Rules (Human-First)

1. **Inspect before acting** — matrix type, species, sample metadata, existing checkpoints.
2. **Pilot samples first** — default 1–3 samples; expand only after user OK.
3. **Metrics before filters** — run `01-calculate_metrics`; stop and report.
4. **Propose thresholds, never silently apply** — show expected cell loss per sample.
5. **Ask at gates** — which metrics next? which thresholds? proceed to filter? merge?
6. **No silent heavy steps** — no full-cohort filter, Scrublet, decontX, or merge without explicit approval.
7. **Reversible checkpoints** — pre-filter metadata/counts stay intact; filtering writes new files.
8. **Scripts = one stage** — owner-editable; thresholds visible at top of filter scripts.

Full gate definitions: `references/human-in-the-loop.md`

## First Pass (Always)

```bash
find <project_root> -maxdepth 4 -type f \( -name '*.py' -o -name '*.R' -o -name '*.h5ad' -o -name '*.md' \) | head -60
rg -n "filter_cells|calculate_qc|metadata|mito|n_genes" <project_root>/scripts 2>/dev/null | head -30
```

Report to the user:

- input matrix type (raw / filtered / EmptyDrops / h5ad);
- species; sample count;
- whether per-sample or merge-first QC exists;
- recommended **next single step** (not full pipeline).

Then **ask** which samples to pilot and which metrics matter for this tissue.

## Staged Workflow (Default)

Each stage ends with human confirmation.

| Stage | Script / action | Agent stops until user confirms |
|-------|-----------------|--------------------------------|
| A | Input inspection | sample list, matrix, species |
| B | `01-calculate_metrics` (pilot) | metric scope (core / hbb / doublet / …) |
| C | `02-qc_diagnosis` figures | figures match expectations |
| D | Threshold proposal (table + loss estimate) | per-sample cutoffs |
| E | `03-filter_cells` | filter summary acceptable |
| F | optional doublet / ambient | method and aggressiveness |
| G | `04-merge_qc_passed` | all samples signed off |

Stages D–G are **skipped** until the user says proceed.

### Metric tiers (choose with user)

| Tier | Metrics | Ask when |
|------|---------|----------|
| Core | `n_genes`, `n_UMIs`, `mito_frac`, `pct_counts_rb` | always unless h5ad already has them |
| Recommended | `hbb_score`, `doublet_score`, cell cycle | tissue-dependent |
| Extended | `chrY_frac`, `ambient_frac`, `nuclear_frac` | metadata / STARsolo available |

Details: `references/metrics-catalog.md`

## Project Layout

Optional scaffold — create only stages the user needs:

```text
scripts/01-qc/
  01-calculate_metrics.py|R   # metrics only
  02-qc_diagnosis.py|R        # figures from metadata
  03-filter_cells.py|R        # runs only after threshold sign-off
result/01-qc/ ...
figure/01-qc/ ...
```

`references/project-layout.md`

## Bundled Tools (Not a Pipeline)

| Tool | Role |
|------|------|
| `scripts/calculate_metrics.py` | core metrics → `metadata.tsv` |
| `scripts/calculate_metrics.R` | same, R/Matrix |
| `scripts/inspect_qc_metadata.py` | read-only cohort summary |
| `assets/gene_sets/*` | hbb / chrY gene lists |
| `assets/qc_thresholds.example.yaml` | template for **user-edited** thresholds |

`--run-scrublet` on Python script: **ask before using**.

```bash
# Typical pilot — metrics only
python .../calculate_metrics.py \
  --matrix-dir <dir> --sample-id PILOT --species human \
  --output-dir result/01-qc/01-calculate_metrics/PILOT
```

## After Metrics: Report Template

Use the template in `references/human-in-the-loop.md`:

- observations (numbers);
- flags (sex mismatch, high hbb, depth outlier);
- **questions for the user** (numbered);
- optional threshold table with **estimated** loss — label as not yet applied.

## Language Choice

| Context | Reference |
|---------|-----------|
| scanpy / h5ad | `references/python-scanpy.md` |
| Seurat | `references/r-seurat.md` |
| threshold methods | `references/filtering-strategies.md` |

Pick one canonical metadata schema across languages (`n_genes`, `n_UMIs`, `mito_frac`, …).

## Anti-Patterns

- Running full cohort filter + merge in one agent turn
- Picking thresholds without showing per-sample distributions
- Treating bundled scripts as end-to-end QC
- Hiding cutoffs inside opaque helpers
- Merge-first global QC without per-sample review (legacy atlas reproduction excepted)

## Deliverables (Stage-Dependent)

Only produce what the current confirmed stage needs:

| After stage | Deliverable |
|-------------|-------------|
| B | `metadata.tsv`, `metrics_summary.json` |
| C | diagnosis PDFs/PNGs |
| D | threshold proposal table (no filter yet) |
| E | filtered checkpoint + `filter_summary` |
| Sign-off | `QC_summary.tsv` + documented per-sample decisions |

## External References

- Rich metrics example (R): `<project-root>/scripts/calculate_metrics_extended.R`
- Legacy contrast (avoid as default): `spatial_data/.../run_merging_samples_and_QC.py`
