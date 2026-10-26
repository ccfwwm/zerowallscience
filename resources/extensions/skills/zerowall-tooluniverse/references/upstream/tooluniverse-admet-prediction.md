# admet prediction

Comprehensive ADMET (Absorption, Distribution, Metabolism, Excretion, Toxicity) profiling for drug candidates. Integrates ADMET-AI predictions, SwissADME drug-likeness, PubChemTox experimental toxicity, ChEMBL clinical data, Lipinski rule-of-five, and CYP interaction data. Use for drug-likeness assessment, BBB penetration, bioavailability, hepatotoxicity prediction, ADME/PK profiling, or screening compound libraries before lab testing.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- When to Use This Skill
- Before You Run
- COMPUTE, DON'T DESCRIBE
- KEY PRINCIPLES
- Evidence Grading
- Workflow: 5-Phase ADMET Profiling
- PHASE 1: Compound Identity Resolution
- PHASE 2: Physicochemical Properties & Drug-Likeness
- PHASE 3: ADME Predictions
- PHASE 4: Toxicity Assessment
- PHASE 5: Scorecard Assembly & Clinical Context
- Completeness Checklist (MANDATORY before reporting)

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
- `tooluniverse.tool.ChEMBL_get_molecule`
- `tooluniverse.tool.Chem_sa_score`
- `tooluniverse.tool.PubChemTox_get_acute_effects`
- `tooluniverse.tool.PubChemTox_get_carcinogen_classification`
- `tooluniverse.tool.PubChemTox_get_ghs_classification`
- `tooluniverse.tool.PubChemTox_get_target_organs`
- `tooluniverse.tool.PubChemTox_get_toxicity_summary`
- `tooluniverse.tool.PubChemTox_get_toxicity_values`
- `tooluniverse.tool.PubChem_get_CID_by_SMILES`
- `tooluniverse.tool.PubChem_get_CID_by_compound_name`
- `tooluniverse.tool.PubChem_get_compound_properties_by_CID`
- `tooluniverse.tool.SwissADME_calculate_adme`
- `tooluniverse.tool.SwissADME_check_druglikeness`
- `tooluniverse.tool.TDC_list_datasets`
- `tooluniverse.tool.TDC_load_dataset`
- `tooluniverse.tool.TDC_predict_oracle_score`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-admet-prediction/SKILL.md)；Apache-2.0；原文 SHA-256：`ddc425b9c1bebe67bdf1d4e23ee9843113b5a2ec8997215be3172a8c61a0d4cd`。
