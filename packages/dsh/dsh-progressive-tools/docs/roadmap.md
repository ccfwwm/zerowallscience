# Maintenance priorities

These are priorities, not scheduled commitments.

| Priority | Work | Completion evidence |
| --- | --- | --- |
| Done in 0.7.0 | Accept host runtime `0.2.0-rc.1` and its `deferLoading` field | Required checks pass on that baseline; stable-proxy still omits deferred catalog tools and keeps the flag on the stable surface. `0.1.7-rc.2` is no longer accepted |
| Done in 0.6.0 | Accept host runtime `0.1.7-rc.2` | Required checks and peer validation pass on that baseline; `0.1.5-rc.1` is no longer accepted |
| Done in 0.5.0 | Remove duplicated discovery and dispatch results | Required checks pass; 73 regression tests. Paid task cost is still unmeasured |
| Done in 0.4.0 | Adapt to runtime 0.1.5-rc.1 | Required checks and peer validation pass; 46 regression tests |
| Next | Paid A–E task benchmark | Same tasks, model, and host config; report success, total cost, cache, searches, and reread cost. The offline helper exists; the paid run does not |
| Done in this checkout | Code-mode model budget behind `resultBudget` | `run_code` model text is replaced after post-execute; the program value stays intact |
| Done in 0.7.0 | Native deferred-tool schema | Host `ToolSchema.deferLoading` is public. The compatibility test records the field and the stable-proxy request rule |
| Blocked | Paid A–E task cost | A model route, comparable sessions, and an explicit price config |
| Next | Expand recovery and pipeline scenarios | Real interpreter, cancellation, non-text results, storage resume and compaction evidence |
| Conditional | Cache catalog indexing | Large-catalog measurements show ranking overhead is material |
| Ongoing | Verify new host releases | Version-specific type, lifecycle and request regression matrix |

Freeze feature growth in dynamic mode until a concrete deployment needs it.
Do not introduce an external ranking service before measuring whether lexical
search is the limiting factor. The [dated assessment](upstream-capability-review.md)
explains the current architectural gap and alternatives.

Continue active development when target deployments have large tool catalogs
and measurements show useful results without unacceptable task failures.
If the host supplies equivalent stable discovery, prefer migrating or
contributing the remaining tests upstream. If real deployments show little
benefit, move to maintenance rather than adding unrelated features.
