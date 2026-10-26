# drug target validation

Quantitative drug-target validation pipeline. Scores druggability, selectivity, safety profile, ADMET feasibility, and structural tractability with a composite Target Validation Score (0-100) and GO/NO-GO recommendation. Use for go/no-go decisions on a target before commit-to-medchem, target prioritization across a list, and target-deselection rationale.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Reasoning Before Searching
- COMPUTE, DON'T DESCRIBE
- Key Principles
- When to Use
- Input Parameters
- Scoring Overview
- Pipeline Phases
- Phase 0: Target Disambiguation (ALWAYS FIRST)
- Phase 1: Disease Association (0-30 pts)
- Phase 2: Druggability (0-25 pts)
- Phase 2b: Kinase-Specific Structural Data (KLIFS)
- Phase 3: Chemical Matter (feeds Phase 2 scoring)
- Phase 3b: ADMET-AI Deep-Learning Profile (REQUIRED)
- Phase 4: Clinical Precedent (0-15 pts)
- Phase 5: Safety (0-20 pts)
- Phase 6: Pathway Context
- Phase 7: Validation Evidence (0-10 pts)
- Phase 8: Structural Insights
- Phase 9: Literature Deep Dive
- Phase 10: Validation Roadmap (Synthesis)
- Report Output

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.ADMETAI_predict_BBB_penetrance`
- `tooluniverse.tool.ADMETAI_predict_CYP_interactions`
- `tooluniverse.tool.ADMETAI_predict_bioavailability`
- `tooluniverse.tool.ADMETAI_predict_clearance_distribution`
- `tooluniverse.tool.ADMETAI_predict_nuclear_receptor_activity`
- `tooluniverse.tool.ADMETAI_predict_physicochemical_properties`
- `tooluniverse.tool.ADMETAI_predict_solubility_lipophilicity_hydration`
- `tooluniverse.tool.ADMETAI_predict_stress_response`
- `tooluniverse.tool.ADMETAI_predict_toxicity`
- `tooluniverse.tool.BindingDB_get_ligands_by_uniprot`
- `tooluniverse.tool.CTD_get_gene_diseases`
- `tooluniverse.tool.ChEMBL_get_target_activities`
- `tooluniverse.tool.ChEMBL_search_mechanisms`
- `tooluniverse.tool.ChEMBL_search_targets`
- `tooluniverse.tool.DGIdb_get_gene_druggability`
- `tooluniverse.tool.DGIdb_get_gene_info`
- `tooluniverse.tool.DepMap_get_gene_dependencies`
- `tooluniverse.tool.ESMFold_predict_structure`
- `tooluniverse.tool.EuropePMC_search_articles`
- `tooluniverse.tool.FDA_get_adverse_reactions_by_drug_name`
- `tooluniverse.tool.FDA_get_boxed_warning_info_by_drug_name`
- `tooluniverse.tool.FDA_get_indications_by_drug_name`
- `tooluniverse.tool.FDA_get_mechanism_of_action_by_drug_name`
- `tooluniverse.tool.GTEx_get_median_gene_expression`
- `tooluniverse.tool.HPA_get_comprehensive_gene_details_by_ensembl_id`
- `tooluniverse.tool.HPA_search_genes_by_query`
- `tooluniverse.tool.InterPro_get_domain_details`
- `tooluniverse.tool.InterPro_get_protein_domains`
- `tooluniverse.tool.KLIFS_get_kinase`
- `tooluniverse.tool.KLIFS_get_ligands`
- `tooluniverse.tool.KLIFS_get_structures`
- `tooluniverse.tool.KLIFS_get_structures_by_pdb`
- `tooluniverse.tool.KLIFS_list_kinases`
- `tooluniverse.tool.MyGene_query_genes`
- `tooluniverse.tool.OpenTargets_get_associated_drugs_by_target_ensemblID`
- `tooluniverse.tool.OpenTargets_get_biological_mouse_models_by_ensemblID`
- `tooluniverse.tool.OpenTargets_get_chemical_probes_by_target_ensemblID`
- `tooluniverse.tool.OpenTargets_get_diseases_phenotypes_by_target_ensembl`
- `tooluniverse.tool.OpenTargets_get_drug_adverse_events_by_chemblId`
- `tooluniverse.tool.OpenTargets_get_drug_warnings_by_chemblId`
- `tooluniverse.tool.OpenTargets_get_evidence_by_datasource`
- `tooluniverse.tool.OpenTargets_get_publications_by_target_ensemblID`
- `tooluniverse.tool.OpenTargets_get_target_classes_by_ensemblID`
- `tooluniverse.tool.OpenTargets_get_target_gene_ontology_by_ensemblID`
- `tooluniverse.tool.OpenTargets_get_target_homologues_by_ensemblID`
- `tooluniverse.tool.OpenTargets_get_target_id_description_by_name`
- `tooluniverse.tool.OpenTargets_get_target_safety_profile_by_ensemblID`
- `tooluniverse.tool.OpenTargets_get_target_tractability_by_ensemblID`
- `tooluniverse.tool.OpenTargets_target_disease_evidence`
- `tooluniverse.tool.Pharos_get_target`
- `tooluniverse.tool.ProteinsPlus_predict_binding_sites`
- `tooluniverse.tool.PubChem_get_assay_active_compounds`
- `tooluniverse.tool.PubChem_search_assays_by_target_gene`
- `tooluniverse.tool.PubMed_search_articles`
- `tooluniverse.tool.Reactome_map_uniprot_to_pathways`
- `tooluniverse.tool.STRING_functional_enrichment`
- `tooluniverse.tool.STRING_get_protein_interactions`
- `tooluniverse.tool.TCDB_get_transporter`
- `tooluniverse.tool.TCDB_search_by_substrate`
- `tooluniverse.tool.TargetMine_search`
- `tooluniverse.tool.TargetMine_search_genes`
- `tooluniverse.tool.UniProt_get_alternative_names_by_accession`
- `tooluniverse.tool.UniProt_get_entry_by_accession`
- `tooluniverse.tool.UniProt_get_function_by_accession`
- `tooluniverse.tool.alphafold_get_prediction`
- `tooluniverse.tool.alphafold_get_summary`
- `tooluniverse.tool.drugbank_get_targets_by_drug_name_or_drugbank_id`
- `tooluniverse.tool.ensembl_get_xrefs`
- `tooluniverse.tool.ensembl_lookup_gene`
- `tooluniverse.tool.get_protein_metadata_by_pdb_id`
- `tooluniverse.tool.gnomad_get_gene_constraints`
- `tooluniverse.tool.gwas_get_snps_for_gene`
- `tooluniverse.tool.gwas_search_studies`
- `tooluniverse.tool.intact_get_interactions`
- `tooluniverse.tool.openalex_search_works`
- `tooluniverse.tool.pdbe_get_entry_quality`
- `tooluniverse.tool.pdbe_get_entry_summary`
- `tooluniverse.tool.search_clinical_trials`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-drug-target-validation/SKILL.md)；Apache-2.0；原文 SHA-256：`12f9fd8138d7487fcaa7fb95e983ed0fee5cbb0ae1243503948972a98d72301a`。
