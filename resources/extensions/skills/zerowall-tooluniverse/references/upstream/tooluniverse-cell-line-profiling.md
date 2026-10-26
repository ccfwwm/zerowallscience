# cell line profiling

Cancer cell-line selection and profiling for experimental model choice. Cross-references DepMap, Cellosaurus, COSMIC, PharmacoDB to deliver identity verification, mutation/CNV profile, gene dependencies, drug sensitivities, and druggable targets. Use to answer 'which cell line should I use for studying gene X?' or 'is this cell line a good model for cancer Y?'. Outputs ranked recommendations with rationale, growth characteristics, and known pitfalls.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- LOOK UP, DON'T GUESS
- COMPUTE, DON'T DESCRIBE
- When to Use
- Workflow Overview
- Phase 1: Cell Line Identification
- Phase 2: Molecular Profiling
- Phase 3: Gene Dependencies (CRISPR Screens)
- Phase 4: Drug Sensitivity
- Phase 5: Target Druggability and Recommendations
- Decision Criteria with Concrete Thresholds
- Use-Case-Specific Guidance
- Cellosaurus Derivative Lines
- DepMap API Fallbacks
- Common Use Patterns
- Cross-Referencing Cell Line IDs
- Error Handling
- Completeness Checklist

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.COSMIC_get_mutations_by_gene`
- `tooluniverse.tool.COSMIC_search_mutations`
- `tooluniverse.tool.CellMarker_search_by_gene`
- `tooluniverse.tool.CellMarker_search_cancer_markers`
- `tooluniverse.tool.DGIdb_get_drug_gene_interactions`
- `tooluniverse.tool.DepMap_get_cell_line`
- `tooluniverse.tool.DepMap_get_cell_lines`
- `tooluniverse.tool.DepMap_get_gene_dependencies`
- `tooluniverse.tool.DepMap_search_cell_lines`
- `tooluniverse.tool.DepMap_search_genes`
- `tooluniverse.tool.HPA_get_comparative_expression_by_gene_and_cellline`
- `tooluniverse.tool.MyGene_query_genes`
- `tooluniverse.tool.OpenTargets_get_associated_drugs_by_target_ensemblID`
- `tooluniverse.tool.PharmacoDB_get_biomarker_assoc`
- `tooluniverse.tool.PharmacoDB_get_cell_line`
- `tooluniverse.tool.PharmacoDB_get_experiments`
- `tooluniverse.tool.PharmacoDB_search`
- `tooluniverse.tool.STRING_get_network`
- `tooluniverse.tool.SYNERGxDB_list_cell_lines`
- `tooluniverse.tool.SYNERGxDB_search_combos`
- `tooluniverse.tool.cBioPortal_get_mutations`
- `tooluniverse.tool.cellosaurus_get_cell_line_info`
- `tooluniverse.tool.cellosaurus_query_converter`
- `tooluniverse.tool.cellosaurus_search_cell_lines`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-cell-line-profiling/SKILL.md)；Apache-2.0；原文 SHA-256：`82ed5e79206861bb25dce36554678fc5c4156e5f7d84b3ba757d443e4ca4461d`。
