# drug research

Comprehensive drug profiling — mechanism, primary/secondary targets, drug interactions, clinical-trial status, adverse events (FAERS), pharmacogenomics, and approval history. Use for full drug investigation reports, 'tell me about drug X' queries, and assembling drug profiles for clinicians, researchers, or regulatory work.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- LOOK UP, DON'T GUESS
- Drug Mechanism Reasoning
- Workflow Overview
- 1. Report-First Approach (MANDATORY)
- 2. Citation Requirements (MANDATORY)
- 3. Progressive Writing Workflow
- Compound Disambiguation (Phase 1)
- Identifier Resolution Chain
- Handle Naming Ambiguity
- Research Paths Summary
- PATH 1: Chemical Properties & CMC
- PATH 2: Mechanism & Targets
- PATH 3: ADMET Properties
- PATH 4: Clinical Trials
- PATH 5: Post-Marketing Safety
- PATH 6: Pharmacogenomics
- PATH 7: Regulatory & Patents
- PATH 8: Real-World Evidence
- PATH 9: Comparative Analysis
- FDA Label Core Fields
- Fallback Chains
- Type Normalization
- Common Use Cases
- When NOT to Use This Skill

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.ChEMBL_get_activity`
- `tooluniverse.tool.ChEMBL_get_molecule_targets`
- `tooluniverse.tool.ChEMBL_get_target`
- `tooluniverse.tool.ChEMBL_search_activities`
- `tooluniverse.tool.ChEMBL_search_drugs`
- `tooluniverse.tool.ChEMBL_search_molecules`
- `tooluniverse.tool.DGIdb_get_drug_info`
- `tooluniverse.tool.DailyMed_parse_clinical_pharmacology`
- `tooluniverse.tool.DailyMed_search_spls`
- `tooluniverse.tool.DrugCentral_get_drug`
- `tooluniverse.tool.DrugCentral_get_targets`
- `tooluniverse.tool.DrugCentral_search`
- `tooluniverse.tool.EuropePMC_search_articles`
- `tooluniverse.tool.FAERS_count_reactions_by_drug_event`
- `tooluniverse.tool.NIHDSLD_get_label`
- `tooluniverse.tool.NIHDSLD_search_products`
- `tooluniverse.tool.PharmGKB_get_dosing_guidelines`
- `tooluniverse.tool.PharmGKB_search_drugs`
- `tooluniverse.tool.PubChemBioAssay_get_assay_summary`
- `tooluniverse.tool.PubChemTox_get_acute_effects`
- `tooluniverse.tool.PubChem_get_CID_by_compound_name`
- `tooluniverse.tool.PubChem_get_compound_properties_by_CID`
- `tooluniverse.tool.PubChem_search_compounds_by_similarity`
- `tooluniverse.tool.PubMed_search_articles`
- `tooluniverse.tool.extract_clinical_trial_outcomes`
- `tooluniverse.tool.fda_pharmacogenomic_biomarkers`
- `tooluniverse.tool.search_clinical_trials`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-drug-research/SKILL.md)；Apache-2.0；原文 SHA-256：`9e61fb08ba3b76d0f06f4fabad53e5fc3b6b7f47e67d807513d60e6a1c095cc5`。
