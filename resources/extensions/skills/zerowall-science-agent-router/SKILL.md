---
name: zerowall-science-agent-router
description: Select the smallest deterministic scientific service and keep research execution in conversation, opening a viewer only when a file or visual result needs display.
---

Select a tool by the actual asset format or requested operation and use the corresponding conversation tool for analysis, status, cancellation, export, evidence, and reports. Call `science_viewer_panel` only with `open` or `focus` after a successful tool call when the user needs a file or visual result displayed; the conversation automatically reveals the matching viewer. Research planning, runs, evidence, and reports stay in conversation tools. Do not require a separate interface, routine audit materials, or manual Study registration. Do not pass raw file paths to a Runner when a registered asset is required. Use a new idempotency `requestId` when inputs change and reuse it for retries of the same submission.

Report accepted/progress/completed/failed/cancelled states from Host events. A successful computation is not an approved scientific claim; retain `needsReview` and limitations. If the matching engine is not configured, return the diagnostic and settings action rather than silently switching environments.
