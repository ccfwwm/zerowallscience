---
name: zerowall-science-workbench
description: Route conversation requests into the ZeroWall Science tool workspace and keep tabs, assets, viewers, runs, artifacts, and conversation state synchronized.
---

# ZeroWall Science workbench

Use `science_workbench` for workspace routing. It opens or focuses a tool tab, selects a registered asset, starts or inspects a deterministic run, cancels a run, exports a registered artifact, or opens the engine center. Pass the current `sessionId`/conversation context and a stable `requestId` when available.

The route only coordinates context. Use the specialized service (`scienceViewer`, `fijiWorkflow`, `fijiExperiment`, `he`, `flow`, `sanger`, `molecule`, `cell`, `canvas`, `brain`, `research_workflow`, or `r_files`) for computation. Read numeric values only from its returned run/artifact manifest. Do not claim an engine is available when Host reports `unknown`, `invalid`, or `degraded`.

Workspace events use `science-workbench/1`; clients may reconnect with `afterSequence`. Replayed events must update the UI without submitting the analysis again. Preserve `sessionId`, `projectId`, `studyId`, `assetId`, `viewerId`, `runId`, and `messageId` in explanations and result links.
