# disease research

Generate comprehensive disease research reports covering genetics (causal genes, GWAS, OMIM), pathways (Reactome, KEGG), drugs (existing therapies, repurposing candidates), clinical trials, epidemiology (prevalence, incidence), and phenotypes (HPO). Use for full disease overviews, comprehensive disease characterization, and orphan/rare-disease profiling.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- LOOK UP, DON'T GUESS
- When to Use
- Core Workflow: Report-First Approach
- Disease Mechanism Reasoning
- 10 Research Dimensions
- Normalizing free text to ontology IDs (Dimension 1)
- Report Template
- Citation Format
- Progressive Update Pattern
- Evidence Grading & Interpretation
- Synthesis Questions (answer in Executive Summary)
- Interpreting Cross-Database Concordance
- Handling Conflicting Data
- Final Report Quality Checklist
- Expected Output Scale

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.OSL_get_efo_id_by_disease_name`
- `tooluniverse.tool.ZOOMA_annotate_text`
- `tooluniverse.tool.ZOOMA_list_datasources`
- `tooluniverse.tool.humanbase_ppi_analysis`
- `tooluniverse.tool.icd_search_codes`
- `tooluniverse.tool.ols_get_efo_term`
- `tooluniverse.tool.ols_search_efo_terms`
- `tooluniverse.tool.snomed_search_concepts`
- `tooluniverse.tool.umls_search_concepts`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-disease-research/SKILL.md)；Apache-2.0；原文 SHA-256：`29c035f615f49ce5867bf9c9e1633811b35dc23ee7edd9ee75437843993637ec`。
