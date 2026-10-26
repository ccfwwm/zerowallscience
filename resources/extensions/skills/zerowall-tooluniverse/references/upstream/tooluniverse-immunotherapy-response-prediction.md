# immunotherapy response prediction

Predict patient response to immune checkpoint inhibitors (ICIs) by integrating tumor mutational burden (TMB), microsatellite instability (MSI), PD-L1 expression, HLA status, and immune-related gene expression. Outputs ICI Response Score with drug-specific recommendations and resistance-risk assessment. Use for melanoma/NSCLC/RCC immunotherapy decision support.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Reasoning Before Searching
- COMPUTE, DON'T DESCRIBE
- When to Use
- Input Parsing
- Workflow Overview
- Phase 1: Input Standardization & Cancer Context
- Phase 2: TMB Analysis
- Phase 3: Neoantigen Analysis
- Phase 4: MSI/MMR Status Assessment
- Phase 5: PD-L1 Expression Analysis
- Phase 6: Immune Microenvironment Profiling
- Phase 7: Mutation-Based Predictors
- Phase 8: Clinical Evidence & ICI Options
- Phase 9: Resistance Risk Assessment
- Phase 10: Multi-Biomarker Score Integration
- Phase 11: Clinical Recommendations
- Output Report
- Evidence Tiers

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.EnsemblVEP_annotate_rsid`
- `tooluniverse.tool.FDA_get_indications_by_drug_name`
- `tooluniverse.tool.HPA_get_cancer_prognostics_by_gene`
- `tooluniverse.tool.MyGene_query_genes`
- `tooluniverse.tool.OpenTargets_get_disease_id_description_by_name`
- `tooluniverse.tool.OpenTargets_get_drug_mechanisms_of_action_by_chemblId`
- `tooluniverse.tool.UniProt_get_function_by_accession`
- `tooluniverse.tool.cBioPortal_get_mutations`
- `tooluniverse.tool.civic_search_evidence_items`
- `tooluniverse.tool.enrichr_gene_enrichment_analysis`
- `tooluniverse.tool.ensembl_lookup_gene`
- `tooluniverse.tool.fda_pharmacogenomic_biomarkers`
- `tooluniverse.tool.iedb_search_epitopes`
- `tooluniverse.tool.search_clinical_trials`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-immunotherapy-response-prediction/SKILL.md)；Apache-2.0；原文 SHA-256：`cb7ea2d8391aa585fe6090b88571b77d3e87d5e8f717fbd1b9360ff064b7c028`。
