---
name: sc-tenifold-knockout
description: Run an auditable, research-question-driven single-cell virtual knockout workflow with scTenifoldKnk. Use when the user provides target genes, reference genes, or a research topic and needs public-data discovery, raw-count validation, QC, cell-type stratification, R/MCP execution, reproducibility artifacts, figures, review, and follow-up design. This skill produces computational hypotheses and human-reviewable protocols; it never claims a real knockout or runs physical equipment.
license: GPL-3.0-or-later
allowed-tools: read write edit search grep shell python r r_upload_workspace_file search_mcp_tools run_in_context get_run monitor_run cancel_run
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

- Use ZeroWall `read`, `search`, `python`, `r`, `r_upload_workspace_file`, `run_in_context`, `get_run`,
  `monitor_run`, and `cancel_run` by their actual names.
- Prefer the configured R MCP (`rdatalinux R MCP`) for long or memory-intensive
  jobs. Use `run_in_context` for resumable remote jobs. Use local `r` only for
  small validation or smoke tests.
- Do not install packages automatically. First probe `R.version.string`,
  `requireNamespace("scTenifoldKnk", quietly = TRUE)`,
  `packageVersion("scTenifoldKnk")`, and `sessionInfo()`.
- Inputs must be authorized ZeroWall project Artifacts or project-relative files.
  Never scan `.env` files or read arbitrary machine paths.
- When a local matrix is already present in the current session workspace, use
  `r_upload_workspace_file` to transfer it into the rdatalinux project before
  validation or execution. Pass a relative `local_path`, an explicit
  project-relative `remote_path`, and `confirm: true`; never inline large
  base64 payloads in the conversation.
- Register the matching rdatalinux project first with `r_register_project`
  (using the study ID), then upload the matrix to `data/raw/` and verify the
  returned manifest byte count and SHA-256 before submitting an R job.
- Before execution, prefer `r_validate_sc_tenifold_runtime`. When the
  structured rdatalinux tools are available, submit with
  `r_submit_sc_tenifold_knockout` and track with `r_get_sc_tenifold_run`,
  `r_get_sc_tenifold_manifest`, and `r_cancel_sc_tenifold_run`. Use the
  generic `r_submit_script` path only for older MCP deployments that do not
  expose the structured contract.
- Network access, public database queries, remote execution, large writes, and
  any physical experiment are approval-gated. Physical equipment is out of scope.

## Automatic intake workflow

The user does not need to upload an expression matrix. Accept any of:

- `targetGenes`: analyze these genes exactly as supplied after gene-name normalization;
- `referenceGenes`: rank nearby or cell-type-relevant candidates and retain the rationale;
- `researchQuestion`: extract organism, tissue, cell type, and condition clues, then recommend candidates.

If the user drops in a PDF, DOCX, PPTX, XLSX, or other ordinary document, do
not pass it to scTenifoldKnk as an expression matrix. Route document
understanding to MinerU or the Files extraction tools and ask for a gene,
research question, or a supported count dataset. Advanced users may provide a
project-relative `inputPath` (H5AD, RDS, MTX, CSV/TSV), or an uploaded
`attachmentId`; the file is copied into the controlled project and remains
blocked until raw-count validation and QC finish.

Start with `sc_tenifold_knockout_intake`, which creates a project when the session has no project, searches CELLxGENE Census and GEO/ENA, scores candidates, and returns a study state. Use the actual `sc_tenifold_knockout_search_genes`, `sc_tenifold_knockout_search_datasets`, `sc_tenifold_knockout_preview_dataset`, and acquisition tools exposed by the Host plugin. Do not fabricate an accession or claim that data was downloaded when an adapter is unavailable.

For a public processed matrix smaller than 2 GB, continue automatically under the approved network policy. For FASTQ/SRA, downloads above 2 GB, remote execution, or jobs likely to exceed 30 minutes, create an acquisition or run plan and request confirmation to execute that plan. Preserve rejected candidates and warnings in the study provenance.

If a provider MCP is unavailable, report the missing capability and use an already configured official HTTPS/API adapter where possible. Do not decide capability by looking for an “MCP slot”, and do not silently switch to an unrelated runtime.

## Required workflow

1. If no project is associated with the session, let the intake service create a controlled project with immutable `data/raw` and provenance directories.
2. Validate the acquired dataset and raw counts with `scripts/validate_inputs.py` and the Host `validateDataset` contract. A syntactically readable file is not enough: H5AD/RDS/MTX remain `raw_counts_unverified` until the selected Python/R runtime confirms the counts assay/layer, target gene, dimensions, and metadata.
3. Use `singlecell-qc` to inspect per-sample QC. Do not silently apply filters;
   record threshold decisions and retain an unfiltered checkpoint.
4. Define non-tumor cell populations and strata as `cell_type x condition` (or
   an explicitly justified alternative). Check sample and donor replication.
5. Generate a plan with `scripts/create_plan.py`, including target genes,
   seeds, subsampling, controls, FDR, and execution context.
6. Run through the selected R MCP or a managed Run. Prefer the structured
   `r_submit_sc_tenifold_knockout` contract so the remote platform owns input
   validation, package checks, job isolation, and result manifests; retain
   `scripts/run_scTenifoldKnk.R` for local/legacy execution. For large cohorts,
   use multiple seeds and independent subsamples.
7. Register all outputs as Artifacts. Generate PDF and PNG figures and matching
   source tables with `publication-figures` and `figure-provenance`.
8. Use `bio-tools` MCP for gene, GO, Reactome, UniProt, and PubMed evidence.
   Use `bio-plausibility` and `citation-reviewer` to audit claims.
9. Generate manuscript sections with `paper-to-report`; include methods,
   limitations, negative results, and the computational-only disclaimer.
10. Use `experimental-design` to produce a human-reviewable validation package. Never execute wet-lab equipment or represent a virtual knockout as a completed biological experiment.

The legacy `sc_tenifold_knockout_validate/plan/run/status/cancel/collect/review/report` tools remain compatible during migration. Prefer the same-named tools exposed by the dedicated `@zerowallscience/plugin-singlecell`; MinerU is only a document parser and must not be used as the single-cell execution boundary.

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
