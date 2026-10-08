---
name: zerowall-science-canvas
description: 在 ZeroWall 查看科研画布，并通过 Host 渲染和导出带来源记录的 SVG、PNG、PDF。
---

# 科研画布

## 7.0.5 查看入口

画布接受已登记的结构化工程 JSON，默认仅显示 `canvas_render`（路由别名 `canvas_open`）的预览。外部工程需先按项目资产流程登记；普通 JSON 文件不属于桌面科研选择器的自动导入格式，使用项目文件登记或对应 skill 的工程导入。无工程显示“未选择文件”，渲染错误显示“打开失败”。编辑参数、批量排版与导出不在默认查看器中展示；通过 `science_workbench(tool=canvas, skill_id=zerowall-science-canvas, action_id=canvas_export, asset_id=..., request_id=...)` 和真实 Host schema 操作。检查工程来源、Artifact URI、输出尺寸和 SHA-256。

Use the persisted ZeroWall research objects and the current Host/Runner schemas. Keep source, version, unit, applicability, and access state explicit; unknown values remain unknown. Register inputs and parameters before execution, use deterministic runners for numeric outputs, and retain manifests, logs, failures, conflicts, and limitations. Do not claim a professional workflow is available unless the executable adapter and validation artifact are present. A frozen question, plan, or candidate set is immutable: propose an amendment and new version. Escalate only the two research gates: freeze the primary question and validation plan, then approve the final claims.


## Domain constraints

Use `science_viewer` for local plotting. Pass `action: "canvas_render" | "canvas_export"` and the JSON specification in `canvas_spec`. The execution session supplies the project. The desktop RPC has a different nested `canvas` envelope; do not copy RPC payloads into the Agent tool. Discover the live schema before calling.

The primary spec includes `title`, `width`, `height`, `xLabel`, `yLabel`, and `series: [{id,name,color,points:[{x,y}],mode:"line"|"scatter"}]`. Optional `xRange`/`yRange` are finite increasing bounds; `showLegend` controls the legend. `annotations` use data coordinates. `panels` may contain eight additional complete, non-nested specs, arranged in 1–3 `columns`; all panels use the root figure dimensions and independent linear axes. Each panel must have sufficient room. At most 100,000 points per series and 500,000 across the figure are supported.

Retain `sourceAssetIds` and `sourceArtifactIds` for every panel. Host rejects cross-project or missing references and stores source versions/checksums. References do not prove plotted numbers: derive points from actual result files, preserve units and record transformations. Never invent significance, uncertainty or statistical sample sizes.

Export registers SVG, PNG, rasterized PDF and an editable JSON project in one transaction. JSON can be imported in the workbench; local drafts persist per session. PDF is an image wrapper, not vector artwork. Image panels accept `series: []` and `image: {kind:"asset"|"artifact",id,scaleBar?:{length,unitsPerPixel,unit,calibrationSource}}`. Only registered local single-frame PNG/JPEG/WebP is supported, with original aspect ratio and verified hashes. Physical calibration is per original source pixel; provide a real calibration source and never guess it. Image panels cannot contain plot points/annotations. A data point can carry explicit `yLow`/`yHigh` containing its estimate; the series must have `intervalLabel` explaining SD, SE or confidence level. The canvas does not calculate uncertainty. Freeform drag layout and broader statistical charts remain unavailable. Do not claim complete publication figure validation. Use existing FigureYa capabilities for supported advanced figures, preserving its Run and Artifact references.
