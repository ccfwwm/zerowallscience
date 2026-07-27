---
name: reasoning-trace
description: Use when the user asks whether every substantive claim in a report or manuscript is backed by an artifact or run in the workspace — binding each claim to the code/data/figure that produced it and flagging claims with no support. Emits a review block whose findings bind to artifacts so the research graph draws claim→artifact edges. Verifies traceability, never "correctness".
---

# Reasoning-trace review

Assert that **every substantive claim traces to an artifact or run** — a figure,
a script, a data file, or a logged execution in the workspace. This is the
evidence-binding half of traceability: where `traceability-review` checks that
*numbers* have a source, this binds *each claim* to the specific artifact that
supports it, so the binding becomes a durable claim→artifact edge in the research
graph. You verify traceability, not truth — never imply the report is error-free.

Read `traceability-review`'s Check 2/3 first; the mechanics of finding a claim's
source (data files, notebook output, `.zerowall/provenance.jsonl`) are the same.

## What to do

1. List the report's substantive claims — results, comparisons, conclusions the
   reader is expected to rely on (not background or motivation).
2. For each claim, find the workspace artifact that produces or contains its
   support: the script that computed it, the figure that shows it, the data file
   it summarizes. Read `.zerowall/provenance.jsonl` (one JSON record per line:
   `{path, version, ts, tool, content, …}`) to resolve which file is which.
3. Emit one finding per claim:
   - `ok` — the claim traces to an artifact. Set `artifactPath` to that
     artifact's workspace-relative path (with `/` separators) so the persisted
     claim **binds to that artifact's latest version** and the graph draws the
     edge.
   - `warn` — the claim has no traceable artifact. Quote the sentence; leave
     `artifactPath` unset. An unsupported headline result may be `error`.

## Output contract

End the reply with exactly one fenced block, kept as the LAST thing in the
message:

```review
{"findings":[{"level":"ok","check":"reasoning_trace","title":"Warming trend traces to the trend script","evidence":"\"a 0.21 °C/decade increase\" ← analysis/trend.py output","artifactPath":"analysis/trend.py"},{"level":"warn","check":"reasoning_trace","title":"Attribution claim has no artifact","evidence":"\"driven primarily by anthropogenic forcing\" — no script or data in the workspace supports this"}],"note":"Reasoning-trace review — bound each claim to its artifact where one exists. Absence of findings is not a guarantee of correctness."}
```

- `check` is always `reasoning_trace`.
- `artifactPath` is the workspace-relative path of the supporting artifact; set it
  on `ok` findings so the claim→artifact edge appears in the graph. Omit it when
  the claim is unsupported.
- The note must never claim the report has no errors.
