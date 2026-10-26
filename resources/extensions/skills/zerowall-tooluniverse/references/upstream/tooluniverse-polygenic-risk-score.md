# polygenic risk score

Build and interpret polygenic risk scores (PRS) for complex diseases using GWAS summary statistics. Covers PRS construction (clumping/thresholding, PRS-CS), validation in independent cohorts, ancestry-aware adjustment, and clinical interpretation (population-relative risk, not absolute prediction). Use for PRS-based risk stratification.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Reasoning Strategy
- Overview
- Methodology
- PRS Calculation Formula
- Standardization
- Significance Thresholds
- Effect Size Handling
- Data Sources
- Key Concepts
- Polygenic Risk Scores (PRS)
- GWAS (Genome-Wide Association Studies)
- Effect Sizes and Odds Ratios
- Linkage Disequilibrium (LD) and Clumping
- Population Stratification
- Applications
- Clinical Risk Assessment
- Research Applications
- SNP-heritability and genetic correlation (LDSC)
- Personal Genomics
- Limitations and Considerations
- Workflow
- 0. Check PGS Catalog Before Building From Raw GWAS
- 1. Trait Selection
- 2. Association Collection

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.EnsemblVEP_annotate_hgvs`
- `tooluniverse.tool.MyVariant_query_variants`
- `tooluniverse.tool.OpenTargets_search_gwas_studies_by_disease`
- `tooluniverse.tool.PGSCatalog_get_performance_metrics`
- `tooluniverse.tool.PGSCatalog_get_score`
- `tooluniverse.tool.PGSCatalog_get_scores_by_trait`
- `tooluniverse.tool.PGSCatalog_search_traits`
- `tooluniverse.tool.dbsnp_get_variant_by_rsid`
- `tooluniverse.tool.gnomad_get_gene_constraints`
- `tooluniverse.tool.gnomad_get_variant`
- `tooluniverse.tool.gnomad_search_variants`
- `tooluniverse.tool.gwas_get_associations_for_trait`
- `tooluniverse.tool.gwas_get_snps_for_gene`
- `tooluniverse.tool.gwas_search_associations`
- `tooluniverse.tool.run_ldsc_genetic_correlation`
- `tooluniverse.tool.run_ldsc_heritability`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-polygenic-risk-score/SKILL.md)；Apache-2.0；原文 SHA-256：`fca4823713c4372811599636401425d196215d3ab90c287d407e676aa473d24b`。
