# QC Project Layout

Aligned with `code-organization`. Scripts are **staged tools**; the analyst advances stage by stage after reviewing outputs. See `human-in-the-loop.md`.

## Principle

```text
script -> result/<stage>/<script-id>/ -> figure/<stage>/<script-id>/
```

QC is checkpoint-heavy: metric tables and filtered matrices are formal `result/` artifacts, not `tmp/`.

## Recommended Stage: `01-qc`

```text
scripts/01-qc/
  01-calculate_metrics.R|py    # metrics only, no hard filtering
  02-qc_diagnosis.R|py         # figures from metadata
  03-filter_cells.R|py           # apply thresholds + optional doublet removal
  04-merge_qc_passed.R|py      # optional; only after per-sample QC
utils/
  qc_io.R|py                   # optional shared loaders
  qc_thresholds.yaml           # optional explicit threshold table
result/01-qc/
  01-calculate_metrics/<sample_id>/
    metadata.tsv.gz
    counts.mtx.gz               # optional checkpoint
  03-filter_cells/<sample_id>/
    filtered_counts.mtx.gz
    filter_summary.json
figure/01-qc/
  02-qc_diagnosis/<sample_id>/
    qc_violin.pdf
    qc_scatter_mito_genes.pdf
```

## Per-Sample vs Project-Level

| Artifact | Granularity |
|----------|-------------|
| `metadata.tsv` | per sample |
| diagnosis figures | per sample + optional cohort overview |
| filtered matrix | per sample |
| `QC_summary.tsv` | project-level |
| merged h5ad/Seurat | project-level, after QC |

## Script Header Template

```python
# Script: 03-filter_cells.py
# Purpose: per-sample cell filtering from QC metadata
# Input:  result/01-qc/01-calculate_metrics/<sample_id>/metadata.tsv
# Output: result/01-qc/03-filter_cells/<sample_id>/
# Figure: figure/01-qc/03-filter_cells/<sample_id>/
# Status: draft | validated | production
```

## Git Boundary

Do not commit large matrices. Commit:

- scripts, utils, threshold YAML;
- small `QC_summary.tsv` if intentional;
- `workflow_map.md` / `data_lineage.md` entries.

## Workflow Map Entry Example

```markdown
| Step | Script | Result | Figure |
|------|--------|--------|--------|
| QC metrics | scripts/01-qc/01-calculate_metrics.R | result/01-qc/01-calculate_metrics/ | figure/01-qc/01-calculate_metrics/ |
| QC filter | scripts/01-qc/03-filter_cells.R | result/01-qc/03-filter_cells/ | figure/01-qc/03-filter_cells/ |
```
