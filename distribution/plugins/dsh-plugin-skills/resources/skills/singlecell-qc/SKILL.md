---
name: singlecell-qc
description: Use when designing, reviewing, or implementing single-cell RNA-seq
  QC in Python or R with a human-in-the-loop, data-driven approach. Trigger for
  scRNA QC metrics, per-sample diagnosis, threshold discussion,
  mitochondrial/ambient/doublet assessment, MAD vs fixed cutoffs, or refactoring
  automated merge-first QC. The analyst confirms key decisions at each
  step—agents must inspect data, propose options, and wait for approval before
  filtering, doublet removal, or merging. Not a turnkey pipeline skill.
---

## ZeroWall runtime

Use only the tools exposed by the active DSH session. Load skills with the `skill` tool. Local Python dependencies are managed through `python_environment`; the executable and dependency paths come from the Host runtime service. Resource scripts read `ZEROWALL_PYTHON_EXECUTABLE`, `ZEROWALL_PYTHON_SITE_PACKAGES` and `ZEROWALL_PYTHON_ENV_ROOT` when they need explicit runtime paths. Never reconstruct an installation path or alter system Python. Remote workflows use the live `research_workflow` and `r_files` schemas; missing remote capabilities remain unavailable. Loading instructions does not execute code, install dependencies, enable external models or activate upstream CLI hooks.

# Single-Cell QC


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
