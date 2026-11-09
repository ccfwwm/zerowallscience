#!/usr/bin/env Rscript
# Per-sample scRNA QC metric calculation (Matrix / base R).
#
# Human-in-the-loop tool: computes metrics and writes metadata.tsv.
# Does NOT apply filtering thresholds.
#
# Bundled with singlecell-qc skill.
# Example:
#   Rscript calculate_metrics.R \
#     --matrix-dir data/cellranger/SAMPLE/outs/raw_feature_bc_matrix \
#     --sample-id SAMPLE \
#     --species human \
#     --output-dir result/01-qc/01-calculate_metrics/SAMPLE

suppressPackageStartupMessages({
  if (!requireNamespace("jsonlite", quietly = TRUE)) {
    stop("Package 'jsonlite' is required.")
  }
  if (!requireNamespace("Matrix", quietly = TRUE)) {
    stop("Package 'Matrix' is required.")
  }
})

`%||%` <- function(a, b) if (!is.null(a)) a else b

script_dir <- {
  args <- commandArgs(trailingOnly = FALSE)
  file_arg <- sub("^--file=", "", args[grep("^--file=", args)])
  if (length(file_arg) > 0) {
    dirname(normalizePath(file_arg[[1]], winslash = "/", mustWork = FALSE))
  } else {
    getwd()
  }
}
skill_root <- normalizePath(file.path(script_dir, ".."), winslash = "/", mustWork = FALSE)
if (!dir.exists(file.path(skill_root, "assets", "gene_sets"))) {
  configured_root <- Sys.getenv("SINGLECELL_QC_SKILL_ROOT", unset = "")
  if (nzchar(configured_root)) {
    skill_root <- normalizePath(configured_root, winslash = "/", mustWork = FALSE)
  }
}
if (!dir.exists(file.path(skill_root, "assets", "gene_sets"))) {
  stop("Cannot locate bundled gene sets. Set SINGLECELL_QC_SKILL_ROOT to the installed skill directory.")
}
gene_sets <- file.path(skill_root, "assets", "gene_sets")

parse_args <- function() {
  args <- commandArgs(trailingOnly = TRUE)
  out <- list(
    matrix_dir = NULL,
    sample_id = NULL,
    species = "human",
    output_dir = NULL,
    min_genes = 50,
    hq_n_genes = 500
  )
  i <- 1
  while (i <= length(args)) {
    key <- args[[i]]
    if (key %in% c("--matrix-dir", "--sample-id", "--species", "--output-dir")) {
      out[[gsub("-", "_", sub("^--", "", key))]] <- args[[i + 1]]
      i <- i + 2
    } else if (key == "--min-genes") {
      out$min_genes <- as.integer(args[[i + 1]]); i <- i + 2
    } else if (key == "--hq-n-genes") {
      out$hq_n_genes <- as.integer(args[[i + 1]]); i <- i + 2
    } else if (key %in% c("-h", "--help")) {
      cat(paste(
        "Usage: Rscript calculate_metrics.R",
        "--matrix-dir DIR --sample-id ID --output-dir DIR",
        "[--species human|mouse] [--min-genes 50] [--hq-n-genes 500]\n"
      ))
      quit(save = "no", status = 0)
    } else {
      stop("Unknown argument: ", key)
    }
  }
  if (is.null(out$matrix_dir) || is.null(out$sample_id) || is.null(out$output_dir)) {
    stop("Required: --matrix-dir, --sample-id, --output-dir")
  }
  out
}

read_gene_list <- function(path) {
  if (!file.exists(path)) return(character())
  lines <- readLines(path, warn = FALSE)
  lines <- trimws(lines)
  lines[nzchar(lines) & !grepl("^#", lines)]
}

read_10x_counts <- function(matrix_dir) {
  counts <- Matrix::readMM(file.path(matrix_dir, "matrix.mtx.gz"))
  counts <- as(counts, "CsparseMatrix")
  features <- read.table(file.path(matrix_dir, "features.tsv.gz"), header = FALSE)
  barcodes <- read.table(file.path(matrix_dir, "barcodes.tsv.gz"), header = FALSE)
  rownames(counts) <- make.unique(features$V2)
  colnames(counts) <- barcodes$V1
  counts
}

fraction_score <- function(counts, genes, denom) {
  genes <- intersect(genes, rownames(counts))
  if (length(genes) == 0) return(rep(0, ncol(counts)))
  num <- Matrix::colSums(counts[genes, , drop = FALSE])
  out <- num / denom
  out[!is.finite(out)] <- 0
  out
}

opts <- parse_args()
counts <- read_10x_counts(opts$matrix_dir)

n_genes <- Matrix::colSums(counts > 0)
keep <- n_genes >= opts$min_genes
counts <- counts[, keep, drop = FALSE]
n_genes <- n_genes[keep]

metadata <- data.frame(
  sample_id = opts$sample_id,
  barcode = colnames(counts),
  n_genes = as.integer(n_genes),
  n_UMIs = as.numeric(Matrix::colSums(counts)),
  stringsAsFactors = FALSE,
  row.names = colnames(counts)
)

mt_pattern <- if (identical(opts$species, "mouse")) "^mt-" else "^MT-"
mito_genes <- grep(mt_pattern, rownames(counts), value = TRUE)
rb_genes <- grep("^(RPS|RPL)", rownames(counts), value = TRUE)

metadata$mito_frac <- fraction_score(counts, mito_genes, metadata$n_UMIs)
metadata$pct_counts_rb <- 100 * fraction_score(counts, rb_genes, metadata$n_UMIs)

hbb_file <- file.path(gene_sets, paste0("hbb_genes_", opts$species, ".txt"))
metadata$hbb_score <- fraction_score(counts, read_gene_list(hbb_file), metadata$n_UMIs)

if (identical(opts$species, "human")) {
  chry_file <- file.path(gene_sets, "chrY_genes_human.txt")
  metadata$chrY_frac <- fraction_score(counts, read_gene_list(chry_file), metadata$n_UMIs)
}

metadata$is_HQ <- metadata$n_genes >= opts$hq_n_genes
metadata$ambient_frac <- NA_real_
metadata$doublet_score <- NA_real_
metadata$predicted_doublet <- FALSE
metadata$phase <- NA_character_
metadata$s_score <- NA_real_
metadata$g2m_score <- NA_real_

# Optional extensions — enable in project scripts when packages/data exist:
# - celda::decontX for ambient_frac (HQ cells)
# - DoubletFinder / scDblFinder for doublet_score
# - Seurat::CellCycleScoring for phase/s_score/g2m_score
# - STARsolo velocyto for nuclear_frac

dir.create(opts$output_dir, recursive = TRUE, showWarnings = FALSE)
write.table(
  metadata,
  file = file.path(opts$output_dir, "metadata.tsv"),
  sep = "\t", quote = FALSE, row.names = TRUE, col.names = TRUE
)

summary <- list(
  sample_id = opts$sample_id,
  n_cells = nrow(metadata),
  median_n_genes = stats::median(metadata$n_genes),
  median_n_UMIs = stats::median(metadata$n_UMIs),
  median_mito_frac = stats::median(metadata$mito_frac),
  n_HQ = sum(metadata$is_HQ)
)
jsonlite::write_json(summary, file.path(opts$output_dir, "metrics_summary.json"), auto_unbox = TRUE, pretty = TRUE)

message("Wrote metrics for ", opts$sample_id, ": ", nrow(metadata), " cells -> ", opts$output_dir)
