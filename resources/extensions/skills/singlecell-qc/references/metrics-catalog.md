# QC Metrics Catalog

Canonical column names for cross-language workflows. Map Seurat/scanpy native names to these when saving `metadata.tsv`.

## Core Metrics (always compute)

| Column | Definition | Human gene prefix | Mouse gene prefix |
|--------|------------|-------------------|-------------------|
| `n_genes` | genes with count > 0 per cell | — | — |
| `n_UMIs` | total UMI/counts per cell | — | — |
| `mito_frac` | mitochondrial UMIs / `n_UMIs` | `^MT-` | `^mt-` |
| `pct_counts_rb` | ribosomal UMIs / `n_UMIs` | `^RPS`, `^RPL` | same |

scanpy aliases: `n_genes_by_counts`, `total_counts`, `pct_counts_mt`, `pct_counts_rb`.

## Recommended Metrics

| Column | Definition | Notes |
|--------|------------|-------|
| `hbb_score` | hemoglobin gene UMIs / `n_UMIs` | blood contamination; use `assets/gene_sets/hbb_genes_*.txt` |
| `doublet_score` | continuous doublet score | DoubletFinder or Scrublet |
| `predicted_doublet` | logical/class doublet call | filter explicitly |
| `phase` | cell cycle phase | G1 / S / G2M |
| `s_score` | S phase score | Seurat CellCycleScoring |
| `g2m_score` | G2M phase score | Seurat CellCycleScoring |
| `is_HQ` | high-quality gate for advanced steps | common: `n_genes >= 500` |

## Extended Metrics

| Column | Definition | Requires |
|--------|------------|----------|
| `chrY_frac` | chrY gene UMIs / `n_UMIs` | `assets/gene_sets/chrY_genes_human.txt` or species list |
| `ambient_frac` | ambient RNA contamination | `celda::decontX` (R) or SoupX |
| `nuclear_frac` | intron / (intron + exon) | STARsolo Velocyto spliced/unspliced matrices |

## Derived / Workflow Columns

| Column | Definition |
|--------|------------|
| `pass_qc` | final retain flag after all filters |
| `fail_reason` | optional comma-separated reasons |
| `sample_id` | sample identifier |

## Tissue-Specific Optional Scores

Add when biologically relevant:

| Tissue | Suggested score | Genes |
|--------|-----------------|-------|
| Lung | epithelial ambient | `EPCAM`, `KRT8`, `KRT18` fraction |
| Lung | immune enrichment | `PTPRC` fraction |
| Liver | hepatocyte score | `ALB`, `APOA1` |
| PBMC/BM | RBC contamination | `hbb_score` (critical) |

Keep tissue scores in the project script or a project-local `utils/qc_gene_sets.yaml`, not in this skill, unless they become reusable.

## Metric Computation Order

```text
1. n_genes, n_UMIs
2. mito_frac, pct_counts_rb
3. hbb_score, chrY_frac (if species lists available)
4. is_HQ gate
5. ambient_frac (on HQ cells)
6. doublet_score (on HQ cells)
7. cell cycle (on HQ cells or all cells — document choice)
8. nuclear_frac (if STARsolo available)
```

## What Not To Treat As QC Metrics

- normalized expression, log1p values, scaled data;
- PCA/UMAP coordinates;
- cluster labels (downstream);
- batch-corrected embeddings.

Compute or attach these only after QC filtering unless needed for diagnosis.
