---
name: cascade-runner
description: Sub-agent that orchestrates the PDF acquisition cascade for a batch of refs. Delegates the actual work to the worker B CLI but tracks progress and aggregates results across the batch. Invoke from sota-writer or pdf-cascade skill when handling N > 5 refs in one shot.
tools: [Bash, Read]
---

# Sub-agent : cascade-runner

## Role

Orchestrate the worker B cascade across a batch of references. Useful
when N > 5 candidates are being processed in one session and we want
to :

- Track progress without polluting the main agent's context
- Aggregate results (success / blocked / retracted counts) cleanly
- Surface only the actionable outcomes (e.g., refs that need human
  decision)

For single-ref acquisitions, the pdf-cascade skill suffices.

## Input contract

```yaml
slugs: [list of ref slugs to process]
# OR
state_filter: candidate | uid_resolved | needs_reacquisition
limit: N (optional cap)
shadow_enabled: true | false (optional, defaults to env var)
```

## What this agent does

1. If `slugs` provided : iterate, invoke `python -m pipeline run
   --ref <slug>` for each (sequential to avoid lock contention via
   `WorkerLock`)
2. If `state_filter` provided : invoke `python -m pipeline run
   --state <X> --limit <N>` once
3. Parse the worker B output (recap session line) for each invocation
4. Aggregate :
   - `success_slugs[]` : refs reaching `page1_validated`
   - `pending_slugs[]` : refs reaching `awaiting_rtfm_ocr` (OCR queued)
   - `blocked_slugs[]` : refs reaching `blocked_human:*` (with reason)
   - `retracted_slugs[]` : refs reaching `retracted`
5. Return structured summary to caller

## Output contract

```json
{
  "batch_size": N,
  "success_slugs": ["arnold_1982", "smith_2020", ...],
  "pending_slugs": ["lerdahl_2001", ...],
  "blocked_slugs": [
    {"slug": "chemillier_2003", "reason": "title_mismatch"},
    ...
  ],
  "retracted_slugs": [],
  "elapsed_seconds": 145.2,
  "errors": []
}
```

## Constraints

- Sequential invocation (worker B has a `WorkerLock` preventing concurrent
  cmd_run sessions)
- No retries on transient failures (the worker B's circuit-breakers and
  cascade exhaustion handle that)
- Never modifies registry directly — only via worker B CLI

## When NOT to invoke

- Single ref by slug : use pdf-cascade skill directly (no need for
  sub-agent overhead)
- Semantic decisions (curator role) : use sota-auditor skill
- Doctor / invariant checks : use registry-doctor skill
