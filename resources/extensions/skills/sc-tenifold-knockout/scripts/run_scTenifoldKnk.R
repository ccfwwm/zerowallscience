#!/usr/bin/env Rscript

args <- commandArgs(trailingOnly = TRUE)
get_arg <- function(name, default = NULL) {
  prefix <- paste0("--", name, "=")
  hit <- args[startsWith(args, prefix)]
  if (length(hit) == 0L) return(default)
  sub(prefix, "", hit[[1L]], fixed = TRUE)
}
required <- function(name) {
  value <- get_arg(name)
  if (is.null(value) || !nzchar(value)) stop(sprintf("--%s is required", name), call. = FALSE)
  value
}
as_int <- function(name, default) as.integer(get_arg(name, as.character(default)))
as_num <- function(name, default) as.numeric(get_arg(name, as.character(default)))

input_path <- normalizePath(required("input"), mustWork = TRUE)
output_dir <- normalizePath(required("output"), mustWork = FALSE)
target <- required("target")
metadata_path <- get_arg("metadata")
if (!is.null(metadata_path) && nzchar(metadata_path)) metadata_path <- normalizePath(metadata_path, mustWork = TRUE)
if (dir.exists(output_dir) && length(list.files(output_dir, all.files = TRUE, no.. = TRUE)) > 0L) {
  stop("output directory is not empty; choose a new run directory to preserve existing artifacts", call. = FALSE)
}
dir.create(output_dir, recursive = TRUE, showWarnings = FALSE)
fig_dir <- file.path(output_dir, "figures")
dir.create(fig_dir, recursive = TRUE, showWarnings = FALSE)

if (!requireNamespace("scTenifoldKnk", quietly = TRUE)) {
  stop("missing_runtime: scTenifoldKnk is not installed in the selected R environment", call. = FALSE)
}
if (!requireNamespace("jsonlite", quietly = TRUE)) {
  stop("missing_runtime: jsonlite is required by the ZeroWall runner", call. = FALSE)
}

read_counts <- function(path) {
  ext <- tolower(tools::file_ext(path))
  if (ext == "rds") {
    object <- readRDS(path)
    if (inherits(object, "Seurat")) {
      if (!requireNamespace("Seurat", quietly = TRUE)) stop("Seurat is required to read this RDS", call. = FALSE)
      return(Seurat::GetAssayData(object, assay = Seurat::DefaultAssay(object), layer = "counts"))
    }
    if (is.matrix(object) || inherits(object, "Matrix")) return(object)
    stop("RDS must contain a Seurat object or a numeric count matrix", call. = FALSE)
  }
  if (ext %in% c("rdata", "rda")) {
    env <- new.env(parent = emptyenv())
    loaded <- load(path, envir = env)
    for (name in loaded) {
      object <- get(name, envir = env)
      if (inherits(object, "Seurat")) {
        if (!requireNamespace("Seurat", quietly = TRUE)) stop("Seurat is required to read this RData", call. = FALSE)
        return(Seurat::GetAssayData(object, assay = Seurat::DefaultAssay(object), layer = "counts"))
      }
      if (is.matrix(object) || inherits(object, "Matrix")) return(object)
    }
    stop("RData contains no Seurat object or numeric count matrix", call. = FALSE)
  }
  if (ext == "mtx") {
    if (!requireNamespace("Matrix", quietly = TRUE)) stop("Matrix is required to read MTX", call. = FALSE)
    matrix <- Matrix::readMM(path)
    features_path <- get_arg("features")
    barcodes_path <- get_arg("barcodes")
    if (!is.null(features_path) && !is.null(barcodes_path)) {
      features <- read.delim(normalizePath(features_path, mustWork = TRUE), header = FALSE, stringsAsFactors = FALSE)
      barcodes <- read.delim(normalizePath(barcodes_path, mustWork = TRUE), header = FALSE, stringsAsFactors = FALSE)
      if (nrow(features) != nrow(matrix) || nrow(barcodes) != ncol(matrix)) stop("features/barcodes dimensions do not match MTX", call. = FALSE)
      rownames(matrix) <- as.character(features[[ncol(features)]])
      colnames(matrix) <- as.character(barcodes[[1L]])
    }
    return(matrix)
  }
  if (ext == "h5ad") {
    if (!requireNamespace("zellkonverter", quietly = TRUE)) stop("missing_runtime: zellkonverter is required to read h5ad", call. = FALSE)
    object <- zellkonverter::readH5AD(path, use_hdf5 = FALSE)
    if (!requireNamespace("SingleCellExperiment", quietly = TRUE)) stop("missing_runtime: SingleCellExperiment is required to read h5ad", call. = FALSE)
    assay_names <- SingleCellExperiment::assayNames(object)
    count_name <- if ("counts" %in% assay_names) "counts" else assay_names[[1L]]
    if (is.null(count_name) || !nzchar(count_name)) stop("h5ad contains no expression assay", call. = FALSE)
    return(SummarizedExperiment::assay(object, count_name))
  }
  delimiter <- if (ext %in% c("tsv", "txt")) "\t" else ","
  table <- read.table(path, header = TRUE, row.names = 1, sep = delimiter, check.names = FALSE, comment.char = "", quote = "\"", fill = TRUE)
  as.matrix(table)
}

counts <- read_counts(input_path)
if (is.null(rownames(counts))) stop("count matrix must have gene row names", call. = FALSE)
if (is.null(colnames(counts))) stop("count matrix must have cell column names", call. = FALSE)
if (anyDuplicated(rownames(counts))) stop("gene identifiers must be unique", call. = FALSE)
numeric_counts <- suppressWarnings(as.numeric(counts))
if (any(!is.finite(numeric_counts)) || any(numeric_counts < 0) || any(abs(numeric_counts - round(numeric_counts)) > 1e-8)) {
  stop("count matrix must contain non-negative integer-like raw counts", call. = FALSE)
}
if (!(target %in% rownames(counts))) stop(sprintf("target gene not found: %s", target), call. = FALSE)

if (!is.null(metadata_path) && nzchar(metadata_path)) {
  metadata <- read.table(metadata_path, header = TRUE, row.names = 1, sep = "\t", check.names = FALSE, comment.char = "")
  if (nrow(metadata) != ncol(counts)) stop("metadata rows must equal matrix cells", call. = FALSE)
  if (!all(rownames(counts) %in% rownames(metadata))) warning("metadata row names do not match all cell names")
}

seed <- as_int("seed", 123L)
set.seed(seed)
params <- list(
  gKO = target,
  qc_mtThreshold = as_num("qc-mt-threshold", 0.1),
  qc_minLSize = as_int("qc-min-library-size", 1000L),
  nc_nNet = as_int("n-net", 10L),
  nc_nCells = as_int("n-cells", 500L),
  td_K = as_int("td-k", 3L),
  seed = seed,
  fdr = as_num("fdr", 0.05)
)
jsonlite::write_json(params, file.path(output_dir, "parameters.json"), auto_unbox = TRUE, pretty = TRUE)
writeLines(capture.output(sessionInfo()), file.path(output_dir, "session-info.txt"))

result <- scTenifoldKnk::scTenifoldKnk(
  countMatrix = counts,
  gKO = params$gKO,
  qc_mtThreshold = params$qc_mtThreshold,
  qc_minLSize = params$qc_minLSize,
  nc_nNet = params$nc_nNet,
  nc_nCells = params$nc_nCells,
  td_K = params$td_K
)

diff <- as.data.frame(result$diffRegulation)
utils::write.table(diff, file.path(output_dir, "diff-regulation.tsv"), sep = "\t", quote = FALSE, row.names = FALSE)
sig <- diff[!is.na(diff$p.adj) & diff$p.adj < params$fdr, , drop = FALSE]
utils::write.table(sig, file.path(output_dir, "significant-genes.tsv"), sep = "\t", quote = FALSE, row.names = FALSE)
if (!is.null(result$tensorNetworks$WT)) saveRDS(result$tensorNetworks$WT, file.path(output_dir, "wt-network.rds"))
if (!is.null(result$tensorNetworks$KO)) saveRDS(result$tensorNetworks$KO, file.path(output_dir, "ko-network.rds"))
if (!is.null(result$manifoldAlignment)) utils::write.table(as.data.frame(result$manifoldAlignment), file.path(output_dir, "manifold-alignment.tsv"), sep = "\t", quote = FALSE, row.names = FALSE)

if (requireNamespace("ggplot2", quietly = TRUE) && nrow(diff) > 0L) {
  top <- head(diff[order(-abs(diff$FC)), , drop = FALSE], 20L)
  p <- ggplot2::ggplot(top, ggplot2::aes(x = reorder(gene, FC), y = FC)) + ggplot2::geom_col(fill = "#4C78A8") + ggplot2::coord_flip() + ggplot2::theme_minimal(base_size = 8) + ggplot2::labs(title = paste("Virtual KO:", target), x = "Gene", y = "FC")
  ggplot2::ggsave(file.path(fig_dir, "top-differential-regulation.pdf"), p, width = 6, height = 5, device = grDevices::cairo_pdf)
  ggplot2::ggsave(file.path(fig_dir, "top-differential-regulation.png"), p, width = 6, height = 5, dpi = 300)
  if (all(c("Z", "p.adj", "gene") %in% names(diff))) {
    diff$log_p_adj <- -log10(pmax(diff$p.adj, .Machine$double.xmin))
    q <- ggplot2::ggplot(diff, ggplot2::aes(Z, log_p_adj)) + ggplot2::geom_point(alpha = 0.65, size = 0.8) + ggplot2::theme_classic(base_size = 8) + ggplot2::labs(title = paste("Virtual KO:", target), x = "Z", y = "-log10 adjusted p")
    ggplot2::ggsave(file.path(fig_dir, "volcano.pdf"), q, width = 6, height = 5, device = grDevices::cairo_pdf)
    ggplot2::ggsave(file.path(fig_dir, "volcano.png"), q, width = 6, height = 5, dpi = 300)
  }
}

manifest <- list(schema = 1L, method = "scTenifoldKnk", target = target, input = basename(input_path), genes = nrow(counts), cells = ncol(counts), significantGenes = nrow(sig), parameters = params, computationalOnly = TRUE, status = "requires_human_review", generatedAt = format(Sys.time(), tz = "UTC", usetz = TRUE))
jsonlite::write_json(manifest, file.path(output_dir, "manifest.json"), auto_unbox = TRUE, pretty = TRUE)
cat(jsonlite::toJSON(manifest, auto_unbox = TRUE, pretty = TRUE), "\n")
