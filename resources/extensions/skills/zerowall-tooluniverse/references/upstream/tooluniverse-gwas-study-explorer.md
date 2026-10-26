# gwas study explorer

Compare GWAS studies, perform meta-analyses across cohorts, and assess signal replication. Uses GWAS Catalog metadata, study-level statistics, and cross-cohort comparison. Use for evaluating GWAS reproducibility for a trait, meta-analysis sample size and effect-size aggregation, and detecting study heterogeneity (population, design, ancestry).

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Overview
- Key Capabilities
- COMPUTE, DON'T DESCRIBE
- Domain Reasoning: Comparing Studies for the Same Trait
- Use Cases
- 1. Comprehensive Trait Analysis
- 2. Locus-Specific Meta-Analysis
- 3. Replication Analysis
- 4. Multi-Ancestry Comparison
- Statistical Methods
- Meta-Analysis Approach
- Sources of Heterogeneity
- Study Quality Assessment
- Quality Metrics
- Quality Tiers
- Best Practices
- Before Meta-Analysis
- Interpreting Results
- Common Pitfalls
- Limitations & Caveats
- Data Limitations
- Statistical Limitations
- Interpretation Guidelines
- Tools Used

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.OpenTargets_get_gwas_study`
- `tooluniverse.tool.OpenTargets_get_study_credible_sets`
- `tooluniverse.tool.OpenTargets_get_variant_credible_sets`
- `tooluniverse.tool.OpenTargets_get_variant_info`
- `tooluniverse.tool.OpenTargets_search_gwas_studies_by_disease`
- `tooluniverse.tool.gwas_get_associations_for_snp`
- `tooluniverse.tool.gwas_get_associations_for_study`
- `tooluniverse.tool.gwas_get_study_by_id`
- `tooluniverse.tool.gwas_search_associations`
- `tooluniverse.tool.gwas_search_studies`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-gwas-study-explorer/SKILL.md)；Apache-2.0；原文 SHA-256：`332a3ccea97549a9eb20254eaea629e313f21cbda88900e6eb3c05fa0855d11b`。
