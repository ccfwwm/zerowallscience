---
name: zerowall-mr
description: ZeroWall MR analysis with prepared, harmonized instruments,
  versioned Wald/IVW/Egger runners, persistent remote jobs and verified result
  retrieval.
---

## ZeroWall runtime

Use only the tools exposed by the active DSH session. Load skills with the `skill` tool. Local Python dependencies are managed through `python_environment`; the executable and dependency paths come from the Host runtime service. Resource scripts read `ZEROWALL_PYTHON_EXECUTABLE`, `ZEROWALL_PYTHON_SITE_PACKAGES` and `ZEROWALL_PYTHON_ENV_ROOT` when they need explicit runtime paths. Never reconstruct an installation path or alter system Python. Remote workflows use the live `research_workflow` and `r_files` schemas; missing remote capabilities remain unavailable. Loading instructions does not execute code, install dependencies, enable external models or activate upstream CLI hooks.

# Mendelian randomization and colocalization

Discover the live `research_workflow` schema and the connected `r.genetics` operations before submitting work. Use `r_files` for registered remote inputs and outputs. No local Study, Gate or viewer service is required. A missing remote operation is unavailable, even when this package contains its documentation.

Validate ancestry, genome build, sample overlap, effect units, harmonized alleles and instrument strength from source evidence. Prepared MR supports Wald, IVW and MR-Egger when the live server declares them; colocalization requires complete-region summary data and explicit priors. Do not represent clumping, raw harmonization, MVMR, two-step MR or SuSiE as implemented without the matching live schema.

Persist request/job identifiers from the actual response. Poll or recover the existing job rather than resubmitting after a timeout. Verify manifests, file sizes and hashes before interpreting result tables. Preserve partial methods and stop reasons. Numeric completion is not evidence of a causal claim.

Read [genetics execution](references/genetics-runner.md) for the input and recovery checklist. [Colocalization](references/merged/zerowall-colocalization/workflow.md) is a related workflow.
