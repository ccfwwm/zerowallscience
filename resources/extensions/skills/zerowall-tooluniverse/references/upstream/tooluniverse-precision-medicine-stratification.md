# precision medicine stratification

Patient stratification for precision medicine — integrate genomic, clinical, and therapeutic data to split patients into responder/non-responder groups, risk tiers, or treatment-decision groups. Use for stratification-by-biomarker, treatment-selection logic, and personalized therapeutic strategy reports per patient subgroup.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Reasoning Before Searching
- COMPUTE, DON'T DESCRIBE
- When to Use
- Input Parsing
- Required
- Optional (improves stratification)
- Disease Type Classification
- Critical Tool Parameter Notes
- Workflow Overview
- Phase 1: Disease Disambiguation & Profile Standardization
- Phase 2: Genetic Risk Assessment
- Phase 3: Disease-Specific Molecular Stratification
- CANCER PATH
- METABOLIC PATH
- CVD PATH
- RARE DISEASE PATH
- Phase 4: Pharmacogenomic Profiling
- Phase 5: Comorbidity & Drug Interaction Risk
- Phase 6: Molecular Pathway Analysis
- Phase 7: Clinical Evidence & Guidelines
- Phase 8: Clinical Trial Matching
- Phase 9: Integrated Scoring & Recommendations
- Score Components (total 0-100)
- Risk Tiers

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.ClinVar_search_variants`
- `tooluniverse.tool.EnsemblVEP_annotate_rsid`
- `tooluniverse.tool.FDA_get_drug_interactions_by_drug_name`
- `tooluniverse.tool.FDA_get_indications_by_drug_name`
- `tooluniverse.tool.GWAS_search_associations_by_gene`
- `tooluniverse.tool.HPA_get_cancer_prognostics_by_gene`
- `tooluniverse.tool.MyGene_query_genes`
- `tooluniverse.tool.OpenTargets_get_associated_drugs_by_disease_efoId`
- `tooluniverse.tool.OpenTargets_get_associated_targets_by_disease_efoId`
- `tooluniverse.tool.OpenTargets_get_disease_id_description_by_name`
- `tooluniverse.tool.OpenTargets_get_target_tractability_by_ensemblID`
- `tooluniverse.tool.OpenTargets_search_gwas_studies_by_disease`
- `tooluniverse.tool.OpenTargets_target_disease_evidence`
- `tooluniverse.tool.PharmGKB_get_clinical_annotations`
- `tooluniverse.tool.PharmGKB_get_dosing_guidelines`
- `tooluniverse.tool.PharmGKB_get_drug_details`
- `tooluniverse.tool.PubMed_Guidelines_Search`
- `tooluniverse.tool.PubMed_search_articles`
- `tooluniverse.tool.ReactomeAnalysis_pathway_enrichment`
- `tooluniverse.tool.Reactome_map_uniprot_to_pathways`
- `tooluniverse.tool.STRING_functional_enrichment`
- `tooluniverse.tool.STRING_get_interaction_partners`
- `tooluniverse.tool.UniProt_get_disease_variants_by_accession`
- `tooluniverse.tool.cBioPortal_get_mutations`
- `tooluniverse.tool.civic_search_assertions`
- `tooluniverse.tool.civic_search_evidence_items`
- `tooluniverse.tool.drugbank_get_drug_interactions_by_drug_name_or_id`
- `tooluniverse.tool.enrichr_gene_enrichment_analysis`
- `tooluniverse.tool.ensembl_lookup_gene`
- `tooluniverse.tool.fda_pharmacogenomic_biomarkers`
- `tooluniverse.tool.gnomad_get_gene_constraints`
- `tooluniverse.tool.gnomad_get_variant`
- `tooluniverse.tool.gwas_get_associations_for_trait`
- `tooluniverse.tool.search_clinical_trials`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-precision-medicine-stratification/SKILL.md)；Apache-2.0；原文 SHA-256：`8b1d6d749f3485b0144b98530d4364c2c75304a9700398ddeeace8353a0afc61`。
