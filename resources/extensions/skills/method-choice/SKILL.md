---
name: method-choice
description: Use when the user asks whether the statistical method or test in a plan, analysis, or report is the right choice for the data — paired vs independent tests, parametric assumptions vs the distribution, multiple-comparison correction, group count vs test. You EXTRACT a structured description of the analysis; ZeroWall's deterministic engine judges the fit. Flags method-fit risks; never certifies the analysis is correct.
license: MIT
metadata:
  zerowall:
    schema_version: 1
    version: 7.0.0-1
    source: bundled
zerowall:
  schema_version: 1
  version: 7.0.0-1
  source: bundled
  binding: method_check_evaluate
  deterministic: true
  domains: [general]
  research_stages: [analysis, validation]
  roles: [critic, validator]
  evidence_types: [project-data, computational]
  outputs: [validation-plan, risk-map]
  side_effects: read_only
---

# Method-choice review

Judge whether the analysis **method fits the data** — the check a generic
reviewer explicitly declines to make. Your job here is narrow and important:
**extract** a structured description of one analysis from the plan/report. You do
**not** decide the verdict. ZeroWall's deterministic rule engine
(`method_check_evaluate`) does, so the judgement is reproducible and never
invented — the same context always yields the same findings.

## What to extract

Read the methods/analysis section (and the code, if present) and identify:

- **design** — how the observations relate: `paired` / `repeated measures` /
  `within-subject` / `crossover`, or `independent` / `between-subject` /
  `parallel groups`.
- **outcomeType** — `continuous`, `binary`, `count`, or `categorical`.
- **groups** — how many groups/conditions are compared (a number).
- **sampleSize** — total N (a number), when stated.
- **normality** — what is known about the outcome distribution: `assumed`,
  `unknown`, `tested_normal`, or `tested_nonnormal`.
- **testUsed** — the test/model actually run, verbatim where possible
  (e.g. `independent t-test`, `paired t-test`, `one-way ANOVA`,
  `linear regression`, `logistic regression`, `Mann-Whitney U`, `Kruskal-Wallis`,
  `chi-square`).
- **nComparisons** — how many hypothesis tests/comparisons were made (a number).
- **correctionApplied** — whether a multiple-comparison correction (Bonferroni,
  Holm, FDR) was applied (`true`/`false`).

Include only the fields you can actually determine — omit the rest rather than
guessing. Do not infer a paired design from wishful reading; if the text is
silent, leave the field out.

## Execute the check

Discover `method_check_evaluate` with `tool_search`, then dispatch the exact returned tool with `{ "context": { ...extracted fields... } }`. Do not rely on a fenced `method` block to trigger execution: no automatic block-to-tool bridge is installed.

The deterministic result contains `checker`, `status`, `findings`, `missing`, and `scope`. Preserve `insufficient_information` and `flagged`. `no_listed_issue` means only that the implemented rules found no issue in the supplied metadata; it never certifies scientific applicability. Include source locations for the extracted fields in the explanation. This read-only tool does not automatically persist reviewer cards or an approved evidence record.

For MR include instrumentCount, minimumFStatistic, ancestryChecked, buildChecked, harmonized and sampleOverlapChecked when documented. For coloc include leadSnpOnly, completeRegion, requiredFields and matchedLd for SuSiE. For pseudobulk include observationUnit and donorMetadata. Missing fields remain omitted.

## After the verdict

When the user asks, explain each returned finding in prose — what the rule means
and how to fix the mismatch (e.g. "the design is paired, so use a paired t-test
or Wilcoxon signed-rank"). Explaining is your job; deciding is the engine's.
Never tell the user the method is "correct" or the analysis is "sound" — the
engine checks specific method-fit rules only, and absence of findings is not a
guarantee.
