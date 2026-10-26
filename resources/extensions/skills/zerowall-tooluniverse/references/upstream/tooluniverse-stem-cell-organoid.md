# stem cell organoid

Stem cell, iPSC, and organoid research — pluripotency markers, differentiation protocol pathways, lineage commitment factors, organoid model selection. Use for iPSC characterization, differentiation protocol design via developmental-pathway recapitulation, and organoid-model selection for disease modeling.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Reasoning Strategy
- Core Tools
- Workflow
- Phase 1: Cell Identity & Markers
- Phase 2: Differentiation Pathways
- Phase 3: Atlas & Dataset Discovery
- Phase 4: Organoid Model Assessment
- Evidence Grading
- Synthesis Questions
- Limitations

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.CELLxGENE_get_cell_metadata`
- `tooluniverse.tool.CELLxGENE_get_census_versions`
- `tooluniverse.tool.CELLxGENE_get_expression_data`
- `tooluniverse.tool.CellMarker_search_by_cell_type`
- `tooluniverse.tool.CellMarker_search_by_gene`
- `tooluniverse.tool.GEO_search_rnaseq_datasets`
- `tooluniverse.tool.OpenTargets_get_associated_targets_by_disease_efoId`
- `tooluniverse.tool.PubMed_search_articles`
- `tooluniverse.tool.ReactomeAnalysis_pathway_enrichment`
- `tooluniverse.tool.STRING_get_network`
- `tooluniverse.tool.hca_search_projects`
- `tooluniverse.tool.kegg_search_pathway`
- `tooluniverse.tool.search_clinical_trials`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-stem-cell-organoid/SKILL.md)；Apache-2.0；原文 SHA-256：`a9dc7b7d2265c6aad194b0b268b517e41ca44363855ea6880eb6955f89d5f7fc`。
