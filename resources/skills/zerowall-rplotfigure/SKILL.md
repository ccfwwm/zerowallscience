---
name: zerowall-rplotfigure
description: Use FigureYa for reproducible scientific figures and paper-ready reports.
whenToUse: For FigureYa catalog, search, planning, execution, manifests, images, and reports.
---

Use `mcp__rmcp__rplotfigure__*`. Start with catalog/search/describe, then validate a plan before running. Treat `run_id` as the async lifecycle key and use `rplotfigure_wait_job` until the task reaches a terminal state. On success, ZeroWall automatically downloads the complete FigureYa manifest into the current local workspace under `figureya/<run_id>/`; report those local paths and concise metadata. FigureYa images are local artifacts and must not be sent as model image input. Use manifest/result/image tools when a specific artifact is needed; those image results are also saved locally and exposed as paths. Never return or reconstruct base64 in the conversation. FigureYa writes and cancellations require the tool confirmation contract. If a generic `rplatform__r_get_job_result` is used with a FigureYa `run_id`, the server resolves it to the underlying job for compatibility.

