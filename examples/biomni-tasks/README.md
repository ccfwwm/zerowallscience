# Biomni-style task set

Five research tasks stated in natural language, each with a machine-checkable
rubric, plus a scorer that grades the evidence a run left behind rather than the
prose it wrote.

Each task points at one of the bundled example projects in `examples/`. **Four of
the five operate on simulated data** — `crispr-screen`, `enzyme-engineering`,
`extremophile`, and `immunotherapy` all come from seeded generators, and nothing
derived from them is evidence about any real gene, protein, organism, or patient.
Only `climate-warming-rate` uses real observations (NASA GISTEMP v4). Every task
file records this in `data_is_simulated` and `data_provenance`, and each rubric
requires the report to state it.

## Layout

```
tasks/<task-id>.json   one task: prompt, target example, provenance, rubric
evaluate.py            the scorer
```

## Run it

The Python command on this machine is `python`, not `python3`.

```bash
python examples/biomni-tasks/evaluate.py --list
python examples/biomni-tasks/evaluate.py --task crispr-hit-calling --workspace /path/to/workspace
```

Compare submissions on one task, or score a whole suite laid out as
`ROOT/<task-id>/`:

```bash
# two agents, same task
python examples/biomni-tasks/evaluate.py --task crispr-hit-calling \
  --workspace runs/agent-a --workspace runs/agent-b

# every task at once
python examples/biomni-tasks/evaluate.py --suite runs/agent-a \
  --json runs/agent-a/score.json --markdown runs/agent-a/score.md
```

`--min-score 0.8` makes the command exit 1 when any submission falls below that
fraction, which is what you want in CI. Exit codes: `0` success, `1` a submission
was below `--min-score` (or a self-test expectation broke), `2` a usage error.

## What a workspace has to contain

A workspace is the directory the agent worked in. Paths in a rubric are relative
to it — typically `results/`, `figures/`, and `report.md`. The task prompt asks
for exactly the files its rubric checks.

One formatting requirement is load-bearing: **each headline number must sit on
the same line as the label naming it**, as in `- hits called: 22`. That is what
lets the scorer tie a claim to a value instead of guessing which number in a
paragraph belongs to which phrase. The prompts state this.

## How scoring works

Every criterion is worth one point and every criterion is always in the
denominator. Six kinds:

| kind | what it proves |
| --- | --- |
| `artifact` | the file exists, is non-empty, and actually parses (JSON object, CSV with the required columns and a row-count floor, or a PNG with a valid signature and an `IEND` chunk) |
| `json_value` | an exact literal at a JSON pointer — used for the `data_is_simulated` flag |
| `json_number` | a number at a JSON pointer is within tolerance of a known reference |
| `report_number` | the report names a label, a number on that line matches the value the run itself wrote to a file, and that value is within tolerance of the reference |
| `evidence_link` | the report cites the artifacts by path, and each cited artifact exists and is non-empty |
| `report_contains` | a provenance statement is present (simulated-data disclosure, dataset citation). Never used for a numeric claim. |

Two tolerances appear on `report_number`. `tolerance` is how much rounding the
prose may do against the number the run recorded — the report may say `0.933` for
`0.933333`. `truth_tolerance` is how far the run's own value may sit from the
reference: zero where the number is a fact about the input data or a threshold
the task fixed, looser where a different but defensible method would legitimately
move it. Each rubric's `notes` field says which is which and why.

The scorer also derives two summary statistics from the same criteria, so they
cannot disagree with the score: **artifact integrity** (`artifact` criteria
passed) and **evidence coverage** (`report_number` plus `evidence_link` criteria
passed — the claims tied back to a file that exists).

## What the scorer refuses to credit

- A missing file scores 0 for its criterion. There is no "skipped" status and no
  code path that removes a criterion from the denominator.
- A criterion that cannot be evaluated — unparseable JSON, an unreadable file, a
  JSON pointer that is not there, a value of the wrong type, an unknown criterion
  kind, or any unexpected exception — scores 0. It never becomes a pass.
- A label with a fabricated number next to it fails, because `report_number`
  corroborates against the file the run produced. A label with no number at all
  on its line fails too.
- An empty workspace scores 0/N on all five tasks.

## Self-test

```bash
python examples/biomni-tasks/evaluate.py --self-test
```

This builds fixtures in a temp directory, removes them on exit, and asserts 39
expectations in two layers. Layer one runs a synthetic task against synthetic
workspaces: empty scores 0, complete scores full marks, and each of a deleted
artifact, a zero-byte artifact, an altered number, a fabricated report number, a
label with no number, corrupt JSON, a missing pointer, a wrong-typed value, a
non-PNG `.png`, a short CSV, an unknown criterion kind, and a criterion that
raises all score strictly less than full. It also checks that scoring the same
workspace twice prints identical output.

Layer two covers the five shipped tasks. For each one it asserts an empty
workspace scores 0, then builds a full-marks fixture from a source independent of
the rubric — the example's committed `baseline/results.json` for the four
simulated tasks, and the committed GISTEMP CSV recomputed with the standard
library for the climate task — and asserts it scores full marks. A wrong expected
value in a task file therefore surfaces as a failing fixture rather than as a
rubric that quietly disagrees with the example it grades. It then deletes one
required artifact and perturbs one checked number and asserts both score below
full.

The self-test exits non-zero if any expectation breaks.

## Relationship to `scripts/verify-examples.py`

`verify-examples.py` checks that the *reference* workflows still reproduce their
golden numbers. This scorer checks whether *an agent's* run produced the required
evidence. They share the tolerance shape (`abs + rel * |expected|`), the
artifact-existence-and-non-emptiness check, and the PASS/FAIL table with a
non-zero exit on failure.
