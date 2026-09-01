# Python / scanpy QC

## Environment

Prefer project-local pixi/conda env with: `scanpy`, `anndata`, `numpy`, `pandas`, `matplotlib`, `scrublet`.

Use bundled script first:

```bash
python <skill-root>/scripts/calculate_metrics.py --help
```

## Load 10x Matrix

```python
import scanpy as sc

# prefer raw for QC metric computation
adata = sc.read_10x_mtx(
    "data/cellranger/SAMPLE/outs/raw_feature_bc_matrix",
    var_names="gene_symbols",
    make_unique=True,
)
```

From existing h5ad: load and ensure `.X` is raw counts (not log-normalized).

## Core Metrics

```python
species = "human"  # or "mouse"
mt_prefix = "MT-" if species == "human" else "mt-"

adata.var["mt"] = adata.var_names.str.startswith(mt_prefix)
adata.var["rb"] = adata.var_names.str.startswith(("RPS", "RPL"))

sc.pp.calculate_qc_metrics(
    adata,
    qc_vars=["mt", "rb"],
    percent_top=None,
    log1p=False,
    inplace=True,
)

# map to canonical names when saving
adata.obs["n_genes"] = adata.obs["n_genes_by_counts"]
adata.obs["n_UMIs"] = adata.obs["total_counts"]
adata.obs["mito_frac"] = adata.obs["pct_counts_mt"] / 100.0
```

## Extended Metrics (hemoglobin)

```python
from pathlib import Path

def read_gene_list(path):
    return [g.strip() for g in Path(path).read_text().splitlines() if g.strip()]

skill_root = Path("<skill-root>")
hbb = read_gene_list(skill_root / "assets/gene_sets/hbb_genes_human.txt")
hbb = [g for g in hbb if g in adata.var_names]
adata.obs["hbb_score"] = adata[:, hbb].X.sum(axis=1).A1 / adata.obs["n_UMIs"]
```

## HQ Gate + Scrublet (per sample)

```python
import scrublet as scr

hq = adata.obs["n_genes"] >= 500
counts = adata[hq].X

scrub = scr.Scrublet(counts, expected_doublet_rate=0.06)
scores, preds = scrub.scrub_doublets(min_counts=2, min_cells=3, n_prin_comps=30)

adata.obs["doublet_score"] = float("nan")
adata.obs["predicted_doublet"] = False
adata.obs.loc[hq, "doublet_score"] = scores
adata.obs.loc[hq, "predicted_doublet"] = preds
```

## Filter Cells

```python
# example fixed thresholds — prefer per-sample MAD in production
keep = (
    (adata.obs["n_genes"] >= 200)
    & (adata.obs["n_genes"] <= 6000)
    & (adata.obs["n_UMIs"] >= 400)
    & (adata.obs["mito_frac"] < 0.20)
    & (~adata.obs["predicted_doublet"])
)
adata = adata[keep].copy()
sc.pp.filter_genes(adata, min_cells=10)
```

## Save Checkpoint

```python
out = "result/01-qc/03-filter_cells/SAMPLE"
adata.write_h5ad(f"{out}/filtered.h5ad", compression="gzip")
adata.obs.to_csv(f"{out}/metadata.tsv", sep="\t")
```

## Figures (publication defaults)

```python
import matplotlib as mpl
mpl.rcParams.update({
    "font.family": "Arial",
    "pdf.fonttype": 42,
    "ps.fonttype": 42,
})

import matplotlib.pyplot as plt
import seaborn as sns

fig, ax = plt.subplots(figsize=(4, 4))
ax.scatter(
    adata.obs["mito_frac"],
    adata.obs["n_genes"],
    s=1,
    alpha=0.3,
    rasterized=True,
)
fig.savefig("figure/01-qc/02-qc_diagnosis/SAMPLE/qc_scatter.pdf", dpi=300)
```

## Anti-Pattern: Merge-First QC

Do not copy this pattern for new work:

```python
merged = adatas[0].concatenate(adatas[1:])
sc.pp.filter_cells(merged, min_genes=180)  # global on merged
fc.scrublet_doublet_removal_10X(merged)    # global doublet
```

Split into per-sample metrics → filter → merge.

## Optional: SoupX (ambient RNA)

Requires raw + filtered matrices and cluster labels or auto-estimation. Implement in project `utils/` when user requests ambient correction; not in bundled minimal script.
