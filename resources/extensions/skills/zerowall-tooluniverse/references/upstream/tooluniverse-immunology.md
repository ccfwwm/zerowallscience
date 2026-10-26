# immunology

Immunology research workflows: antibody-antigen interactions, T/B cell repertoire, MHC/HLA binding prediction, autoimmune disease genetics, vaccine epitope mapping. Uses IEDB, IMGT, SAbDab, UniProt. Use for adaptive immunity questions, immune response analysis, antibody/TCR/BCR characterization, immunogenicity prediction, and immune-pathway-to-disease mapping.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- LOOK UP, DON'T GUESS
- COMPUTE, DON'T DESCRIBE
- Reasoning Frameworks
- Antibody / Structural (SAbDab, TheraSAbDab)
- Epitope and Immune Assays (IEDB)
- Immunoglobulin Genes (IMGT)
- Protein Interactions (IntAct, BioGRID)
- Cytokine / Signaling (OpenTargets, GWAS)
- Clinical / Safety (FAERS, Clinical Trials)
- Autoimmune Genetics (Orphanet)
- Immune Pathways (KEGG, Reactome)
- Tumor Immune Microenvironment
- Parameter Gotchas
- Workflows

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.BioGRID_get_chemical_interactions`
- `tooluniverse.tool.BioGRID_get_interactions`
- `tooluniverse.tool.FAERS_calculate_disproportionality`
- `tooluniverse.tool.FAERS_compare_drugs`
- `tooluniverse.tool.FAERS_filter_serious_events`
- `tooluniverse.tool.FAERS_stratify_by_demographics`
- `tooluniverse.tool.IMGT_get_gene_info`
- `tooluniverse.tool.IMGT_get_sequence`
- `tooluniverse.tool.IMGT_search_genes`
- `tooluniverse.tool.KEGG_get_disease`
- `tooluniverse.tool.KEGG_get_disease_genes`
- `tooluniverse.tool.KEGG_get_pathway_genes`
- `tooluniverse.tool.OpenTargets_get_associated_diseases_by_drug_chemblId`
- `tooluniverse.tool.OpenTargets_get_target_gene_ontology_by_ensemblID`
- `tooluniverse.tool.OpenTargets_get_target_id_description_by_name`
- `tooluniverse.tool.OpenTargets_get_target_interactions_by_ensemblID`
- `tooluniverse.tool.OpenTargets_get_target_safety_profile_by_ensemblID`
- `tooluniverse.tool.Orphanet_get_epidemiology`
- `tooluniverse.tool.Orphanet_get_gene_diseases`
- `tooluniverse.tool.Orphanet_get_genes`
- `tooluniverse.tool.Orphanet_get_natural_history`
- `tooluniverse.tool.Orphanet_get_phenotypes`
- `tooluniverse.tool.Orphanet_search_diseases`
- `tooluniverse.tool.PubMed_search_articles`
- `tooluniverse.tool.ReactomeAnalysis_pathway_enrichment`
- `tooluniverse.tool.Reactome_get_pathway`
- `tooluniverse.tool.Reactome_map_uniprot_to_pathways`
- `tooluniverse.tool.SAbDab_get_structure`
- `tooluniverse.tool.SAbDab_get_summary`
- `tooluniverse.tool.SAbDab_search_structures`
- `tooluniverse.tool.TIMER2_immune_estimation`
- `tooluniverse.tool.TheraSAbDab_get_all_therapeutics`
- `tooluniverse.tool.TheraSAbDab_search_by_target`
- `tooluniverse.tool.TheraSAbDab_search_therapeutics`
- `tooluniverse.tool.gwas_get_snps_for_gene`
- `tooluniverse.tool.gwas_search_associations`
- `tooluniverse.tool.iedb_get_epitope_antigens`
- `tooluniverse.tool.iedb_get_epitope_mhc`
- `tooluniverse.tool.iedb_get_epitope_references`
- `tooluniverse.tool.iedb_get_epitope_tcell_assays`
- `tooluniverse.tool.iedb_search_bcell`
- `tooluniverse.tool.iedb_search_bcr_sequences`
- `tooluniverse.tool.iedb_search_epitopes`
- `tooluniverse.tool.iedb_search_mhc`
- `tooluniverse.tool.iedb_search_tcell_assays`
- `tooluniverse.tool.iedb_search_tcr_sequences`
- `tooluniverse.tool.intact_get_interaction_network`
- `tooluniverse.tool.intact_search_interactions`
- `tooluniverse.tool.kegg_search_pathway`
- `tooluniverse.tool.search_clinical_trials`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-immunology/SKILL.md)；Apache-2.0；原文 SHA-256：`42de77a808043b7228228b7f8795d571920eced4054e08b688ba0bd29f7e970d`。
