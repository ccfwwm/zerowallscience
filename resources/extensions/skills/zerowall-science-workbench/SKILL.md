---
name: zerowall-science-workbench
description: Route conversation requests into the ZeroWall Science tool workspace and keep tabs, assets, viewers, runs, artifacts, and conversation state synchronized.
---

# ZeroWall Science workbench

Use `science_workbench` for workspace routing. It opens or focuses a tool tab, selects a registered asset, starts or inspects a deterministic run, cancels a run, exports a registered artifact, or opens the engine center. Pass the current `sessionId`/conversation context and a stable `requestId` when available.

The route only coordinates context. Use the specialized service (`scienceViewer`, `fijiWorkflow`, `fijiExperiment`, `he`, `flow`, `sanger`, `molecule`, `cell`, `canvas`, `brain`, `research_workflow`, or `r_files`) for computation. Read numeric values only from its returned run/artifact manifest. Do not claim an engine is available when Host reports `unknown`, `invalid`, or `degraded`.

Workspace events use `science-workbench/1` as a durable audit trail. The viewer UI does not poll or replay these events as navigation or asset-open commands. Only an explicit card click, file selection, or skill action opens a viewer. Preserve `sessionId`, `projectId`, `studyId`, `assetId`, `viewerId`, `runId`, and `messageId` in explanations and result links.

## 7.0.5 viewer routing

The default workbench shows nine viewing cards. Select an external file with the desktop picker restricted to the active card's extensions, then call `zerowallResearch/importLocalAsset({sessionId, sourcePath})`. Host copies it to the active project's `.zerowall/imports/`, verifies size and SHA-256, and registers the asset. Refresh the asset list and focus the matching viewer with `science_workbench(action="open", tool=..., asset_id=..., request_id=...)`. The default UI has no `.zarr` directory picker; an existing registered OME-Zarr asset can still be opened through its specialized action. The import limit is 20 GiB overall, 128 MiB for PNG/JPEG/PGM/PDB/CIF/SDF/SCF/AB1, and 16 MiB for FASTA/GenBank. A viewer or engine can impose a lower limit.

| Card | Inputs | Tool | Default Host action | Skill |
| --- | --- | --- | --- | --- |
| ImageJ | PNG/JPEG/TIFF/OME-Zarr | imagej | `image_open` | `zerowall-fiji` |
| HE | SVS/NDPI/TIFF | he | `he_open` | `zerowall-he` |
| Flow | FCS | flow | `flow_open` | `zerowall-flow` |
| Cells | H5AD | cells | `cell_open` | `zerowall-cells` |
| Sequence | FASTA/GenBank | sequence | `open` | `zerowall-sequence` |
| Sanger | SCF/AB1 | sanger | `sanger_open` | `zerowall-sanger` |
| Molecule | PDB/CIF/SDF | molecule | `molecule_open` | `zerowall-molecule-viewer` |
| Canvas | registered canvas specification | canvas | `canvas_render` | `zerowall-science-canvas` |
| Brain atlas | managed atlas or registered data | brainglobe | `brain_open` | `zerowall-brainglobe` |

The public routing aliases `sequence_open`, `cells_open`, `canvas_open`, and `brainglobe_open` resolve to the existing Host actions `open`, `cell_open`, `canvas_render`, and `brain_open`. Do not send the aliases directly to `science_viewer`.

Default viewers contain selection, loading state, content, navigation, and refresh only. Use the specialized skill and `science_workbench(action="analyze", tool=..., operation=..., skill_id=..., action_id=..., asset_id or viewer_id, request_id=...)` for analysis. The router verifies that `skill_id` belongs to the tool, `action_id` matches the resolved operation, and the asset or viewer is supplied. Reuse a request ID only for the identical retry. Verify output using the returned Run/Artifact ID and checksum; a viewer render alone is not an analysis result.

Show `未选择文件`, `正在导入`, `正在加载`, `已加载`, or `打开失败` according to actual state. An unavailable native engine is `引擎未配置`; a spawned process with unverified GUI is `进程已启动，窗口状态待确认`. Never report a spawned process as an opened window.
