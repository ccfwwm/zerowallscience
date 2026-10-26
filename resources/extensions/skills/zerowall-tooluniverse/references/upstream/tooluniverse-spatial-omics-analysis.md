# spatial omics analysis

Spatial multi-omics interpretation pipeline. Transforms spatially variable genes (SVGs), domain annotations, and tissue context into biological insights via domain-by-domain characterization, cell-type composition, spatial gene expression patterns, RNA+protein+metabolite integration. Use for Visium, MERFISH, seqFISH, Slide-seq, spatial proteomics, and spatial multi-omics interpretation. Goes beyond statistics to disease mechanisms and therapeutic opportunities.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- LOOK UP, DON'T GUESS
- COMPUTE, DON'T DESCRIBE
- When to Use This Skill
- Input Parameters
- Spatial Omics Integration Score (0-100)
- Evidence Grading
- Analysis Phases Overview
- Phase 0: Input Processing & Disambiguation (ALWAYS FIRST)
- Phase 1: Gene Characterization
- Phase 2: Pathway & Functional Enrichment
- Phase 3: Spatial Domain Characterization
- Phase 4: Cell-Cell Interaction Inference
- Phase 5: Disease & Therapeutic Context
- Phase 6: Multi-Modal Integration
- Phase 7: Immune Microenvironment (Cancer/Inflammation only)
- Phase 8: Literature & Validation Context
- Data Discovery: HuBMAP Spatial Atlas Tools
- Report Structure
- Completeness Checklist
- Common Use Cases
- Summary

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.DGIdb_get_drug_gene_interactions`
- `tooluniverse.tool.DGIdb_get_gene_druggability`
- `tooluniverse.tool.GO_get_annotations_for_gene`
- `tooluniverse.tool.HPA_get_biological_processes_by_gene`
- `tooluniverse.tool.HPA_get_cancer_prognostics_by_gene`
- `tooluniverse.tool.HPA_get_comprehensive_gene_details_by_ensembl_id`
- `tooluniverse.tool.HPA_get_protein_interactions_by_gene`
- `tooluniverse.tool.HPA_get_rna_expression_by_source`
- `tooluniverse.tool.HPA_get_rna_expression_in_specific_tissues`
- `tooluniverse.tool.HPA_get_subcellular_location`
- `tooluniverse.tool.HPA_search_genes_by_query`
- `tooluniverse.tool.HuBMAP_get_dataset`
- `tooluniverse.tool.HuBMAP_list_organs`
- `tooluniverse.tool.HuBMAP_search_datasets`
- `tooluniverse.tool.MyGene_query_genes`
- `tooluniverse.tool.OpenTargets_get_associated_drugs_by_target_ensemblID`
- `tooluniverse.tool.OpenTargets_get_associated_targets_by_disease_efoId`
- `tooluniverse.tool.OpenTargets_get_disease_description_by_efoId`
- `tooluniverse.tool.OpenTargets_get_disease_id_description_by_name`
- `tooluniverse.tool.OpenTargets_get_target_tractability_by_ensemblID`
- `tooluniverse.tool.PubMed_search_articles`
- `tooluniverse.tool.ReactomeAnalysis_pathway_enrichment`
- `tooluniverse.tool.Reactome_get_interactor`
- `tooluniverse.tool.Reactome_map_uniprot_to_pathways`
- `tooluniverse.tool.STRING_functional_enrichment`
- `tooluniverse.tool.STRING_get_interaction_partners`
- `tooluniverse.tool.STRING_get_protein_interactions`
- `tooluniverse.tool.UniProtIDMap_gene_to_uniprot`
- `tooluniverse.tool.UniProt_get_function_by_accession`
- `tooluniverse.tool.WikiPathways_search`
- `tooluniverse.tool.civic_search_genes`
- `tooluniverse.tool.iedb_search_epitopes`
- `tooluniverse.tool.intact_search_interactions`
- `tooluniverse.tool.kegg_get_pathway_info`
- `tooluniverse.tool.kegg_search_pathway`
- `tooluniverse.tool.openalex_literature_search`
- `tooluniverse.tool.search_clinical_trials`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-spatial-omics-analysis/SKILL.md)；Apache-2.0；原文 SHA-256：`ef24bfaa9edebb2e0b4222ce2381292a450b258de66954080afefe9d0ffd172d`。
