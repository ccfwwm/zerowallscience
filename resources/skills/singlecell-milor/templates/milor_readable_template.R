#!/usr/bin/env Rscript
# Script: generated readable R/miloR analysis
# Analysis: {{ANALYSIS_NAME}}

suppressPackageStartupMessages({
  library(reticulate)
  library(Matrix)
  library(SingleCellExperiment)
  library(miloR)
  library(tidyverse)
  library(glue)
  library(scales)
  library(qs)
  library(ggbeeswarm)
})


# ==============================================================================
# 0. Setup
# ==============================================================================

project_dir <- {{PROJECT_DIR}}
setwd(project_dir)

Sys.setenv(RETICULATE_PYTHON = {{RETICULATE_PYTHON}})

analysis_name <- {{ANALYSIS_NAME_R}}
h5ad_file <- {{INPUT_H5AD}}
lineage_col <- {{LINEAGE_COL}}
lineage_value <- {{LINEAGE_VALUE}}
celltype_col <- {{CELLTYPE_COL}}
sample_col <- {{SAMPLE_COL}}
group_col <- {{GROUP_COL}}
control_group <- {{CONTROL_GROUP}}
reduced_obsm <- {{REDUCED_OBSM}}
umap_obsm <- {{UMAP_OBSM}}

spatial_fdr_cutoff <- 0.1
plot_font_family <- "Arial"
milo_k <- 30
milo_d <- 30
milo_prop <- 0.1

out_root <- {{OUT_ROOT}}
fig_root <- {{FIG_ROOT}}
metadata_root <- file.path(out_root, "group_metadata")

dir.create(out_root, recursive = TRUE, showWarnings = FALSE)
dir.create(fig_root, recursive = TRUE, showWarnings = FALSE)
dir.create(metadata_root, recursive = TRUE, showWarnings = FALSE)

theme_set(theme_classic(base_family = plot_font_family))

anndata <- reticulate::import("anndata", convert = FALSE)


# ==============================================================================
# 1. h5ad -> SingleCellExperiment conversion
# ==============================================================================

read_selected_sce_from_h5ad <- function(h5ad_file) {
  message(glue("Reading h5ad: {h5ad_file}"))
  adata <- anndata$read_h5ad(h5ad_file)

  obs <- reticulate::py_to_r(adata$obs)
  cell_ids <- rownames(obs)
  if (is.null(cell_ids)) {
    cell_ids <- reticulate::py_to_r(adata$obs_names$to_list())
    rownames(obs) <- cell_ids
  }

  required_obs <- c(sample_col, group_col, celltype_col)
  if (lineage_col != "") {
    required_obs <- unique(c(required_obs, lineage_col))
  }
  missing_obs <- setdiff(required_obs, colnames(obs))
  if (length(missing_obs) > 0) {
    stop(glue("h5ad missing obs columns: {paste(missing_obs, collapse = ', ')}"), call. = FALSE)
  }

  x_reduced <- reticulate::py_to_r(adata$obsm$get(reduced_obsm))
  x_umap <- reticulate::py_to_r(adata$obsm$get(umap_obsm))
  if (is.null(x_reduced)) {
    stop(glue("h5ad must contain obsm {reduced_obsm}"), call. = FALSE)
  }
  if (is.null(x_umap)) {
    x_umap <- matrix(NA_real_, nrow = nrow(obs), ncol = 2)
  }

  keep <- rep(TRUE, nrow(obs))
  if (lineage_col != "" && lineage_value != "") {
    keep <- obs[[lineage_col]] == lineage_value
  }

  obs_selected <- obs[keep, , drop = FALSE]
  reduced_selected <- x_reduced[keep, , drop = FALSE]
  umap_selected <- x_umap[keep, , drop = FALSE]

  obs_selected[[sample_col]] <- as.character(obs_selected[[sample_col]])
  obs_selected[[group_col]] <- as.character(obs_selected[[group_col]])
  obs_selected[[celltype_col]] <- as.character(obs_selected[[celltype_col]])
  obs_selected$celltype <- obs_selected[[celltype_col]]
  obs_selected$analysis_name <- analysis_name

  group_levels <- c(control_group, setdiff(unique(obs_selected[[group_col]]), control_group))
  obs_selected[[group_col]] <- factor(obs_selected[[group_col]], levels = group_levels)

  dummy_counts <- Matrix(0, nrow = 1, ncol = nrow(obs_selected), sparse = TRUE)
  rownames(dummy_counts) <- "dummy"
  colnames(dummy_counts) <- rownames(obs_selected)

  sce <- SingleCellExperiment(
    assays = list(counts = dummy_counts),
    colData = obs_selected,
    reducedDims = SimpleList(
      PCA = reduced_selected,
      UMAP = umap_selected
    )
  )

  message(glue("Selected cells: {ncol(sce)}"))
  message(glue("Group order: {paste(levels(colData(sce)[[group_col]]), collapse = ', ')}"))
  message(glue("Celltype column: {celltype_col}"))
  print(sort(table(colData(sce)[[celltype_col]], useNA = "ifany"), decreasing = TRUE))
  return(sce)
}


save_group_metadata <- function(sce) {
  meta <- as.data.frame(colData(sce))

  obs_columns <- data.frame(
    column = colnames(meta),
    class = vapply(meta, function(x) class(x)[1], character(1)),
    n_unique = vapply(meta, function(x) length(unique(as.character(x))), integer(1)),
    stringsAsFactors = FALSE
  )
  write.csv(obs_columns, file.path(metadata_root, "obs_columns.csv"), row.names = FALSE)

  group_distribution <- as.data.frame(table(meta[[group_col]], useNA = "ifany"))
  colnames(group_distribution) <- c("group", "n_cells")
  write.csv(group_distribution, file.path(metadata_root, "group_distribution.csv"), row.names = FALSE)

  sample_group_counts <- as.data.frame(table(meta[[sample_col]], meta[[group_col]]))
  colnames(sample_group_counts) <- c("sample", "group", "n_cells")
  sample_group_counts <- sample_group_counts[sample_group_counts$n_cells > 0, ]
  write.csv(sample_group_counts, file.path(metadata_root, "sample_group_counts.csv"), row.names = FALSE)

  sample_level_metadata <- meta %>%
    mutate(across(everything(), as.character)) %>%
    group_by(.data[[sample_col]]) %>%
    summarise(
      n_cells = dplyr::n(),
      across(
        everything(),
        ~ {
          values <- sort(unique(.x))
          if (length(values) <= 5) paste(values, collapse = "|") else paste0(length(values), " unique")
        }
      ),
      .groups = "drop"
    )
  write.csv(sample_level_metadata, file.path(metadata_root, "sample_level_metadata.csv"), row.names = FALSE)
}


# ==============================================================================
# 2. MiloR helpers
# ==============================================================================

perform_milo <- function(sce, group_test, comparison_name) {
  sub_sce <- sce[, colData(sce)[[group_col]] %in% group_test]

  sample_table <- table(colData(sub_sce)[[sample_col]])
  sample_keep <- names(sample_table)[sample_table > 3]
  sub_sce <- sub_sce[, colData(sub_sce)[[sample_col]] %in% sample_keep]

  colData(sub_sce)[[group_col]] <- factor(as.character(colData(sub_sce)[[group_col]]), levels = group_test)
  colData(sub_sce)[[celltype_col]] <- as.character(colData(sub_sce)[[celltype_col]])
  colData(sub_sce)$celltype <- as.character(colData(sub_sce)[[celltype_col]])

  message(glue(
    "Milo {group_test[2]} vs {group_test[1]}: {ncol(sub_sce)} cells, ",
    "{length(unique(colData(sub_sce)[[sample_col]]))} samples"
  ))
  print(table(colData(sub_sce)[[group_col]], colData(sub_sce)[[sample_col]]))

  milo.obj <- Milo(sub_sce)
  milo.obj <- buildGraph(milo.obj, k = milo_k, d = milo_d, reduced.dim = "PCA")
  milo.obj <- makeNhoods(
    milo.obj,
    prop = milo_prop,
    k = milo_k,
    d = milo_d,
    refined = TRUE,
    reduced_dims = "PCA"
  )
  milo.obj <- calcNhoodDistance(milo.obj, d = milo_d, reduced.dim = "PCA")
  milo.obj <- countCells(milo.obj, samples = sample_col, meta.data = as.data.frame(colData(sub_sce)))

  milo.design <- as.data.frame(xtabs(as.formula(glue("~ {group_col} + {sample_col}")), data = as.data.frame(colData(sub_sce))))
  milo.design <- milo.design[milo.design$Freq > 0, ]
  colnames(milo.design)[colnames(milo.design) == sample_col] <- "sample"
  colnames(milo.design)[colnames(milo.design) == group_col] <- "group"
  rownames(milo.design) <- milo.design$sample
  milo.design <- milo.design[colnames(nhoodCounts(milo.obj)), , drop = FALSE]
  milo.design$group <- factor(milo.design$group, levels = group_test)
  write.csv(milo.design, file.path(metadata_root, glue("milo_design_{comparison_name}.csv")), row.names = FALSE)

  da_results <- testNhoods(
    milo.obj,
    design = ~ group,
    design.df = milo.design,
    fdr.weighting = "none"
  )
  da_results <- annotateNhoods(milo.obj, da_results, coldata_col = celltype_col)
  da_results$celltype <- da_results[[celltype_col]]
  da_results$SpatialFDR <- da_results$PValue

  milo.obj <- buildNhoodGraph(milo.obj)
  return(list(milo.obj = milo.obj, da_results = da_results, sce = sub_sce))
}


load_or_make_sce <- function(cache_file) {
  if (file.exists(cache_file)) {
    message(glue("Loading cached SCE: {cache_file}"))
    sce <- qs::qread(cache_file)
    colData(sce)[[celltype_col]] <- as.character(colData(sce)[[celltype_col]])
    colData(sce)$celltype <- as.character(colData(sce)[[celltype_col]])
    return(sce)
  }

  sce <- read_selected_sce_from_h5ad(h5ad_file)
  qs::qsave(sce, cache_file)
  message(glue("Saved cached SCE: {cache_file}"))
  return(sce)
}


load_or_run_milo <- function(sce, group_test, comparison_name) {
  cache_file <- file.path(out_root, glue("miloR_{analysis_name}_{comparison_name}.qs"))
  if (file.exists(cache_file)) {
    message(glue("Loading cached Milo result: {cache_file}"))
    return(qs::qread(cache_file))
  }

  milo_result <- perform_milo(sce, group_test = group_test, comparison_name = comparison_name)
  qs::qsave(milo_result, cache_file)
  message(glue("Saved cached Milo result: {cache_file}"))
  return(milo_result)
}


# ==============================================================================
# 3. Load data and save group metadata
# ==============================================================================

selected_sce <- load_or_make_sce(file.path(out_root, glue("{analysis_name}_selected_sce.qs")))
save_group_metadata(selected_sce)

{{COMPARISON_BLOCKS}}

message("Done: R/miloR analysis finished.")
