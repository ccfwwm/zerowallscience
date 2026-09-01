---
name: sc-tenifold-knockout
description: Run auditable in-silico gene knockout experiments from non-tumor single-cell RNA-seq data with scTenifoldKnk. Use for raw-count validation, cell-type stratified knockout plans, R/MCP execution, reproducibility artifacts, figures, result review, and follow-up wet-lab design. This skill produces computational hypotheses and human-reviewable protocols; it never claims a real knockout or runs physical equipment.
license: GPL-3.0-or-later
allowed-tools: read write edit search grep shell python r search_mcp_tools run_in_context get_run monitor_run cancel_run
metadata:
  method: scTenifoldKnk
  method_version: "1.0.3"
  source: https://github.com/cailab-tamu/scTenifoldKnk
---

# scTenifoldKnk virtual knockout

Use this skill for a reproducible, non-tumor single-cell virtual knockout workflow.
The result is a network-perturbation hypothesis, not evidence that a biological
knockout occurred. Keep that distinction in every table, figure, and manuscript.

## Execution contract

- Use ZeroWall `read`, `search`, `python`, `r`, `run_in_context`, `get_run`,
  `monitor_run`, and `cancel_run` by their actual names.
- Prefer the configured R MCP (`rdatalinux R MCP`) for long or memory-intensive
  jobs. Use `run_in_context` for resumable remote jobs. Use local `r` only for
  small validation or smoke tests.
- Do not install packages automatically. First probe `R.version.string`,
  `requireNamespace("scTenifoldKnk", quietly = TRUE)`,
  `packageVersion("scTenifoldKnk")`, and `sessionInfo()`.
- Inputs must be authorized ZeroWall project Artifacts or project-relative files.
  Never scan `.env` files or read arbitrary machine paths.
- Network access, public database queries, remote execution, large writes, and
  any physical experiment are approval-gated. Physical equipment is out of scope.

## Required workflow

1. Initialize a project with `project-scaffold` and `reproducible-research`.
2. Validate raw counts and metadata with `scripts/validate_inputs.py`.
3. Use `singlecell-qc` to inspect per-sample QC. Do not silently apply filters;
   record threshold decisions and retain an unfiltered checkpoint.
4. Define non-tumor cell populations and strata as `cell_type x condition` (or
   an explicitly justified alternative). Check sample and donor replication.
5. Generate a plan with `scripts/create_plan.py`, including target genes,
   seeds, subsampling, controls, FDR, and execution context.
6. Run `scripts/run_scTenifoldKnk.R` through the selected R MCP or a managed Run.
   For large cohorts, use multiple seeds and independent subsamples.
7. Register all outputs as Artifacts. Generate PDF and PNG figures and matching
   source tables with `publication-figures` and `figure-provenance`.
8. Use `bio-tools` MCP for gene, GO, Reactome, UniProt, and PubMed evidence.
   Use `bio-plausibility` and `citation-reviewer` to audit claims.
9. Generate manuscript sections with `paper-to-report`; include methods,
   limitations, negative results, and the computational-only disclaimer.
10. Use `experimental-design` to produce a human-reviewable validation package.

## R runner contract

`scripts/run_scTenifoldKnk.R` accepts a project-relative input (`.rds`, `.RData`,
`.h5ad`, `.mtx`, `.tsv`, or `.csv`), an optional metadata table, a target gene, and
configuration values. It requires raw counts with genes in rows and cells in
columns. For `.h5ad`, the selected R environment must provide `zellkonverter`
and `SingleCellExperiment`; for `.mtx`, pass `--features` and `--barcodes` when
the MatrixMarket file does not contain dimnames. It writes `manifest.json`, `parameters.json`, `session-info.txt`,
`diff-regulation.tsv`, `significant-genes.tsv`, `wt-network.rds`,
`ko-network.rds`, `manifold-alignment.tsv`, and publication-ready figures when
the plotting packages are available. Existing outputs are never overwritten;
choose a new run directory.

## Review gates

Return one of `pass`, `pass_with_warnings`, `blocked`, or
`requires_human_review`. Block execution when the matrix is not raw counts, the
target gene is absent, strata have no biological replication, or required R
packages are missing. A single run without stability analysis is exploratory.

## References

- Read `references/method-and-parameters.md` for the algorithm and parameter
  interpretation.
- Read `references/review-checklist.md` before accepting results or writing a
  manuscript.
- Use the official sources in `references/sources.md` for citations.
