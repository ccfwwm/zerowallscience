# population genetics 1000genomes

Population genetics using the 1000 Genomes Project (IGSR) — superpopulation/population search, sample metadata, variant frequencies across AFR/AMR/EAS/EUR/SAS, ancestry-specific analyses. Use for ancestry comparison, population-aware allele frequency lookups, and 1000-Genomes-cohort-specific analyses (distinct from gnomAD which has different sample composition).

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- COMPUTE, DON'T DESCRIBE
- When to Use
- NOT for (use other skills instead)
- Phase 1: Search 1000 Genomes Populations
- Phase 2: Search Samples by Population
- Phase 3: List Data Collections
- Phase 4: GWAS Context for Population Stratification
- Search GWAS associations for a trait
- Get variants for a specific trait (by EFO ID)
- Find SNPs in a gene from GWAS catalog
- Workflow: Population Stratification in GWAS
- Common Population Codes
- Reasoning Framework for Result Interpretation
- Evidence Grading
- Interpretation Guidance
- Synthesis Questions

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.IGSR_list_data_collections`
- `tooluniverse.tool.IGSR_search_populations`
- `tooluniverse.tool.IGSR_search_samples`
- `tooluniverse.tool.gwas_get_snps_for_gene`
- `tooluniverse.tool.gwas_get_variants_for_trait`
- `tooluniverse.tool.gwas_search_associations`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-population-genetics-1000genomes/SKILL.md)；Apache-2.0；原文 SHA-256：`b6dd0d2e40e26f08e26e5e571f17463a082f8525fea8e59eec2e60d518e4c28b`。
