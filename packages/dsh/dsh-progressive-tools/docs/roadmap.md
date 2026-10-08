# Maintenance priorities

These are priorities, not scheduled commitments.

| Priority | Work | Completion evidence |
| --- | --- | --- |
| Done in 0.4.0 | Adapt to runtime 0.1.5-rc.1 | Required checks and peer validation pass; 46 regression tests |
| Next | Real deployment and task benchmark | Same tasks/configuration compare native, PTC and stable-proxy; report success, total tokens, cache hits and latency |
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
