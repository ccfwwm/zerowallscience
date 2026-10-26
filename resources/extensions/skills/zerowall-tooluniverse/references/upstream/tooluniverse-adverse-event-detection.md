# adverse event detection

Detect and analyze adverse drug event signals using FDA FAERS reports, drug labels, and disproportionality statistics (PRR, ROR, IC). Generates quantitative safety signal scores (0-100) with evidence grading. Use for post-market surveillance, pharmacovigilance, drug safety assessment, regulatory submissions, and detecting rare AE signals not visible in clinical trials.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- COMPUTE, DON'T DESCRIBE
- When to Use
- Workflow Overview
- Phase Summaries
- Phase 0: Input Parsing & Drug Disambiguation
- Phase 1: FAERS Adverse Event Profiling
- Phase 2: Disproportionality Analysis (Signal Detection)
- Phase 3: FDA Label Safety Information
- Phase 4: Mechanism-Based Adverse Event Context
- Phase 5: Comparative Safety Analysis
- Phase 6: Drug-Drug Interactions & Risk Factors
- Phase 7: Literature Evidence
- Phase 8: Risk Assessment & Safety Signal Score
- Phase 9: Report Synthesis
- Edge Cases

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.ADMETAI_predict_CYP_interactions`
- `tooluniverse.tool.ADMETAI_predict_toxicity`
- `tooluniverse.tool.DailyMed_parse_drug_interactions`
- `tooluniverse.tool.EuropePMC_search_articles`
- `tooluniverse.tool.FAERS_calculate_disproportionality`
- `tooluniverse.tool.FAERS_compare_drugs`
- `tooluniverse.tool.FAERS_count_additive_adverse_reactions`
- `tooluniverse.tool.FAERS_count_additive_seriousness_classification`
- `tooluniverse.tool.FAERS_count_death_related_by_drug`
- `tooluniverse.tool.FAERS_count_outcomes_by_drug_event`
- `tooluniverse.tool.FAERS_count_patient_age_distribution`
- `tooluniverse.tool.FAERS_count_reactions_by_drug_event`
- `tooluniverse.tool.FAERS_count_reportercountry_by_drug_event`
- `tooluniverse.tool.FAERS_count_seriousness_by_drug_event`
- `tooluniverse.tool.FAERS_filter_serious_events`
- `tooluniverse.tool.FAERS_rollup_meddra_hierarchy`
- `tooluniverse.tool.FAERS_stratify_by_demographics`
- `tooluniverse.tool.FDA_get_adverse_reactions_by_drug_name`
- `tooluniverse.tool.FDA_get_boxed_warning_info_by_drug_name`
- `tooluniverse.tool.FDA_get_contraindications_by_drug_name`
- `tooluniverse.tool.FDA_get_drug_interactions_by_drug_name`
- `tooluniverse.tool.FDA_get_geriatric_use_info_by_drug_name`
- `tooluniverse.tool.FDA_get_pediatric_use_info_by_drug_name`
- `tooluniverse.tool.FDA_get_pharmacogenomics_info_by_drug_name`
- `tooluniverse.tool.FDA_get_pregnancy_or_breastfeeding_info_by_drug_name`
- `tooluniverse.tool.FDA_get_warnings_by_drug_name`
- `tooluniverse.tool.OpenTargets_get_drug_adverse_events_by_chemblId`
- `tooluniverse.tool.OpenTargets_get_drug_blackbox_status_by_chembl_ID`
- `tooluniverse.tool.OpenTargets_get_drug_chembId_by_generic_name`
- `tooluniverse.tool.OpenTargets_get_drug_indications_by_chemblId`
- `tooluniverse.tool.OpenTargets_get_drug_mechanisms_of_action_by_chemblId`
- `tooluniverse.tool.OpenTargets_get_drug_warnings_by_chemblId`
- `tooluniverse.tool.OpenTargets_get_target_safety_profile_by_ensemblID`
- `tooluniverse.tool.PharmGKB_get_dosing_guidelines`
- `tooluniverse.tool.PharmGKB_get_drug_details`
- `tooluniverse.tool.PharmGKB_search_drugs`
- `tooluniverse.tool.PubMed_search_articles`
- `tooluniverse.tool.drugbank_get_drug_interactions_by_drug_name_or_id`
- `tooluniverse.tool.drugbank_get_safety_by_drug_name_or_drugbank_id`
- `tooluniverse.tool.drugbank_get_targets_by_drug_name_or_drugbank_id`
- `tooluniverse.tool.fda_pharmacogenomic_biomarkers`
- `tooluniverse.tool.openalex_search_works`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-adverse-event-detection/SKILL.md)；Apache-2.0；原文 SHA-256：`d901125b646f76a556a4226c35ebe328e2498dcd45ebfb1502d7752ef3519a7b`。
