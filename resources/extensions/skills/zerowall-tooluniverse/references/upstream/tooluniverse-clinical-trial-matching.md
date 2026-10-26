# clinical trial matching

AI-driven patient-to-trial matching for precision oncology and rare-disease care. Transforms a patient's molecular profile (mutations, biomarkers, expression) and clinical state into ranked clinical-trial recommendations with evidence tiers. Searches ClinicalTrials.gov, the EU CTIS register (European/EEA trials), AND the ISRCTN registry (UK/international) plus cross-references CIViC, OpenTargets, ChEMBL, and FDA labels. Use for matching patients to trials by genotype, biomarker-driven trial selection, trial-eligibility scoring, and finding trials across the US, Europe, and the UK.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Molecular Matching Priority
- LOOK UP, DON'T GUESS
- COMPUTE, DON'T DESCRIBE
- When to Use
- Input Parsing
- Required Input
- Strongly Recommended
- Optional
- Workflow Overview
- Critical Tool Parameters
- Clinical Trial Search Tools
- Batch Trial Detail Tools (all take `nct_ids` array)
- Gene/Disease Resolution
- Drug Information
- Evidence Tools
- Known CIViC Gene IDs
- Critical Parameter Notes
- Scoring Summary
- Parallelization Strategy
- Error Handling

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.CTIS_get_trial`
- `tooluniverse.tool.CTIS_search_trials`
- `tooluniverse.tool.FDA_get_indications_by_drug_name`
- `tooluniverse.tool.ISRCTN_get_trial`
- `tooluniverse.tool.ISRCTN_search_trials`
- `tooluniverse.tool.MyGene_query_genes`
- `tooluniverse.tool.OpenTargets_get_associated_drugs_by_target_ensemblID`
- `tooluniverse.tool.OpenTargets_get_disease_id_description_by_name`
- `tooluniverse.tool.OpenTargets_get_drug_id_description_by_name`
- `tooluniverse.tool.OpenTargets_get_drug_mechanisms_of_action_by_chemblId`
- `tooluniverse.tool.OpenTargets_get_target_id_description_by_name`
- `tooluniverse.tool.PharmGKB_search_genes`
- `tooluniverse.tool.PubMed_search_articles`
- `tooluniverse.tool.civic_get_variants_by_gene`
- `tooluniverse.tool.civic_search_variants`
- `tooluniverse.tool.drugbank_get_targets_by_drug_name_or_drugbank_id`
- `tooluniverse.tool.fda_pharmacogenomic_biomarkers`
- `tooluniverse.tool.get_clinical_trial_conditions_and_interventions`
- `tooluniverse.tool.get_clinical_trial_descriptions`
- `tooluniverse.tool.get_clinical_trial_eligibility_criteria`
- `tooluniverse.tool.get_clinical_trial_locations`
- `tooluniverse.tool.get_clinical_trial_outcome_measures`
- `tooluniverse.tool.get_clinical_trial_status_and_dates`
- `tooluniverse.tool.ols_search_efo_terms`
- `tooluniverse.tool.search_clinical_trials`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-clinical-trial-matching/SKILL.md)；Apache-2.0；原文 SHA-256：`a4471968aabad2c17fc091d576ffd35ae15935f2e71cb6dfbcf80485657e8056`。
