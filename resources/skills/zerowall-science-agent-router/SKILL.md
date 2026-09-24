---
name: zerowall-science-agent-router
description: Select the smallest deterministic scientific service and synchronize its result with the current conversation-linked workbench.
---

Select a tool by the actual asset format or requested operation, validate that the active project contains the asset, then call `science_workbench` with `open`, `focus`, `analyze`, `status`, `cancel`, `export`, or `engine`. Do not pass raw file paths to a Runner when a registered asset is required. Use a new idempotency `requestId` when inputs change and reuse it for retries of the same submission.

Report accepted/progress/completed/failed/cancelled states from Host events. A successful computation is not an approved scientific claim; retain `needsReview` and limitations. If the matching engine is not configured, return the diagnostic and settings action rather than silently switching environments.
