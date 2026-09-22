---
name: zerowall-science-canvas
description: ZeroWall Science 7.0.0 science canvas workflow; use only when the corresponding research or viewer task is requested.
---

# science canvas

Use the persisted ZeroWall research objects and the current Host/Runner schemas. Keep source, version, unit, applicability, and access state explicit; unknown values remain unknown. Register inputs and parameters before execution, use deterministic runners for numeric outputs, and retain manifests, logs, failures, conflicts, and limitations. Do not claim a professional workflow is available unless the executable adapter and validation artifact are present. A frozen question, plan, or candidate set is immutable: propose an amendment and new version. Escalate only the two research gates: freeze the primary question and validation plan, then approve the final claims.


## Domain constraints

Use `science_viewer` for local plotting. Pass `action: "canvas_render" | "canvas_export"` and the JSON specification in `canvas_spec`. The execution session supplies the project. The desktop RPC has a different nested `canvas` envelope; do not copy RPC payloads into the Agent tool. Discover the live schema before calling.

The primary spec includes `title`, `width`, `height`, `xLabel`, `yLabel`, and `series: [{id,name,color,points:[{x,y}],mode:"line"|"scatter"}]`. Optional `xRange`/`yRange` are finite increasing bounds; `showLegend` controls the legend. `annotations` use data coordinates. `panels` may contain eight additional complete, non-nested specs, arranged in 1–3 `columns`; all panels use the root figure dimensions and independent linear axes. Each panel must have sufficient room. At most 100,000 points per series and 500,000 across the figure are supported.

Retain `sourceAssetIds` and `sourceArtifactIds` for every panel. Host rejects cross-project or missing references and stores source versions/checksums. References do not prove plotted numbers: derive points from actual result files, preserve units and record transformations. Never invent significance, uncertainty or statistical sample sizes.

Export registers SVG, PNG, rasterized PDF and an editable JSON project in one transaction. JSON can be imported in the workbench; local drafts persist per session. PDF is an image wrapper, not vector artwork. Image-panel collage, physical image scale bars, error-bar/statistical chart coverage and freeform drag layout remain unavailable. Do not claim complete publication figure validation. Use existing FigureYa capabilities for supported advanced figures, preserving its Run and Artifact references.

