# gwas finemapping

Statistical fine-mapping of GWAS loci using credible sets (SuSiE, FINEMAP) and locus-to-gene scoring (Open Targets L2G). Identifies likely causal variants and target genes — distinct from positional 'nearest gene' which is often wrong. Use for prioritizing causal variants at GWAS hits, comparing fine-mapping methods, and converting lead SNPs to target genes.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- COMPUTE, DON'T DESCRIBE
- Overview
- Key Concepts
- Credible Sets
- Posterior Probability
- Locus-to-Gene (L2G) Predictions
- Fine-Mapping Reasoning Framework (CRITICAL)
- Step 1: Lead SNP vs Causal Variant
- Step 2: LD Structure Interpretation
- Step 3: Credible Set Analysis
- Step 4: Colocalization Reasoning
- Step 5: Prioritization Tiebreakers
- Common Queries
- Tools Used
- Open Targets Genetics (GraphQL)
- GWAS Catalog (REST API)
- Do-It-Yourself Statistical Fine-Mapping, Colocalization, and TWAS
- Understanding Fine-Mapping Output
- Interpreting Posterior Probabilities
- Interpreting L2G Scores
- Common Questions
- Limitations
- Best Practices

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.Coloc_abf_test`
- `tooluniverse.tool.Finemap_credible_set`
- `tooluniverse.tool.GWASSumStats_get_region_associations`
- `tooluniverse.tool.GWASSumStats_get_trait_studies`
- `tooluniverse.tool.GWASSumStats_list_studies`
- `tooluniverse.tool.OpenTargets_get_credible_set_detail`
- `tooluniverse.tool.OpenTargets_get_study_credible_sets`
- `tooluniverse.tool.OpenTargets_get_variant_credible_sets`
- `tooluniverse.tool.OpenTargets_get_variant_info`
- `tooluniverse.tool.OpenTargets_search_gwas_studies_by_disease`
- `tooluniverse.tool.SPrediXcan_associate`
- `tooluniverse.tool.gwas_get_associations_for_snp`
- `tooluniverse.tool.gwas_get_snp_by_id`
- `tooluniverse.tool.gwas_search_snps`
- `tooluniverse.tool.gwas_search_studies`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-gwas-finemapping/SKILL.md)；Apache-2.0；原文 SHA-256：`e1b39b4f41eb180cb766b7b70eb03bf55df643ea6f3bf220c3a95b598d09686b`。
