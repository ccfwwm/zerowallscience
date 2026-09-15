---
name: zerowall-rplotfigure
description: Use FigureYa for reproducible scientific figures and paper-ready reports.
whenToUse: For FigureYa catalog, search, planning, execution, manifests, images, and reports.
---

Use the compact MCP entries `r_figureya_catalog`, `r_figureya_plan`, `r_figureya_run`, and `r_figureya_artifacts`. Start with `r_figureya_catalog` using `action="catalog"` or `action="search"`, then create a plan with `r_figureya_plan` and run it with `r_figureya_run`. Treat `run_id` as the async lifecycle key. On success, ZeroWall automatically downloads the complete FigureYa manifest into the current local workspace under `figureya/<run_id>/`; report those local paths and concise metadata. FigureYa images are local artifacts and must not be sent as model image input. Use manifest/result/image actions when a specific artifact is needed; those image results are also saved locally and exposed as paths. Never return or reconstruct base64 in the conversation. FigureYa writes and cancellations require the tool confirmation contract. Use the FigureYa catalog and the available tool schemas for unfamiliar figure actions.

