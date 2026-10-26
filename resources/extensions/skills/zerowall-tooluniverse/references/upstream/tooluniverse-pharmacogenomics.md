# pharmacogenomics

Pharmacogenomics (PGx) research — drug-gene interactions (CPIC, PharmGKB), CPIC dosing guidelines, variant-drug-response associations, ethnic-allele-frequency considerations, and metabolizer-status scoring. Use for PGx-informed dosing recommendations, CYP/HLA pharmacogenomic allele interpretation, and clinically-actionable PGx report generation.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- COMPUTE, DON'T DESCRIBE
- When to Use
- Workflow Overview
- Phase 0: Disambiguation
- Phase 1: Identify Gene-Drug Pairs
- Finding Guideline IDs
- Phase 2: Retrieve Dosing Guidelines
- Gotchas
- Phase 3: Allele & Variant Annotation
- Metabolizer Status Reasoning
- Phase 4: FDA Biomarker Labeling
- FDA PGx Label Reasoning
- Phase 5: Cross-Database Enrichment
- Adverse Event Signal Detection for PGx-Relevant Drugs
- When PGx Testing Changes Clinical Decisions
- Key Parameter Notes
- CPIC Guideline Application Reasoning
- Fallback Strategies
- Example Workflows
- Drug Class Context (RxClass)
- FDA Substance Identification (FDAGSRS)
- Limitations

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.CPIC_get_alleles`
- `tooluniverse.tool.CPIC_get_drug_info`
- `tooluniverse.tool.CPIC_get_gene_drug_pairs`
- `tooluniverse.tool.CPIC_get_gene_info`
- `tooluniverse.tool.CPIC_get_recommendations`
- `tooluniverse.tool.CPIC_list_drugs`
- `tooluniverse.tool.CPIC_list_guidelines`
- `tooluniverse.tool.CPIC_list_pgx_genes`
- `tooluniverse.tool.CPIC_search_gene_drug_pairs`
- `tooluniverse.tool.DGIdb_get_drug_gene_interactions`
- `tooluniverse.tool.DGIdb_get_gene_druggability`
- `tooluniverse.tool.DISGENET_API_KEY`
- `tooluniverse.tool.DisGeNET_get_vda`
- `tooluniverse.tool.EpiGraphDB_get_gene_drug_associations`
- `tooluniverse.tool.FAERS_filter_serious_events`
- `tooluniverse.tool.FDAGSRS_get_structure`
- `tooluniverse.tool.FDAGSRS_get_substance`
- `tooluniverse.tool.FDAGSRS_search_substances`
- `tooluniverse.tool.FDA_get_pharmacogenomics_info_by_drug_name`
- `tooluniverse.tool.OpenTargets_drug_pharmacogenomics_data`
- `tooluniverse.tool.PHARMVAR_API_KEY`
- `tooluniverse.tool.PharmGKB_get_clinical_annotations`
- `tooluniverse.tool.PharmGKB_get_dosing_guidelines`
- `tooluniverse.tool.PharmGKB_get_drug_details`
- `tooluniverse.tool.PharmGKB_get_gene_details`
- `tooluniverse.tool.PharmGKB_search_drugs`
- `tooluniverse.tool.PharmGKB_search_genes`
- `tooluniverse.tool.PharmGKB_search_variants`
- `tooluniverse.tool.PharmVar_get_alleles`
- `tooluniverse.tool.PharmVar_list_genes`
- `tooluniverse.tool.RxClass_find_classes`
- `tooluniverse.tool.RxClass_get_class_members`
- `tooluniverse.tool.RxClass_get_drug_classes`
- `tooluniverse.tool.StarAlleles_search`
- `tooluniverse.tool.fda_pharmacogenomic_biomarkers`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-pharmacogenomics/SKILL.md)；Apache-2.0；原文 SHA-256：`8180d2e88f091f2e9df4b2e39538141a276bc1644032ee66f952bff932298491`。
