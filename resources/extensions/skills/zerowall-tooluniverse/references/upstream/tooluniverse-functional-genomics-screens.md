# functional genomics screens

Interpret hits from CRISPR-KO/CRISPRi/shRNA screens by integrating DepMap essentiality, gnomAD constraint scores, pathway context (Reactome, STRING), druggability (DGIdb), and clinical evidence (CIViC, COSMIC). Use for screen-hit prioritization, essentiality ranking, and turning a list of screen hits into a prioritized target shortlist.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- LOOK UP, DON'T GUESS
- COMPUTE, DON'T DESCRIBE
- Workflow
- Phase Details
- Phase 1: Hit Validation
- Phase 2: Pathway & Network
- Phase 3: Druggability
- Phase 4: Clinical Evidence
- Phase 6: Prioritized Report
- Edge Cases
- Limitations

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.COSMIC_get_mutations_by_gene`
- `tooluniverse.tool.DGIdb_get_drug_gene_interactions`
- `tooluniverse.tool.DGIdb_get_gene_druggability`
- `tooluniverse.tool.DepMap_get_gene_dependencies`
- `tooluniverse.tool.DepMap_search_cell_lines`
- `tooluniverse.tool.PubMed_search_articles`
- `tooluniverse.tool.ReactomeAnalysis_pathway_enrichment`
- `tooluniverse.tool.STRING_functional_enrichment`
- `tooluniverse.tool.STRING_get_network`
- `tooluniverse.tool.UniProt_get_function_by_accession`
- `tooluniverse.tool.civic_search_evidence_items`
- `tooluniverse.tool.gnomad_get_gene_constraints`
- `tooluniverse.tool.search_clinical_trials`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-functional-genomics-screens/SKILL.md)；Apache-2.0；原文 SHA-256：`0f19202a5d54037784aa7469caff3d653f5585e839492de11eb80d8437849f54`。
