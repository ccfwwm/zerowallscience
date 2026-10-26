# pathway disease genetics

Connect GWAS variants to biological pathways and druggable targets. Maps GWAS hits to causal genes (via fine-mapping/eQTL), then to pathways (Reactome, KEGG, WikiPathways), then to existing drugs hitting those pathways. Use for pathway-level disease mechanisms, druggable-pathway prioritization from GWAS, SNP-to-pathway-to-target tracing, and tissue-specific eQTL evidence for drug target hypotheses.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- COMPUTE, DON'T DESCRIBE
- When to Use
- Core Reasoning Principles
- Gene-to-Pathway Reasoning
- Pathway Convergence
- Druggability Reasoning
- Tool Selection Guide
- Phase 1: Disease Resolution and GWAS Collection
- Phase 2: Variant Annotation and eQTL Evidence
- Phase 3: Pathway Enrichment
- Phase 4: Druggability and Drug Landscape
- Three-Step Workflow
- Step 1: GWAS to Causal Gene
- Step 2: Gene Set to Pathway Enrichment
- Step 3: Pathway to Drug Target
- Key Parameter Gotchas
- Limitations

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.DGIdb_get_drug_gene_interactions`
- `tooluniverse.tool.DGIdb_get_gene_druggability`
- `tooluniverse.tool.EnsemblVEP_annotate_rsid`
- `tooluniverse.tool.GTEx_get_expression_summary`
- `tooluniverse.tool.GTEx_get_median_gene_expression`
- `tooluniverse.tool.GTEx_query_eqtl`
- `tooluniverse.tool.KEGG_get_gene_pathways`
- `tooluniverse.tool.KEGG_get_pathway_genes`
- `tooluniverse.tool.OpenTargets_get_associated_drugs_by_target_ensemblID`
- `tooluniverse.tool.OpenTargets_multi_entity_search_by_query_string`
- `tooluniverse.tool.OpenTargets_target_disease_evidence`
- `tooluniverse.tool.PANTHER_enrichment`
- `tooluniverse.tool.ReactomeAnalysis_pathway_enrichment`
- `tooluniverse.tool.Reactome_get_participants`
- `tooluniverse.tool.Reactome_map_uniprot_to_pathways`
- `tooluniverse.tool.STRING_functional_enrichment`
- `tooluniverse.tool.gwas_get_associations_for_trait`
- `tooluniverse.tool.gwas_get_snps_for_gene`
- `tooluniverse.tool.gwas_get_variants_for_trait`
- `tooluniverse.tool.gwas_search_associations`
- `tooluniverse.tool.humanbase_ppi_analysis`
- `tooluniverse.tool.kegg_find_genes`
- `tooluniverse.tool.kegg_search_pathway`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-pathway-disease-genetics/SKILL.md)；Apache-2.0；原文 SHA-256：`ba6126adcbdab56fa46663c3fa4a2fee9d2a1bd08097cd3500009f769695e24d`。
