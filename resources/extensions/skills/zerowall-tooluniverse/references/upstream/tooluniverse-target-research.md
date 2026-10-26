# target research

Comprehensive drug-target intelligence — tissue expression (GTEx, HPA), pathways, protein interactions (STRING), variant landscape (ClinVar, gnomAD), druggability (DGIdb, ChEMBL approved drugs). 9 parallel research paths with citations. Use for full target profile reports, target characterization for drug discovery, and 'tell me about target X' queries.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- LOOK UP, DON'T GUESS
- When to Use This Skill
- Target Evaluation Reasoning Framework
- Phase 0: Tool Parameter Verification (CRITICAL)
- Critical Workflow Requirements
- Core Strategy: 9 Research Paths
- Identifier Resolution (Phase 1)
- PATH 0: Open Targets Foundation (ALWAYS FIRST)
- PATH 1: Core Identity
- PATH 2: Structure & Domains
- PATH 3: Function & Pathways
- PATH 4: Protein Interactions
- PATH 5: Expression Profile
- PATH 6: Variants & Disease
- PATH 7: Druggability & Target Validation
- PATH 8: Literature & Research (Collision-Aware)
- Retry Logic & Fallback Chains
- Completeness Audit (REQUIRED before finalizing)
- Report Template
- Synthesis: Target Assessment Framework

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.BindingDB_get_ligands_by_uniprot`
- `tooluniverse.tool.BioGRID_get_interactions`
- `tooluniverse.tool.CELLxGENE_get_expression_data`
- `tooluniverse.tool.ChEMBL_get_target_activities`
- `tooluniverse.tool.ChEMBL_search_targets`
- `tooluniverse.tool.ClinVar_search_variants`
- `tooluniverse.tool.DGIdb_get_drug_gene_interactions`
- `tooluniverse.tool.DGIdb_get_gene_druggability`
- `tooluniverse.tool.DepMap_get_gene_dependencies`
- `tooluniverse.tool.DisGeNET_search_gene`
- `tooluniverse.tool.EuropePMC_get_citations`
- `tooluniverse.tool.EuropePMC_search_articles`
- `tooluniverse.tool.GO_get_annotations_for_gene`
- `tooluniverse.tool.GPCRdb_get_ligands`
- `tooluniverse.tool.GPCRdb_get_protein`
- `tooluniverse.tool.GPCRdb_get_structures`
- `tooluniverse.tool.GTEx_get_median_gene_expression`
- `tooluniverse.tool.GtoPdb_search_ligands`
- `tooluniverse.tool.HPA_get_cancer_prognostics_by_gene`
- `tooluniverse.tool.HPA_get_comparative_expression_by_gene_and_cellline`
- `tooluniverse.tool.HPA_get_comprehensive_gene_details_by_ensembl_id`
- `tooluniverse.tool.HPA_get_protein_interactions_by_gene`
- `tooluniverse.tool.HPA_get_rna_expression_by_source`
- `tooluniverse.tool.HPA_get_subcellular_location`
- `tooluniverse.tool.InterProScan_scan_sequence`
- `tooluniverse.tool.InterPro_get_protein_domains`
- `tooluniverse.tool.MyGene_get_gene_annotation`
- `tooluniverse.tool.OpenTargets_get_associated_drugs_by_target_ensemblID`
- `tooluniverse.tool.OpenTargets_get_biological_mouse_models_by_ensemblID`
- `tooluniverse.tool.OpenTargets_get_chemical_probes_by_target_ensemblID`
- `tooluniverse.tool.OpenTargets_get_diseases_phenotypes_by_target_ensembl`
- `tooluniverse.tool.OpenTargets_get_graphql_schema`
- `tooluniverse.tool.OpenTargets_get_publications_by_target_ensemblID`
- `tooluniverse.tool.OpenTargets_get_target_gene_ontology_by_ensemblID`
- `tooluniverse.tool.OpenTargets_get_target_interactions_by_ensemblID`
- `tooluniverse.tool.OpenTargets_get_target_safety_profile_by_ensemblID`
- `tooluniverse.tool.OpenTargets_get_target_tractability_by_ensemblID`
- `tooluniverse.tool.OpenTargets_query_graphql`
- `tooluniverse.tool.PDB_search_similar_structures`
- `tooluniverse.tool.Pharos_get_target`
- `tooluniverse.tool.PubChem_search_assays_by_target_gene`
- `tooluniverse.tool.PubMed_get_related`
- `tooluniverse.tool.PubMed_search_articles`
- `tooluniverse.tool.PubTator3_LiteratureSearch`
- `tooluniverse.tool.RCSBData_get_entry`
- `tooluniverse.tool.Reactome_map_uniprot_to_pathways`
- `tooluniverse.tool.STRING_get_protein_interactions`
- `tooluniverse.tool.UniProt_get_alternative_names_by_accession`
- `tooluniverse.tool.UniProt_get_entry_by_accession`
- `tooluniverse.tool.UniProt_get_function_by_accession`
- `tooluniverse.tool.UniProt_get_ptm_processing_by_accession`
- `tooluniverse.tool.UniProt_get_recommended_name_by_accession`
- `tooluniverse.tool.UniProt_get_subcellular_location_by_accession`
- `tooluniverse.tool.WikiPathways_search`
- `tooluniverse.tool.alphafold_get_prediction`
- `tooluniverse.tool.cBioPortal_get_mutations`
- `tooluniverse.tool.civic_get_variants_by_gene`
- `tooluniverse.tool.enrichr_gene_enrichment_analysis`
- `tooluniverse.tool.ensembl_get_xrefs`
- `tooluniverse.tool.get_tool_info`
- `tooluniverse.tool.gnomad_get_gene_constraints`
- `tooluniverse.tool.intact_get_complex_details`
- `tooluniverse.tool.intact_get_interactions`
- `tooluniverse.tool.kegg_get_gene_info`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-target-research/SKILL.md)；Apache-2.0；原文 SHA-256：`100f7da4440035e5b0afdaad3a2b2b70655158e2fde67ce59e4d81d991de2c82`。
