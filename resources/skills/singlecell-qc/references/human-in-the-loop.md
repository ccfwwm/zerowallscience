# Human-in-the-Loop QC

This reference defines how agents and scripts should behave: **data informs, humans decide**.

## Core Principle

QC is not a button to press. It is an iterative conversation between:

```text
data inspection  ->  human judgment  ->  small reversible action  ->  re-inspect
```

Bundled scripts and project scripts compute and visualize. They do **not** replace the analyst's review of distributions, biology, and sample metadata.

## What the Human Owns

These decisions must come from the analyst, not from agent defaults:

| Decision | Why human |
|----------|-----------|
| which metrics to compute | tissue, species, available side data differ |
| whether a sample looks usable | metadata errors, failed libraries, batch disasters |
| filter thresholds per sample | depth and mito distributions vary |
| whether to remove doublets aggressively | tumor/high-RNA samples behave differently |
| whether ambient correction is needed | cannot infer from code alone |
| when to merge | only after per-sample sign-off |
| exceptions for outlier samples | biology, not statistics, may justify keeping cells |

The agent's job: **surface evidence and options**. The analyst's job: **confirm or override**.

## Iterative Loop (Default)

Do not plan a 4-script end-to-end run unless the user explicitly asks.

```text
Step A  Inspect inputs (matrix type, species, sample list, metadata)
   ↓
Step B  Compute metrics for 1–3 pilot samples OR summarize existing metadata
   ↓
Step C  Present findings table + suggested issues (stop here)
   ↓  ← human confirms metrics scope, pilot samples, next metrics
Step D  Generate diagnosis figures for confirmed samples
   ↓
Step E  Propose threshold *candidates* with expected cell loss (stop here)
   ↓  ← human confirms or edits thresholds per sample
Step F  Apply filter only after explicit approval; save checkpoint
   ↓
Step G  Re-summarize; human decides merge / doublet / ambient next steps
```

Each arrow labeled "stop here" is a **hard gate**. Do not skip gates to "save time".

## Agent Behavior Rules

When this skill is active:

1. **Inspect before coding** — read metadata, check one sample's distributions, report facts.
2. **Pilot first** — default to 1–3 representative samples (good / borderline / bad if known), not the full cohort.
3. **Propose, don't impose** — give threshold *ranges* and predicted loss; never silently pick cutoffs.
4. **Ask structured questions** — use `AskQuestion` or a short numbered list when choices are real forks.
5. **No silent heavy runs** — do not run filter, Scrublet, decontX, or merge on full data unless user says so.
6. **Show numbers** — median, MAD, percentiles, cells removed per sample; not just "looks fine".
7. **Flag conflicts** — e.g. chrY high but metadata says female; high hbb in lung parenchyma.
8. **Preserve reversibility** — keep pre-filter `metadata.tsv` and counts; filtering writes new artifacts.
9. **Script = one stage** — write or run `01-calculate_metrics` first; wait before `03-filter_cells`.
10. **Owner-editable output** — generated scripts must have visible threshold blocks the user can tweak.

## Presentation Template

After metrics computation, report in this shape:

```markdown
## QC 初检 — <sample_id>

**数据**: raw 10x | n_cells=... | median n_genes=... | median mito=...

**观察**:
- ...
- ...

**需你确认**:
1. 是否继续算 <metric>（如 hbb / ambient / doublet）？
2. 该样本是否纳入后续过滤？
3. mito 上限倾向：固定 20% / 按 MAD / 其他？

**若采用建议阈值** (仅估算，未执行):
| 规则 | 预计保留 | 预计剔除 |
```

After user confirms, run the next small step only.

## Threshold Proposal (Not Application)

When suggesting cutoffs, show per sample:

```text
sample_id | median_genes | p95_mito | MAD_mito_hi | fixed_20%_loss | mad_loss
```

Let the user pick column strategy per sample. Heterogeneous cohorts often need **different** rules per sample.

Read `references/filtering-strategies.md` for methods; present as options with trade-offs.

## Scripts Are Tools, Not Pipelines

| Script | Agent may run without asking | Requires human confirmation first |
|--------|------------------------------|-----------------------------------|
| `inspect_qc_metadata.py` | yes (read-only summary) | — |
| `calculate_metrics.py/R` (core only) | pilot samples only | full cohort |
| `calculate_metrics` + `--run-scrublet` | no | yes |
| any `filter_cells` script | no | yes |
| merge QC-passed | no | yes |

## Red Flags — Stop and Ask

- Single sample with >50% predicted loss under proposed thresholds
- Mito median >15% for nominally healthy parenchyma
- chrY/metadata sex mismatch
- hbb_score high in non-blood tissue
- Orders-of-magnitude depth difference vs sibling samples
- User said "run QC" but did not specify tissue, species, or matrix type

## What "Done" Means

QC is not "done" when a filtered h5ad exists. It is done when the **analyst has reviewed** diagnosis outputs and **explicitly accepted** the filter summary for each sample (or documented exceptions).

Minimal sign-off artifact: `QC_summary.tsv` + user message or `QC_decisions.md` noting per-sample thresholds used.
