---
name: zerowall-he
description: Open SVS/NDPI/pyramidal TIFF, inspect calibrated ROIs, run bounded CPU StarDist nuclei segmentation, restore or cancel its persistent task, and retrieve labels and counts in ZeroWall Science.
---

# HE slide workflow

Use `science_viewer` and its current schema. Ordinary viewing does not require a study freeze. Research validation and final claims follow the study's two human gates; viewing or already-authorized computation does not add another gate.

## Inspect and select

1. List project assets and open a supported slide with `he_open`, `assetId`, and `sessionId`.
2. Use the returned `viewer.id` and `viewer.version` as `viewerId` and `expectedVersion` for `he_read`, `he_analyze`, `he_export`, or `he_segment`. A version conflict requires reading current state, not overwriting it.
3. Region `x`, `y`, `width`, `height` are original level-0 pixel coordinates; `page` selects a pyramid level. OpenSlide decodes local tiles. Tile dimensions and sampling spacing differ from the original ROI dimensions. Do not infer micrometers when slide calibration is absent.
4. `he_analyze`/`he_export` retain the RGB and connected-component screening baseline. These component counts are not StarDist nuclei counts.

## StarDist CPU task

Requires the separately managed `he-stardist` engine package and frozen BSD-3-Clause `2D_versatile_he` model. The OpenSlide-only engine is sufficient for viewing but not segmentation. Do not replace a user's Python, Fiji, or napari installation. Engine import and health status use the application's engine manager.

Submit `he_segment` with the outer `sessionId`, `viewerId`, `expectedVersion`, `region`, and nested `he: {sessionId, action: "segment", requestId, segmentation: {probabilityThreshold: 0.6924782541382084}}`. Keep the same request ID for an uncertain retry; changed input requires a new ID. Always use tool discovery to verify the current schema.

Poll `he_status` using nested `he: {sessionId, action: "status", runId}`. Cancel with `he_cancel` and nested `action: "cancel"`. Closing a view does not cancel. Reopening restores its saved run. A cancelled, interrupted or failed request remains terminal; inspect logs and explicitly submit a new request when appropriate. Never present a lost process as resumed.

Bounds enforced by the runner: selected-level ROI at least 64 pixels per axis and at most 64 million pixels; up to 100,000 reported nuclei; one local heavy task; 1–8 threads; 30-minute default timeout; at least 2 GiB free storage. Core size is 256/512/1024 with 128–256-pixel context and 128-pixel object overlap. Native StarDist responsibility partitioning handles overlapping blocks and rejects objects too large for that overlap. No hard OS memory ceiling is claimed.

Shared pooled RGB percentile normalization is recorded. Source/model/runner hashes, parameters, results, logs and manifests are persisted. The outputs are `labels.tif`, `nuclei.csv`, `polygons.npz`, `overlay.png`, and `result.json`; retrieve them through the registered Run/Artifact links.

## Interpretation and limits

Count centers inside the requested original ROI; flag incomplete boundary nuclei. Labels/polygons use ROI-local selected-level pixels, CSV centers use level-0 coordinates, and the polygon archive records offset/downsample. Physical density uses the entire geometric ROI area, including background; it is not tissue-only density. Green outlines are nuclei; orange outlines touch the ROI boundary.

Review stain, selected resolution, segmentation overlays and scale suitability before interpreting counts. Native whole-image comparisons validate implementation consistency, not medical ground truth or disease diagnosis. Repeated bundled public patches are software fixtures, not independently annotated biological validation.

Current scope is one bounded ROI per persisted job. Whole-slide batch orchestration, a validated tissue-region model, clinical diagnostic models, and clinical validation are not delivered by this adapter. Preserve these limits in evidence records and reports.
