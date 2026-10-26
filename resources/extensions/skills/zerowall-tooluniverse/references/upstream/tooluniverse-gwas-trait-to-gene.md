# gwas trait to gene

Discover causal genes for diseases/traits from GWAS data using Open Targets L2G (locus-to-gene) scoring — integrates eQTL, chromatin interaction, and distance evidence. Use for trait-to-gene mapping, drug-target hypothesis generation from GWAS, and replacing the 'nearest gene' heuristic with multi-evidence L2G scores.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Overview
- Use Cases
- Workflow
- Key Concepts
- Required ToolUniverse Tools
- GWAS Catalog (11 tools)
- Open Targets Genetics (6 tools)
- Parameters
- Output Schema
- Example Results
- Best Practices
- Tool-Specific Notes (Updated)
- `gwas_get_variants_for_trait` -- p-value Filtering
- `gwas_get_associations_for_trait` -- BROKEN
- `gwas_get_snps_for_gene` -- Parameter Rename
- Programmatic Access (Beyond Tools)
- Limitations
- Data Sources
- Citation
- Support

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.OpenTargets_get_credible_set_detail`
- `tooluniverse.tool.OpenTargets_get_gwas_study`
- `tooluniverse.tool.OpenTargets_get_study_credible_sets`
- `tooluniverse.tool.OpenTargets_get_variant_credible_sets`
- `tooluniverse.tool.OpenTargets_get_variant_info`
- `tooluniverse.tool.OpenTargets_search_gwas_studies_by_disease`
- `tooluniverse.tool.gwas_get_associations_for_snp`
- `tooluniverse.tool.gwas_get_associations_for_study`
- `tooluniverse.tool.gwas_get_associations_for_trait`
- `tooluniverse.tool.gwas_get_snp_by_id`
- `tooluniverse.tool.gwas_get_snps_for_gene`
- `tooluniverse.tool.gwas_get_studies_for_trait`
- `tooluniverse.tool.gwas_get_study_by_id`
- `tooluniverse.tool.gwas_get_variants_for_trait`
- `tooluniverse.tool.gwas_search_associations`
- `tooluniverse.tool.gwas_search_snps`
- `tooluniverse.tool.gwas_search_studies`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-gwas-trait-to-gene/SKILL.md)；Apache-2.0；原文 SHA-256：`3ac32cf90072ca7cdf0c06e3dcf49aef1d2f186990ba9de10d6197e71887f217`。
