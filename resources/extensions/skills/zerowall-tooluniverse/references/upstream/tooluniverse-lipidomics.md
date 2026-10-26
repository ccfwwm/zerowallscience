# lipidomics

Lipid analysis and lipid-disease associations using LIPID MAPS classification, HMDB metabolite data, KEGG/Reactome lipid pathways (sphingolipid, eicosanoid, steroid, fatty acid), and PubChem chemical info. Use for lipid identification, lipid metabolism pathway mapping, and lipid-associated disease analysis (cardiovascular, diabetes, NAFLD).

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Reasoning Strategy
- When to Use
- Core Tools
- Workflow
- Phase 0: Lipid Identity Resolution
- Phase 1: Structural Classification
- Phase 2: Pathway Mapping
- Phase 3: Disease Associations
- Phase 4: Interpretation & Report
- Limitations

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.CTD_get_gene_diseases`
- `tooluniverse.tool.DisGeNET_search_gene`
- `tooluniverse.tool.HMDB_get_metabolite`
- `tooluniverse.tool.HMDB_search`
- `tooluniverse.tool.KEGG_get_pathway_genes`
- `tooluniverse.tool.LipidMaps_get_compound_by_id`
- `tooluniverse.tool.LipidMaps_get_gene`
- `tooluniverse.tool.LipidMaps_get_protein`
- `tooluniverse.tool.LipidMaps_search_by_formula`
- `tooluniverse.tool.LipidMaps_search_by_name`
- `tooluniverse.tool.OpenTargets_get_associated_drugs_by_target_ensemblID`
- `tooluniverse.tool.PubChem_get_CID_by_compound_name`
- `tooluniverse.tool.PubChem_get_compound_properties_by_CID`
- `tooluniverse.tool.PubMed_search_articles`
- `tooluniverse.tool.SwissLipids_get_children`
- `tooluniverse.tool.SwissLipids_get_lipid`
- `tooluniverse.tool.SwissLipids_search`
- `tooluniverse.tool.kegg_search_pathway`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-lipidomics/SKILL.md)；Apache-2.0；原文 SHA-256：`7c03f56c3f029d7eb29100d952e71d110d2b21be1955e0e520d673dbc49ec1b5`。
