# Filtering Strategies

**Human confirms thresholds before any filter script runs.** This file helps propose options; it does not authorize automatic filtering.

Choose explicitly **with the user** after reviewing diagnosis figures. Document agreed thresholds in `qc_thresholds.yaml` or a visible script block.

## Strategy Comparison

| Strategy | Pros | Cons | Best for |
|----------|------|------|----------|
| Fixed global | reproducible, comparable across studies | fails when depth varies by sample | homogeneous 10X cohort, reproducing published atlas |
| Per-sample fixed | handles known protocol differences | needs manual tuning per cohort | mixed sorting strategies |
| Per-sample MAD | adaptive to depth/outlier structure | less comparable across projects | public data, multi-lab merge |
| HQ gate + advanced | stable decontX/doublet inputs | removes low-count cells early | BM, blood-rich, high doublet rate |

## Recommended Default (new projects)

Per-sample **MAD-based** on core metrics + **per-sample Scrublet/DoubletFinder** on HQ cells — **propose first, apply only after sign-off**.

```text
HQ gate: n_genes >= 200 (or 500 for decontX)
mito: mito_frac < median + 3*MAD  (cap at 20-25% for lung)
n_genes high: n_genes < median + 3*MAD  (cap at 6000-8000)
n_UMIs low: n_UMIs >= median - 3*MAD  (floor at 300-500)
doublet: predicted_doublet == False (per sample)
optional: hbb_score < 0.05 for lung/parenchyma
```

Always compute loss rate per sample before applying.

## Fixed Cutoffs (legacy atlas style)

Example from lung merge-first pipeline:

```python
min_genes = 180
max_genes = 6000
min_counts = 400
max_counts = 100000
max_pct_mito = 20
```

Use only when reproducing that atlas or when cohort is pre-validated homogeneous.

## Per-Sample MAD (R sketch)

```r
mad_filter <- function(x, nmads = 3, type = c("lower", "upper", "both")) {
  med <- median(x, na.rm = TRUE)
  mad_val <- mad(x, na.rm = TRUE)
  if (mad_val == 0) mad_val <- sd(x, na.rm = TRUE) / 1.4826
  type <- match.arg(type)
  if (type == "lower") return(x >= med - nmads * mad_val)
  if (type == "upper") return(x <= med + nmads * mad_val)
  (x >= med - nmads * mad_val) & (x <= med + nmads * mad_val)
}
```

Apply within each `sample_id` group.

## Per-Sample MAD (Python sketch)

```python
import numpy as np
import pandas as pd

def mad_bounds(series, nmads=3):
    med = np.median(series)
    mad = np.median(np.abs(series - med))
    if mad == 0:
        mad = series.std(ddof=0) / 1.4826
    return med - nmads * mad, med + nmads * mad

def per_sample_mito_pass(df, sample_col="sample_id", mito_col="mito_frac", nmads=3, cap=0.25):
    out = []
    for sid, g in df.groupby(sample_col):
        lo, hi = mad_bounds(g[mito_col], nmads=nmads)
        hi = min(hi, cap)
        out.append(g[mito_col] <= hi)
    return pd.concat(out).sort_index()
```

## Filter Order

```text
1. optional coarse gate (n_genes >= 200)
2. mito_frac
3. n_genes / n_UMIs (low and high)
4. tissue contamination (hbb_score, etc.)
5. ambient_frac (if computed)
6. doublet removal (per sample)
7. filter_genes min_cells (on retained cells)
```

Do not normalize or scale before filtering.

## Doublet Calling

| Method | Language | Scope |
|--------|----------|-------|
| Scrublet | Python | per sample on HQ cells |
| DoubletFinder | R | per sample on HQ cells |
| scDblFinder | R/Bioc | per sample SCE |

Never run doublet detection on merged multi-sample objects unless samples are technical replicates of the same library.

## Gene Filtering

After cell filtering:

```text
min_cells = 10   # common default
```

Recompute on per-sample filtered matrix before merge. Gene sets may differ slightly per sample — expected.

## Reporting

Save per sample:

```text
cells_before
cells_after
pct_removed
median_n_genes_before/after
median_n_UMIs_before/after
thresholds_used (JSON/YAML)
```

Aggregate to `QC_summary.tsv` at project root or `result/01-qc/QC_summary.tsv`.
