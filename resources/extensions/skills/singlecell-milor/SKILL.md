---
name: singlecell-milor
description: Use when running or preparing single-cell MiloR differential abundance analysis from h5ad/AnnData or SingleCellExperiment data, especially when the user asks for MiloR, neighbourhood DA, nhood graphs, beeswarm plots, group-vs-control comparisons, or h5ad to R/SCE conversion.
---

# Single-Cell MiloR

## ZeroWall execution contract

These host rules override workflow examples below when they differ.

- Use ZeroWall tools by their actual names and inspect inputs with bundled scripts before starting analysis.
- Use `python` or `r` for short inspection work and `run_in_context` with Run Manager for full MiloR jobs.
- Resolve credentials only through **Settings > Credentials**. Never create, scan, or load project `.env` files and never print secret values.
- Keep network access, large writes, overwrites, and destructive cleanup approval-gated.
- Do not install Python, R, Bioconductor, or other dependencies automatically. Report the exact missing runtime or package instead.
- Keep generated scripts, caches, tables, and figures inside the active project or Session workspace.

## Overview

Use this skill to prepare readable, human-editable R/miloR workflows from single-cell AnnData inputs. The goal is not a black-box runner: inspect the data first, confirm the biological celltype level and group comparison design, then generate a clear R script with explicit comparison blocks, cached intermediate objects, group metadata tables, DA tables, and publication-ready figures.

## Required Preflight

Before generating or running a MiloR workflow:

1. Inspect the input h5ad with `scripts/inspect_h5ad_for_milor.py`.
2. Report available `obs` columns, `obsm` embeddings, `group` levels, and sample x group counts.
3. Ask the user which celltype annotation layer should drive MiloR neighbourhood annotation, for example `anno_3_r`, `anno_4_r`, `anno_lv3`, or `final_celltype`.
4. Confirm the lineage/filter scope, sample column, group column, control group, and treatment/disease groups.

Do not assume the celltype layer from file names. The same endothelial subset may need `anno_3_r`, `anno_4_r`, `anno_lv3`, or `final_celltype` depending on the question.

## Group Design Rules

Prefer one comparison per non-control group:

| Required item | Default |
|---|---|
| `sample_col` | `sample` |
| `group_col` | `group` |
| control group | ask or infer only when obvious |
| comparisons | each non-control group vs control |
| minimum sample cell count | keep samples with >3 cells in the selected subset |

Always save group-related metadata:

- `obs_columns.csv`
- `group_distribution.csv`
- `sample_group_counts.csv`
- `sample_level_metadata.csv`
- per-comparison `milo_design_<comparison>.csv`

These files let the user audit the design matrix and avoid silent group mistakes.

## Recommended Workflow

1. Run inspection:
   ```bash
   python <skill-root>/scripts/inspect_h5ad_for_milor.py \
     --h5ad data/cross_specics/mouse/03_new_final_integration3.h5ad \
     --output-dir output/milor_preflight/mouse
   ```
2. Ask the user to choose the celltype layer and group design.
3. Generate a readable R script:
   ```bash
   python <skill-root>/scripts/generate_milor_r_script.py \
     --project-dir /path/to/project \
     --input-h5ad data/cross_specics/mouse/03_new_final_integration3.h5ad \
     --output-script scripts/Cross_specis_analysis/endo_analysis/03_x_mouse_endo_milor.R \
     --analysis-name mouse_endo_anno_4_r \
     --lineage-col anno_1_r \
     --lineage-value Endothelial \
     --celltype-col anno_4_r \
     --sample-col sample \
     --group-col group \
     --control-group Normoxia
   ```
4. Review the generated R script before running it. Keep explicit plot blocks when the user wants readable scripts.
5. Run the R script and verify cached `.qs`, DA `.csv`, group metadata `.csv`, and figure `.png/.pdf` outputs.

## R/miloR Conventions

- Convert h5ad to `SingleCellExperiment` with `reticulate`, preserving all `obs` fields in `colData`.
- Use `X_scANVI` as the default graph embedding and `X_umap_scANVI` as the UMAP reduced dimension when available.
- Use a one-row sparse dummy count matrix when MiloR only needs neighbourhood counts and embeddings.
- Cache selected SCE objects and MiloR results with `qs`.
- Annotate DA neighbourhoods with the user-chosen celltype column; preserve optional secondary annotation columns when useful.
- Set `SpatialFDR <- PValue` only when using `fdr.weighting = "none"` intentionally, and make that choice visible in the script.

## Figure Policy

Use publication-ready defaults:

- Arial text (`plot_font_family <- "Arial"`).
- PDF via `cairo_pdf`.
- PNG via `ragg::agg_png`.
- Show `logFC` legends explicitly for nhood graph and beeswarm plots.
- Rasterize only dense point layers for UMAP/scatter plots; keep text, axes, and legends vector-editable.

## Common Mistakes

- Running MiloR before confirming the celltype annotation layer.
- Treating all groups as one combined plot instead of saving each group-vs-control comparison separately.
- Hiding all plot code in loops when the user wants readable, editable scripts.
- Forgetting to export sample/group metadata, making design mistakes hard to audit.
- Dropping `obs` columns during h5ad to SCE conversion.
