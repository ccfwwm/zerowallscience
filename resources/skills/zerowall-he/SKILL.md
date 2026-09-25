---
name: zerowall-he
description: Open SVS/NDPI/pyramidal TIFF, inspect calibrated ROIs, run bounded CPU StarDist nuclei segmentation, restore or cancel its persistent task, and retrieve labels and counts in ZeroWall Science.
---

# HE slide workflow

## 7.0.5 查看入口

选择 SVS/NDPI/TIFF 后导入到项目，文件导入上限 20 GiB；工作台调用 `he_open`，随后用 `he_read` 按金字塔层级查看瓦片、缩放和平移。未选择文件显示“请先选择资产”；解码/读取失败显示“打开失败”及 Host 原因；OpenSlide 或相关引擎不可用时显示“引擎未配置”。默认查看器不提供 ROI 统计、StarDist、批处理或导出控件。分析通过 `science_workbench` 传 `tool=he`、`skill_id=zerowall-he`、所选 `action_id`（如 `he_analyze` 或 `he_segment`）、真实 `viewer_id` 和稳定 `request_id`。产物以 Run/Artifact 清单和 SHA-256 验证。

Use `science_viewer` and its current schema. Ordinary viewing does not require a study freeze. Research validation and final claims follow the study's two human gates; viewing or already-authorized computation does not add another gate.

## Inspect and select

1. List project assets and open a supported slide with `he_open`, `assetId`, and `sessionId`.
2. Use the returned `viewer.id` and `viewer.version` as `viewerId` and `expectedVersion` for `he_read`, `he_analyze`, `he_export`, or `he_segment`. A version conflict requires reading current state, not overwriting it.
3. Region `x`, `y`, `width`, `height` are original level-0 pixel coordinates; `page` selects a pyramid level. OpenSlide decodes local tiles. Tile dimensions and sampling spacing differ from the original ROI dimensions. Do not infer micrometers when slide calibration is absent.
4. `he_analyze`/`he_export` retain the RGB and connected-component screening baseline. These component counts are not StarDist nuclei counts.

## StarDist CPU task

Uses the application's stable Python at `%APPDATA%\zerowall-science\Python\python.exe`, its `stardist` and TensorFlow packages, and the frozen BSD-3-Clause `2D_versatile_he` weights. `Lib\site-packages\bin\stardist-predict2d.exe` and `stardist-predict3d.exe` can be discovered as package command entrypoints, but the bounded HE runner invokes `StarDist2D` through the Python API. Fiji/ImageJ is a separate image window, not this segmentation engine. OpenSlide alone is sufficient for viewing but not segmentation. Read `getScientificEngineConfigs` and `probeScientificEngine` before starting; check the shared Python, packages and model weights. Do not replace the user's Fiji or system Python installation.

Submit `he_segment` with the outer `sessionId`, `viewerId`, `expectedVersion`, `region`, and nested `he: {sessionId, action: "segment", requestId, segmentation: {probabilityThreshold: 0.6924782541382084}}`. Keep the same request ID for an uncertain retry; changed input requires a new ID. Always use tool discovery to verify the current schema.

Poll `he_status` using nested `he: {sessionId, action: "status", runId}`. Cancel with `he_cancel` and nested `action: "cancel"`. Closing a view does not cancel. Reopening restores its saved run. A cancelled, interrupted or failed request remains terminal; inspect logs and explicitly submit a new request when appropriate. Never present a lost process as resumed.

Bounds enforced by the runner: selected-level ROI at least 64 pixels per axis and at most 64 million pixels; up to 100,000 reported nuclei; one local heavy task; 1–8 threads; 30-minute default timeout; at least 2 GiB free storage. Core size is 256/512/1024 with 128–256-pixel context and 128-pixel object overlap. Native StarDist responsibility partitioning handles overlapping blocks and rejects objects too large for that overlap. No hard OS memory ceiling is claimed.

Shared pooled RGB percentile normalization is recorded. Source/model/runner hashes, parameters, results, logs and manifests are persisted. The outputs are `labels.tif`, `nuclei.csv`, `polygons.npz`, `overlay.png`, and `result.json`; retrieve them through the registered Run/Artifact links.

## Interpretation and limits

Count centers inside the requested original ROI; flag incomplete boundary nuclei. Labels/polygons use ROI-local selected-level pixels, CSV centers use level-0 coordinates, and the polygon archive records offset/downsample. Physical density uses the entire geometric ROI area, including background; it is not tissue-only density. Green outlines are nuclei; orange outlines touch the ROI boundary.

Review stain, selected resolution, segmentation overlays and scale suitability before interpreting counts. Native whole-image comparisons validate implementation consistency, not medical ground truth or disease diagnosis. Repeated bundled public patches are software fixtures, not independently annotated biological validation.

Current scope is one bounded ROI per persisted job. Whole-slide batch orchestration, a validated tissue-region model, clinical diagnostic models, and clinical validation are not delivered by this adapter. Preserve these limits in evidence records and reports.
