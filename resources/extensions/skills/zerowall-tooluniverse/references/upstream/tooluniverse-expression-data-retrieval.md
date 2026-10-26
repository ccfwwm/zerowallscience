# expression data retrieval

Retrieve gene expression and omics datasets from ArrayExpress and BioStudies with gene disambiguation and quality assessment. Use for finding RNA-seq/microarray datasets by organism/tissue/condition, comparing across studies (case-control, time-series, dose-response), and assessing dataset suitability before downloading. Always uses English search terms.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Domain Reasoning
- Workflow
- Phase 0: Clarification (When Needed)
- Phase 1: Query Disambiguation
- Phase 2: Data Retrieval (Internal)
- Fallback Chains
- Phase 3: Report Dataset Profile
- Data Quality Tiers
- Reasoning Framework
- Synthesis Questions
- Error Handling
- Search Parameters

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.ARCHS4_get_gene_correlations`
- `tooluniverse.tool.ARCHS4_get_gene_expression`
- `tooluniverse.tool.Bgee_get_gene_expression`
- `tooluniverse.tool.Bgee_list_species`
- `tooluniverse.tool.Bgee_search_genes`
- `tooluniverse.tool.CxGDisc_search_datasets`
- `tooluniverse.tool.ENAPortal_search_studies`
- `tooluniverse.tool.GEO_search_rnaseq_datasets`
- `tooluniverse.tool.GTEx_get_expression_summary`
- `tooluniverse.tool.GxA_get_experiment_expression`
- `tooluniverse.tool.GxA_get_experiment_info`
- `tooluniverse.tool.GxA_list_experiments`
- `tooluniverse.tool.OmicsDI_search_datasets`
- `tooluniverse.tool.PubMed_search_articles`
- `tooluniverse.tool.arrayexpress_get_experiment`
- `tooluniverse.tool.arrayexpress_get_experiment_files`
- `tooluniverse.tool.arrayexpress_get_experiment_samples`
- `tooluniverse.tool.arrayexpress_search_experiments`
- `tooluniverse.tool.biostudies_get_study`
- `tooluniverse.tool.biostudies_get_study_files`
- `tooluniverse.tool.biostudies_search`
- `tooluniverse.tool.geo_search_datasets`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-expression-data-retrieval/SKILL.md)；Apache-2.0；原文 SHA-256：`2b98fc4e7dfc016083086e7e94dfff35b2f0201afcef6430e6dabced5b27a756`。
