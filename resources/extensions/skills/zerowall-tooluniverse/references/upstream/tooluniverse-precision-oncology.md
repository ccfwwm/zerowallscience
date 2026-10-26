# precision oncology

Cancer treatment recommendations from molecular profile (mutations + cancer type + biomarkers) — FDA-approved + investigational therapies, resistance mechanisms, matching clinical trials, prognosis. Uses CIViC, ClinVar, OpenTargets, ClinicalTrials.gov. Use for tumor-board treatment recommendations, evidence-tiered actionability assessment, and FDA-precedent-driven therapy selection.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Domain Reasoning
- Treatment Selection Reasoning
- LOOK UP DON'T GUESS
- When to Use
- Phase 0: Tool Verification
- Workflow Overview
- Key Tools by Phase
- Phase 1: Profile Validation
- Phase 2: Variant Interpretation
- Phase 2.5: Tumor Expression
- Phase 3: Treatment Options
- Phase 3.5: Pathway & Network
- Phase 4: Resistance Analysis
- Phase 5: Clinical Trials
- Phase 5.5: Safety & Pharmacogenomics (MANDATORY — do NOT skip)
- Phase 6: Literature

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.BioRxiv_list_recent_preprints`
- `tooluniverse.tool.CELLxGENE_get_cell_metadata`
- `tooluniverse.tool.CELLxGENE_get_expression_data`
- `tooluniverse.tool.COSMIC_get_mutations_by_gene`
- `tooluniverse.tool.COSMIC_search_mutations`
- `tooluniverse.tool.CPIC_list_guidelines`
- `tooluniverse.tool.ChEMBL_get_drug_mechanisms`
- `tooluniverse.tool.ChEMBL_search_targets`
- `tooluniverse.tool.DGIdb_get_drug_gene_interactions`
- `tooluniverse.tool.DailyMed_search_spls`
- `tooluniverse.tool.DepMap_get_gene_dependencies`
- `tooluniverse.tool.FAERS_count_death_related_by_drug`
- `tooluniverse.tool.FAERS_search_adverse_event_reports`
- `tooluniverse.tool.FDA_get_warnings_and_cautions_by_drug_name`
- `tooluniverse.tool.GDC_get_clinical_data`
- `tooluniverse.tool.GDC_get_cnv_data`
- `tooluniverse.tool.GDC_get_gene_expression`
- `tooluniverse.tool.GDC_get_mutation_frequency`
- `tooluniverse.tool.GDC_get_ssm_by_gene`
- `tooluniverse.tool.GDC_get_survival`
- `tooluniverse.tool.HPA_get_comparative_expression_by_gene_and_cellline`
- `tooluniverse.tool.HPA_search_genes_by_query`
- `tooluniverse.tool.MedRxiv_get_preprint`
- `tooluniverse.tool.MyGene_query_genes`
- `tooluniverse.tool.ONCOKB_API_TOKEN`
- `tooluniverse.tool.OncoKB_annotate_variant`
- `tooluniverse.tool.OncoKB_get_gene_info`
- `tooluniverse.tool.OpenTargets_get_associated_drugs_by_target_ensemblID`
- `tooluniverse.tool.PharmacoDB_get_experiments`
- `tooluniverse.tool.Progenetix_cnv_search`
- `tooluniverse.tool.PubMed_search_articles`
- `tooluniverse.tool.UniProt_search`
- `tooluniverse.tool.alphafold_get_prediction`
- `tooluniverse.tool.cBioPortal_get_cancer_studies`
- `tooluniverse.tool.cBioPortal_get_mutations`
- `tooluniverse.tool.civic_get_evidence_item`
- `tooluniverse.tool.civic_get_variant`
- `tooluniverse.tool.civic_search_evidence_items`
- `tooluniverse.tool.civic_search_variants`
- `tooluniverse.tool.fda_pharmacogenomic_biomarkers`
- `tooluniverse.tool.get_clinical_trial_eligibility_criteria`
- `tooluniverse.tool.get_diffdock_info`
- `tooluniverse.tool.intact_get_interaction_network`
- `tooluniverse.tool.kegg_find_genes`
- `tooluniverse.tool.kegg_get_gene_info`
- `tooluniverse.tool.openalex_search_works`
- `tooluniverse.tool.reactome_disease_target_score`
- `tooluniverse.tool.search_clinical_trials`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-precision-oncology/SKILL.md)；Apache-2.0；原文 SHA-256：`22c6d768068b9d5246eff339e6ae03459ff7ac653d84c1a3378b55f864f8c80b`。
