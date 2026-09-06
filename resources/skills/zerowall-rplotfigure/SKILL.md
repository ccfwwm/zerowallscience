---
name: zerowall-rplotfigure
description: Use FigureYa for reproducible scientific figures and paper-ready reports.
whenToUse: For FigureYa catalog, search, planning, execution, manifests, images, and reports.
---

Use `mcp__rmcp__rplotfigure__*`. Start with catalog/search/describe, then validate a plan before running. Treat `run_id` as the async lifecycle key and use `rplotfigure_wait_job` until the task reaches a terminal state. On success, the wait result contains a native MCP image and `project_artifact_path`; show the image in the conversation and report that project-relative path. Use manifest/result/image tools when a specific artifact is needed. FigureYa writes and cancellations require the tool confirmation contract. Return image and file references, not base64 or full manifests. If a generic `rplatform__r_get_job_result` is used with a FigureYa `run_id`, the server resolves it to the underlying job for compatibility.

