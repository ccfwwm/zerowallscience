# Biomni-style benchmark

A task set and an automated scorer for judging whether an agent actually did the
research work, living in `examples/biomni-tasks/`. Biomni-style here means the
task states a goal in natural language and the grade depends on the evidence the
run left behind, not on whether the write-up reads well.

## Why the scorer is built the way it is

The failure mode worth engineering against is a scorer that flatters. A rubric
that silently drops criteria it cannot evaluate, or that credits a report for
using the phrase "FDR threshold" without checking the number beside it, will
report a high score for work that was never done. So the grading contract is
narrow and there is no permissive branch in it:

- Every criterion in a rubric is always in the denominator. There is no "skipped"
  status.
- A missing, empty, or unparseable file scores 0 for its criterion.
- A criterion that cannot be evaluated — bad JSON, a JSON pointer that is absent,
  a value of the wrong type, an unknown criterion kind, a malformed criterion, any
  unexpected exception — scores 0. The exception handler in `evaluate_criterion`
  records a failure; there is no path from an error to a pass.
- Numeric claims in prose are corroborated against the file the run wrote. A
  label with a made-up number fails; a label with no number on its line fails.

An empty workspace therefore scores 0/N on all five tasks, and the self-test
asserts that for each task rather than leaving it to inspection.

## The five tasks

`examples/biomni-tasks/tasks/<task-id>.json`, one file per task, each carrying an
`id`, a natural-language `prompt`, the `example` directory it operates on, a
`data_is_simulated` flag with a `data_provenance` note, and a `rubric`.

| Task | Example | Data | Criteria |
| --- | --- | --- | --- |
| `crispr-hit-calling` | `crispr-screen` | SIMULATED | 14 |
| `enzyme-epistasis` | `enzyme-engineering` | SIMULATED | 16 |
| `extremophile-cardinal-temperatures` | `extremophile` | SIMULATED | 17 |
| `immunotherapy-biomarker` | `immunotherapy` | SIMULATED | 17 |
| `climate-warming-rate` | `climate-trends` | real (NASA GISTEMP v4) | 18 |

82 criteria in total: 21 `artifact`, 26 `json_number`, 18 `report_number`, 7
`report_contains`, 5 `json_value`, 5 `evidence_link`.

**Four of the five tasks operate on simulated data.** The inputs for
`crispr-screen`, `enzyme-engineering`, `extremophile`, and `immunotherapy` come
from seeded generators; no cell line, protein, isolate, trial, or patient is
behind any of them, and no output of those four tasks is evidence about a real
system. The `immunotherapy` rubric additionally requires the report to state that
nothing it contains is clinical evidence. Only `climate-warming-rate` uses real
observations, and its rubric requires the report to cite GISTEMP and to say the
input is observational rather than simulated.

The tasks describe work of the same shape and difficulty as the reference
workflows in those example directories: normalization and FDR-controlled hit
calling, a regularized interaction model checked on held-out data, nonlinear
curve fitting with an exclusion rule, a response model plus a censored
time-to-event analysis, and a trend estimate on a real observational series.

## Criterion kinds

| kind | what it proves |
| --- | --- |
| `artifact` | the file exists, is non-empty, and parses: a JSON object, a CSV with the required columns and at least a floor number of rows, or a PNG with a valid 8-byte signature and an `IEND` chunk |
| `json_value` | an exact literal at a JSON pointer; used for the `data_is_simulated` flag, where `True` and `1` must not be interchangeable |
| `json_number` | a number at a JSON pointer within tolerance of a reference value |
| `report_number` | three things at once: the report has a line carrying the label, a number on that line matches the value the run wrote to a file, and that value is within tolerance of the reference |
| `evidence_link` | the report cites artifacts by path and each cited artifact exists and is non-empty |
| `report_contains` | a provenance statement is present. Used only for the simulated-data disclosure, the "not clinical evidence" statement, and the GISTEMP citation — never for a numeric claim |

Tolerance has the same shape as `scripts/verify-examples.py`:
`abs(actual - expected) <= abs_tol + rel_tol * abs(expected)`.

`report_number` carries two tolerances for two different jobs. `tolerance` is how
much rounding the prose may do relative to the number the run itself recorded, so
a report may say `0.933` for a stored `0.933333`. `truth_tolerance` is how far the
run's own value may sit from the reference value. It is zero where the number is a
fact about the input (300 genes, 451 variants, 400 patients, the record starting
in 1880) or a threshold the task fixed (FDR 0.05), and deliberately loose where a
different but defensible method would move the number (hit counts, recall,
cross-validated R², a log-rank statistic under a different fold split). Each
rubric's `notes` field states which choice was made and why.

Reference values for the four simulated tasks were taken from each example's
committed `baseline/results.json`. `climate-trends` ships no baseline, so its
reference values were computed from the committed CSV by ordinary least squares on
the annual `J-D` series: 0.083203 °C/decade over 1880–2025, 0.207357 °C/decade
over 1975–2025, and decade means of −0.216 (1880s), 0.387 (1990s) and 0.808
(2010s).

## Evidence coverage and artifact integrity

Both are derived from the criteria that were already scored, so neither can
disagree with the total.

**Artifact integrity** is the `artifact` criteria: do the claimed files exist, are
they non-empty, do they parse. A `.png` that is really text fails; a CSV missing a
required column fails; a truncated PNG with no `IEND` fails.

**Evidence coverage** is the `report_number` plus `evidence_link` criteria: is
each headline number traceable to a file that was actually produced, and does the
report cite the files it drew on. This is the check that makes a plausible-sounding
report worthless on its own — the number in the prose has to match the number in
the artifact.

## Comparison report

Scoring more than one submission prints a comparison table with each submission's
score, percentage, artifact integrity, evidence coverage, and the ids of the
criteria that failed, followed by an overall criteria-passed line. `--suite ROOT`
scores every task from `ROOT/<task-id>/` and compares by task; repeating
`--workspace` compares submissions on one task. `--json` writes the full
per-criterion report, `--markdown` writes the comparison table. Output is
deterministic: no wall-clock values, no RNG, sorted iteration wherever output is
produced, and the self-test asserts that scoring the same workspace twice yields
identical text.

## Running it

The Python command on this machine is `python`, not `python3`. Standard library
only; no dependency was added.

```bash
python examples/biomni-tasks/evaluate.py --list
python examples/biomni-tasks/evaluate.py --task crispr-hit-calling --workspace runs/agent-a
python examples/biomni-tasks/evaluate.py --suite runs/agent-a --min-score 0.8
python examples/biomni-tasks/evaluate.py --self-test
```

Exit codes: `0` success, `1` a submission fell below `--min-score` or a self-test
expectation broke, `2` a usage error.

## Verification actually performed

- `python examples/biomni-tasks/evaluate.py --self-test` exits 0 with 39
  expectations holding. It creates its fixtures in a temp directory and removes
  them on exit; no fixtures were left on disk afterward.
- The self-test's first layer scores a synthetic task against synthetic
  workspaces and asserts: empty scores 0/10, a non-existent workspace directory
  scores 0/10, a complete workspace scores 10/10, and each of a deleted artifact,
  a zero-byte artifact, an altered number, a report number contradicting the run,
  a label with no number, corrupt JSON, a deleted JSON pointer, a wrong-typed
  value, a non-PNG `.png`, a CSV below the row floor, an unknown criterion kind,
  and a criterion that raises scores strictly below full while the denominator
  stays intact.
- The second layer covers all five shipped tasks: empty workspace scores 0, a
  full-marks fixture built from a source independent of the rubric scores full
  marks, deleting one required artifact scores below full, and perturbing one
  checked number scores below full. Because those fixtures are built from the
  examples' committed baselines and from the committed GISTEMP CSV rather than
  from the rubric, a wrong expected value in a task file shows up as a failing
  fixture. This layer is what caught a real defect during development: the
  fixture report did not carry the "not clinical evidence" statement the
  `immunotherapy` rubric requires, and the self-test failed until it did.
- End-to-end on genuinely produced output rather than fixtures, for all five
  tasks. For the four simulated tasks, the example's own `workflow.py` was run
  into a fresh workspace and a report was written whose numbers were read back out
  of the produced results JSON: `crispr-hit-calling` 14/14,
  `enzyme-epistasis` 16/16, `extremophile-cardinal-temperatures` 17/17,
  `immunotherapy-biomarker` 17/17. `climate-trends` ships no workflow, so a
  throwaway analysis of the committed GISTEMP CSV was run in a temp directory
  (pandas OLS on the annual `J-D` series, reproducing 0.083203 and 0.207357
  °C/decade); `climate-warming-rate` scored 18/18. Artifact integrity and evidence
  coverage were full on all five. Nothing from these runs was written into the
  repository.
- `--json` and `--markdown` outputs were checked on a real run and contain the
  per-criterion detail and the comparison table respectively.
- Negative tests, each applied to `evaluate.py` and then reverted. Changing the
  missing-file branch of the artifact check to return a pass marked "skipped"
  broke 8 of 39 expectations and exited 1, including `empty workspace scores 0 --
  expected 0/10, got 2/10` and the same failure for all five shipped tasks.
  Separately, changing `report_number` to pass when a label is present but no
  number is on its line broke 1 of 39 and exited 1, with `a keyword with no number
  fails -- reported-threshold passed on keyword presence alone`. Both were
  restored and the self-test returned to 39 passing.

Not verified: no LLM agent has been run against these prompts, so the difficulty
calibration is an estimate from the reference workflows rather than a measurement,
and how often a real agent satisfies the same-line number formatting the
`report_number` criteria depend on is unknown. The `truth_tolerance` windows on
the method-dependent numbers (hit counts, recall, cross-validated R², the log-rank
statistic) were chosen by judgement against the committed baselines; the self-test
checks the reference values, not the width of the windows around them. The
end-to-end runs above used reports generated mechanically from each run's own
results JSON, which is the ideal case for the label-matching check — it shows the
rubric is satisfiable, not that it is easy to satisfy.
