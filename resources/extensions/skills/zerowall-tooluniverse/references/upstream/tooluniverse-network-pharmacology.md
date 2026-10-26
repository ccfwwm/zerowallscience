# network pharmacology

Compound-target-disease network construction and analysis for drug repurposing, polypharmacology discovery, and multi-target drug design. Uses STRING, BioGRID, ChEMBL, DGIdb, OMIM, OpenTargets. Use for off-target effect prediction, network-based drug repurposing, and identifying molecules with desired multi-target profile.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- COMPUTE, DON'T DESCRIBE
- Polypharmacology Reasoning (Start Here)
- When to Use This Skill
- Key Principles
- Network Pharmacology Score (0-100)
- Workflow Overview
- Phase 1: Network Node Identification
- Phase 2: Network Edge Construction
- Phase 3: Network Analysis
- Phase 4: Drug Repurposing Predictions
- Phase 5: Polypharmacology Analysis
- Phase 6: Safety and Toxicity Context
- Phase 7: Validation Evidence
- Phase 8: Report Generation
- Critical Tool Parameter Notes
- Fallback Strategies

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.ADMETAI_predict_toxicity`
- `tooluniverse.tool.CTD_get_chemical_diseases`
- `tooluniverse.tool.CTD_get_chemical_gene_interactions`
- `tooluniverse.tool.ChEMBL_get_target_activities`
- `tooluniverse.tool.ClinicalTrials_search_studies`
- `tooluniverse.tool.DGIdb_get_drug_gene_interactions`
- `tooluniverse.tool.DGIdb_get_gene_druggability`
- `tooluniverse.tool.EuropePMC_search_articles`
- `tooluniverse.tool.FAERS_calculate_disproportionality`
- `tooluniverse.tool.FAERS_count_death_related_by_drug`
- `tooluniverse.tool.FAERS_filter_serious_events`
- `tooluniverse.tool.FDA_get_warnings_and_cautions_by_drug_name`
- `tooluniverse.tool.GWAS_search_associations_by_gene`
- `tooluniverse.tool.MyGene_query_genes`
- `tooluniverse.tool.NDEx_get_network`
- `tooluniverse.tool.Network_proximity`
- `tooluniverse.tool.OpenTargets_get_associated_drugs_by_target_ensemblID`
- `tooluniverse.tool.OpenTargets_get_associated_targets_by_disease_efoId`
- `tooluniverse.tool.OpenTargets_get_associated_targets_by_drug_chemblId`
- `tooluniverse.tool.OpenTargets_get_disease_id_description_by_name`
- `tooluniverse.tool.OpenTargets_get_drug_adverse_events_by_chemblId`
- `tooluniverse.tool.OpenTargets_get_drug_chembId_by_generic_name`
- `tooluniverse.tool.OpenTargets_get_drug_mechanisms_of_action_by_chemblId`
- `tooluniverse.tool.OpenTargets_get_target_classes_by_ensemblID`
- `tooluniverse.tool.OpenTargets_get_target_id_description_by_name`
- `tooluniverse.tool.OpenTargets_get_target_safety_profile_by_ensemblID`
- `tooluniverse.tool.OpenTargets_get_target_tractability_by_ensemblID`
- `tooluniverse.tool.OpenTargets_target_disease_evidence`
- `tooluniverse.tool.PharmGKB_get_drug_details`
- `tooluniverse.tool.Pharos_get_target`
- `tooluniverse.tool.PubChem_get_CID_by_compound_name`
- `tooluniverse.tool.PubMed_search_articles`
- `tooluniverse.tool.ReactomeAnalysis_pathway_enrichment`
- `tooluniverse.tool.STRING_functional_enrichment`
- `tooluniverse.tool.STRING_get_interaction_partners`
- `tooluniverse.tool.STRING_get_network`
- `tooluniverse.tool.STRING_ppi_enrichment`
- `tooluniverse.tool.drugbank_get_drug_basic_info_by_drug_name_or_id`
- `tooluniverse.tool.drugbank_get_drug_name_and_description_by_target_name`
- `tooluniverse.tool.drugbank_get_pathways_reactions_by_drug_or_id`
- `tooluniverse.tool.drugbank_get_targets_by_drug_name_or_drugbank_id`
- `tooluniverse.tool.enrichr_gene_enrichment_analysis`
- `tooluniverse.tool.ensembl_lookup_gene`
- `tooluniverse.tool.get_clinical_trial_descriptions`
- `tooluniverse.tool.gnomad_get_gene_constraints`
- `tooluniverse.tool.humanbase_ppi_analysis`
- `tooluniverse.tool.intact_search_interactions`
- `tooluniverse.tool.ols_search_efo_terms`
- `tooluniverse.tool.search_clinical_trials`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-network-pharmacology/SKILL.md)；Apache-2.0；原文 SHA-256：`1722277f504a269b37c385854d36613e637e9625b9f451d645d34104fdca0d34`。
