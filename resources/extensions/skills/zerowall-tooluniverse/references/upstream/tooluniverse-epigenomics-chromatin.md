# epigenomics chromatin

Histone-modification ChIP-seq, ATAC-seq accessibility, chromatin state, and TF binding analysis from ENCODE, Roadmap Epigenomics, ChIP-Atlas. Use for chromatin-state-by-tissue queries, TF-binding-by-region, regulatory landscape mapping, and ENCODE-cCRE annotations. For DNA methylation use tooluniverse-epigenomics; for RNA-seq use tooluniverse-rnaseq-deseq2.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- NOT for (use other skills instead)
- Reasoning: Classify the Question First
- Reasoning: Histone Marks
- Reasoning: eQTL Interpretation
- Reasoning: Variant Regulatory Impact
- Phase 0: Disambiguation
- Phase 1: Histone Modification & ChIP-seq
- Phase 2: Chromatin Accessibility & Architecture
- Phase 3: Regulatory Element Identification
- Phase 4: eQTL Analysis
- Phase 5: Gene Expression Context
- Phase 6: Transcription Factor Binding
- Phase 7: Variant Regulatory Scoring
- Phase 8: Integration
- Fallback Strategies

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.ENCODE_get_chromatin_state`
- `tooluniverse.tool.ENCODE_search_annotations`
- `tooluniverse.tool.ENCODE_search_chromatin_accessibility`
- `tooluniverse.tool.ENCODE_search_histone_experiments`
- `tooluniverse.tool.ENCODE_search_rnaseq_experiments`
- `tooluniverse.tool.GEO_search_atacseq_datasets`
- `tooluniverse.tool.GEO_search_chipseq_datasets`
- `tooluniverse.tool.GEO_search_rnaseq_datasets`
- `tooluniverse.tool.GTEx_calculate_eqtl`
- `tooluniverse.tool.GTEx_get_expression_summary`
- `tooluniverse.tool.GTEx_get_median_gene_expression`
- `tooluniverse.tool.GTEx_get_multi_tissue_eqtls`
- `tooluniverse.tool.GTEx_get_single_tissue_eqtls`
- `tooluniverse.tool.GTEx_get_tissue_sites`
- `tooluniverse.tool.GTEx_query_eqtl`
- `tooluniverse.tool.MyGene_query_genes`
- `tooluniverse.tool.OpenTargets_get_credible_set_colocalisation`
- `tooluniverse.tool.ReMap_get_transcription_factor_binding`
- `tooluniverse.tool.RegulomeDB_query_variant`
- `tooluniverse.tool.SCREEN_get_regulatory_elements`
- `tooluniverse.tool.STRING_get_functional_annotations`
- `tooluniverse.tool.UCSC_get_encode_cCREs`
- `tooluniverse.tool.ensembl_lookup_gene`
- `tooluniverse.tool.jaspar_get_matrix`
- `tooluniverse.tool.jaspar_search_matrices`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-epigenomics-chromatin/SKILL.md)；Apache-2.0；原文 SHA-256：`d1b23b650b69779700d5d41053739bdcfcaecce37c1313bac1408a1805b7f069`。
