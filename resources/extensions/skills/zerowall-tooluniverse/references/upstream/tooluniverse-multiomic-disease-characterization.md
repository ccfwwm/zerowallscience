# multiomic disease characterization

Comprehensive disease characterization across genomics, transcriptomics, proteomics, and pathways for systems-level understanding. Identifies therapeutic opportunities and biomarker candidates by integrating multi-layer molecular data. Use for full-omics disease deep-dive reports, mechanism mapping, and biomarker-and-target identification from multi-omics data.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- LOOK UP, DON'T GUESS
- COMPUTE, DON'T DESCRIBE
- When to Use This Skill
- Input Parameters
- Pipeline Overview
- Phase 0: Disease Disambiguation (ALWAYS FIRST)
- Phase 1: Genomics Layer
- Phase 2: Transcriptomics Layer
- Phase 3: Proteomics & Interaction Layer
- Phase 4: Pathway & Network Layer
- Phase 5: Gene Ontology & Functional Annotation
- Phase 6: Therapeutic Landscape
- Phase 7: Multi-Omics Integration
- Phase 8: Report Finalization
- Key Tool Parameter Notes

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.DGIdb_get_drug_gene_interactions`
- `tooluniverse.tool.GTEx_get_expression_summary`
- `tooluniverse.tool.HPA_get_rna_expression_by_source`
- `tooluniverse.tool.OpenTargets_get_disease_id_description_by_name`
- `tooluniverse.tool.ReactomeAnalysis_pathway_enrichment`
- `tooluniverse.tool.STRING_get_network`
- `tooluniverse.tool.UniProt_get_function_by_accession`
- `tooluniverse.tool.enrichr_gene_enrichment_analysis`
- `tooluniverse.tool.expression_atlas_disease_target_score`
- `tooluniverse.tool.gnomad_get_gene_constraints`
- `tooluniverse.tool.gwas_get_snps_for_gene`
- `tooluniverse.tool.gwas_search_associations`
- `tooluniverse.tool.humanbase_ppi_analysis`
- `tooluniverse.tool.intact_get_interactions`
- `tooluniverse.tool.kegg_search_pathway`
- `tooluniverse.tool.search_clinical_trials`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-multiomic-disease-characterization/SKILL.md)；Apache-2.0；原文 SHA-256：`f8860fc44134d384de8a63761e98a7b3023c2e73a62f94265fb43b7e664a9e60`。
