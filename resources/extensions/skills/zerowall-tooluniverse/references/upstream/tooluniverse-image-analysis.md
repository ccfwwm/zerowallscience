# image analysis

Microscopy and quantitative imaging analysis — colony morphometry, fluorescence intensity quantification, cell-count statistics, dose-response curves, and ANOVA/Dunnett on image-derived measurements. Uses pandas/numpy/scipy/scikit-image. Use for analyzing tabular outputs from CellProfiler/ImageJ, image-derived measurement statistics, and image-based assay quantification.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- RULE ZERO — Check for pre-computed results FIRST
- CRITICAL — "Relative proportion of A to B" defaults to PERCENTAGE
- LOOK UP, DON'T GUESS
- When to Use
- Core Principles
- Required Packages
- Workflow Decision Tree
- Analysis Workflow
- Phase 0: Question Parsing and Data Discovery
- Phase 1-3: Grouped Stats → Statistical Testing → Regression
- Common Patterns
- Raw Image Processing
- Deep-learning segmentation (Cellpose) as an alternative to classical CV
- Public Cell Painting screen data (Image Data Resource)
- Public imaging study/dataset discovery (BioImage Archive)
- Answer Formatting
- "Relative proportion of A to B" — default to PERCENTAGE
- Evidence Grading

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.BioImageArchive_get_study`
- `tooluniverse.tool.BioImageArchive_list_study_files`
- `tooluniverse.tool.BioImageArchive_search_bioimages`
- `tooluniverse.tool.BioImageArchive_search_studies`
- `tooluniverse.tool.CellPainting_get_screen_plates`
- `tooluniverse.tool.CellPainting_get_well_data`
- `tooluniverse.tool.CellPainting_search_screens`
- `tooluniverse.tool.Cellpose_segment_image`
- `tooluniverse.tool.FPbase_get_protein`
- `tooluniverse.tool.FPbase_search_by_spectrum`
- `tooluniverse.tool.read_executed_notebook`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-image-analysis/SKILL.md)；Apache-2.0；原文 SHA-256：`ea7e5fbd58661b0bc55917896ca92af3f407d418a3fdf08d7f54fc36f320a904`。
