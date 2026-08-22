---
name: method-choice
description: Use when the user asks whether the statistical method or test in a plan, analysis, or report is the right choice for the data — paired vs independent tests, parametric assumptions vs the distribution, multiple-comparison correction, group count vs test. You EXTRACT a structured description of the analysis; ZeroWall's deterministic engine judges the fit. Flags method-fit risks; never certifies the analysis is correct.
license: MIT
zerowall:
  schema_version: 1
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

## Output contract

End the reply with exactly one fenced block, and keep it as the LAST thing in the
message. The block is the extracted context, **not** a verdict:

```method
{"context":{"design":"repeated measures (pre/post)","outcomeType":"continuous","groups":2,"sampleSize":24,"normality":"tested_nonnormal","testUsed":"independent t-test","nComparisons":1,"correctionApplied":false},"note":"Design and test read from the Methods section; distribution from the Shapiro-Wilk result in analysis/normality.txt."}
```

- `context` carries the fields above; `note` is your one-line account of **where
  in the workspace** you read each value (so the verdict is auditable).
- The app runs the deterministic engine over `context` and renders the resulting
  `method_choice` findings as reviewer cards, which persist to the workspace's
  science database and appear in the research graph.

## After the verdict

When the user asks, explain each rendered finding in prose — what the rule means
and how to fix the mismatch (e.g. "the design is paired, so use a paired t-test
or Wilcoxon signed-rank"). Explaining is your job; deciding is the engine's.
Never tell the user the method is "correct" or the analysis is "sound" — the
engine checks specific method-fit rules only, and absence of findings is not a
guarantee.
