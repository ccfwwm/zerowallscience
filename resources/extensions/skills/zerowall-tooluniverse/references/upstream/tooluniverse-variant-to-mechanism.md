# variant to mechanism

End-to-end variant-to-mechanism analysis — trace a variant (rsID/coordinates) through regulatory context, target gene(s), molecular pathway(s), and phenotypic consequences. Integrates 7+ databases across 3 evidence layers (regulatory, molecular, disease) for a mechanistic model. Use for GWAS-hit-to-mechanism, eQTL-causal-gene tracing, and full causal-chain reports.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- LOOK UP, DON'T GUESS
- When to Use This Skill
- Input Parameters
- Workflow Overview
- Phase 1: Variant Characterization
- Phase 2: Regulatory Context
- 2a: GWAS Associations
- 2b: RegulomeDB Score
- 2c: ENCODE Chromatin Context
- 2d: cCRE Overlap (if coordinates known)
- 2e: OLS Trait Resolution (if trait provided)
- Phase 3: Target Gene Identification
- 3a: GTEx eQTLs (primary evidence)
- 3b: OpenTargets Locus-to-Gene (L2G)
- 3c: Nearest Gene Mapping
- How to Reason About Target Gene Identification
- Phase 4: Gene Function & Pathways
- Phase 5: Disease Connection
- Phase 6: Mechanistic Synthesis
- How to Build and Evaluate the Causal Chain
- Evidence Grading
- Common Mistakes and Fallbacks
- Reasoning Through Common Scenarios
- Scenario 1: Non-coding variant with clear regulatory signal

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.DISGENET_API_KEY`
- `tooluniverse.tool.DisGeNET_search_gene`
- `tooluniverse.tool.ENCODE_search_chromatin_accessibility`
- `tooluniverse.tool.ENCODE_search_histone_experiments`
- `tooluniverse.tool.EnsemblVEP_annotate_rsid`
- `tooluniverse.tool.FAVOR_annotate_variant`
- `tooluniverse.tool.GTEx_get_median_gene_expression`
- `tooluniverse.tool.GTEx_query_eqtl`
- `tooluniverse.tool.GenCC_search_gene`
- `tooluniverse.tool.MyGene_query_genes`
- `tooluniverse.tool.MyVariant_query_variants`
- `tooluniverse.tool.OpenTargets_get_diseases_phenotypes_by_target_ensembl`
- `tooluniverse.tool.OpenTargets_get_variant_credible_sets`
- `tooluniverse.tool.OpenTargets_search_gwas_studies_by_disease`
- `tooluniverse.tool.OpenTargets_target_disease_evidence`
- `tooluniverse.tool.PANTHER_enrichment`
- `tooluniverse.tool.ReactomeAnalysis_pathway_enrichment`
- `tooluniverse.tool.RegulomeDB_query_variant`
- `tooluniverse.tool.STRING_get_enrichment`
- `tooluniverse.tool.STRING_get_interaction_partners`
- `tooluniverse.tool.UCSC_get_encode_cCREs`
- `tooluniverse.tool.UniProt_get_function_by_accession`
- `tooluniverse.tool.gwas_get_associations_for_trait`
- `tooluniverse.tool.gwas_search_associations`
- `tooluniverse.tool.gwas_search_snps`
- `tooluniverse.tool.ols_search_terms`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-variant-to-mechanism/SKILL.md)；Apache-2.0；原文 SHA-256：`6b312cc34cf11f920210f3412b9a3e09a5be469c5c333567547a2d73f0266085`。
