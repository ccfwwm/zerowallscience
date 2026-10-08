# R / Seurat QC

## Environment

Typical packages: `Matrix`, `Seurat`, `ggplot2`, `celda` (decontX), `SingleCellExperiment`.

Use bundled script first:

```bash
Rscript <skill-root>/scripts/calculate_metrics.R --help
```

## Load 10x Raw Matrix

```r
library(Matrix)

read_10x_counts <- function(matrix_dir) {
  counts <- Matrix::readMM(file.path(matrix_dir, "matrix.mtx.gz"))
  counts <- as(counts, "CsparseMatrix")
  features <- read.table(file.path(matrix_dir, "features.tsv.gz"), header = FALSE)
  barcodes <- read.table(file.path(matrix_dir, "barcodes.tsv.gz"), header = FALSE)
  rownames(counts) <- make.unique(features$V2)
  colnames(counts) <- barcodes$V1
  counts
}
```

## Core Metrics

```r
metadata <- data.frame(
  row.names = colnames(counts),
  n_genes = Matrix::colSums(counts > 0),
  n_UMIs = Matrix::colSums(counts),
  stringsAsFactors = FALSE
)

mito_genes <- grep("^MT-", rownames(counts), value = TRUE)  # mouse: ^mt-
metadata$mito_frac <- Matrix::colSums(counts[mito_genes, , drop = FALSE]) / metadata$n_UMIs

rb_genes <- grep("^(RPS|RPL)", rownames(counts), value = TRUE)
metadata$pct_counts_rb <- 100 * Matrix::colSums(counts[rb_genes, , drop = FALSE]) / metadata$n_UMIs
```

## Extended Metrics

Reference implementation: `<project-root>/scripts/calculate_metrics_extended.R`

| Step | Metric | Function |
|------|--------|----------|
| chrY | `chrY_frac` | gene list intersection |
| nuclear | `nuclear_frac` | STARsolo Velocyto spliced/unspliced |
| ambient | `ambient_frac_decontX` | `celda::decontX` on HQ cells |
| doublet | `doublet_score` | DoubletFinder on HQ cells |
| cycle | `phase`, `s_score`, `g2m_score` | `Seurat::CellCycleScoring` |
| blood | `hbb_score` | hemoglobin gene set |

```r
skill_root <- "<skill-root>"
hbb_genes <- intersect(
  readLines(file.path(skill_root, "assets/gene_sets/hbb_genes_human.txt")),
  rownames(counts)
)
metadata$hbb_score <- Matrix::colSums(counts[hbb_genes, , drop = FALSE]) / metadata$n_UMIs
```

## HQ Gate

```r
metadata$is_HQ <- metadata$n_genes >= 500
```

Use HQ cells for decontX and DoubletFinder to stabilize estimation.

## decontX (ambient RNA)

```r
library(celda)
library(SingleCellExperiment)

sce <- SingleCellExperiment(
  assays = list(counts = counts[, metadata$is_HQ]),
  colData = metadata[metadata$is_HQ, , drop = FALSE]
)
sce <- decontX(sce)
metadata$ambient_frac <- NA_real_
metadata[rownames(colData(sce)), "ambient_frac"] <- colData(sce)$decontX_contamination
```

## DoubletFinder

Project-local `R/doubletFinder.R` may exist (GZL course). Pattern:

```r
seu <- CreateSeuratObject(counts = counts[, metadata$is_HQ], meta.data = metadata[metadata$is_HQ, ])
seu <- FindVariableFeatures(seu, selection.method = "vst", nfeatures = 2000)
# source project doubletFinder.R
# df <- doubletFinder(counts = counts[, metadata$is_HQ], select.genes = VariableFeatures(seu))
```

Prefer `scDblFinder` for new projects if DoubletFinder is not already available.

## Cell Cycle

```r
seu <- NormalizeData(seu)
seu <- CellCycleScoring(
  seu,
  s.features = intersect(cc.genes.updated.2019$s.genes, rownames(counts)),
  g2m.features = intersect(cc.genes.updated.2019$g2m.genes, rownames(counts))
)
metadata$phase <- NA_character_
metadata[rownames(seu@meta.data), "phase"] <- seu@meta.data$Phase
```

## Filter Cells

```r
keep <- with(metadata,
  n_genes >= 200 &
  n_genes <= 6000 &
  n_UMIs >= 400 &
  mito_frac < 0.20 &
  (is.na(ambient_frac) | ambient_frac < 0.25) &
  (is.na(doublet_score) | doublet_score < 0.25)  # project-specific
)
counts_filt <- counts[, keep]
```

## Save Checkpoint

```r
out_dir <- "result/01-qc/01-calculate_metrics/SAMPLE"
dir.create(out_dir, recursive = TRUE, showWarnings = FALSE)
write.table(metadata, file.path(out_dir, "metadata.tsv"),
  sep = "\t", quote = FALSE, row.names = TRUE, col.names = TRUE)
```

## Figures

```r
plot_font_family <- "Arial"
theme_set(theme_linedraw(base_family = plot_font_family))

p <- ggplot(metadata, aes(x = mito_frac, y = n_genes)) +
  geom_point(size = 0.1, alpha = 0.2, raster = TRUE) +
  scale_y_log10()

ggsave("figure/01-qc/02-qc_diagnosis/SAMPLE/qc_scatter.pdf",
  p, width = 4, height = 4, device = cairo_pdf)
```

## Seurat Object Path

If the project is Seurat-native, save filtered object:

```r
seu_filt <- CreateSeuratObject(counts = counts_filt, meta.data = metadata[keep, , drop = FALSE])
qs::qsave(seu_filt, "result/01-qc/03-filter_cells/SAMPLE/filtered.seurat.qs")
```
