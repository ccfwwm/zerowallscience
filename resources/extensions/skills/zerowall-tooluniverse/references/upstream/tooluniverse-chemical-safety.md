# chemical safety

Chemical safety and toxicology assessment integrating ADMET-AI predictions, CTD toxicogenomics, PubChemTox experimental data, GHS/IARC hazard classification, and exposure-context analysis. Use for chemical hazard identification, occupational/consumer-product toxicity, dose-response evaluation, and acute (LD50) vs chronic toxicity assessment. Distinguishes drug toxicity from environmental chemical toxicity.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- When to Use This Skill
- COMPUTE, DON'T DESCRIBE
- KEY PRINCIPLES
- Evidence Grading System (MANDATORY)
- Core Strategy: 8 Research Phases
- Tool Summary by Phase
- Phase 0: Compound Disambiguation
- Phase 1: Predictive Toxicology
- Phase 2: ADMET Properties
- Phase 3: Toxicogenomics
- Phase 3.5: PubChem Toxicity Data
- Phase 3.6: Adverse Outcome Pathways
- Phase 3.7: Environmental Exposure Context (US facilities)
- Phase 4: Regulatory Safety (for pharmaceuticals only)
- Phase 5: Drug Safety (for pharmaceuticals only)
- Phase 6: Chemical-Protein Interactions
- Phase 7: Structural Alerts
- Risk Classification Matrix
- Report Structure
- Mandatory Completeness Checklist
- Common Use Patterns
- Limitations
- Summary

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.ADMETAI_predict_BBB_penetrance`
- `tooluniverse.tool.ADMETAI_predict_nuclear_receptor_activity`
- `tooluniverse.tool.ADMETAI_predict_stress_response`
- `tooluniverse.tool.ADMETAI_predict_toxicity`
- `tooluniverse.tool.AOPWiki_get_aop`
- `tooluniverse.tool.AOPWiki_list_aops`
- `tooluniverse.tool.CTD_get_chemical_diseases`
- `tooluniverse.tool.CTD_get_chemical_gene_interactions`
- `tooluniverse.tool.ChEMBL_get_molecule`
- `tooluniverse.tool.ChEMBL_search_compound_structural_alerts`
- `tooluniverse.tool.DGIdb_get_drug_gene_interactions`
- `tooluniverse.tool.DrugProps_calculate_qed`
- `tooluniverse.tool.DrugProps_lipinski_filter`
- `tooluniverse.tool.DrugProps_pains_filter`
- `tooluniverse.tool.EPA_search_frs_facilities`
- `tooluniverse.tool.EPA_search_tri_facilities`
- `tooluniverse.tool.FDA_get_boxed_warning_info_by_drug_name`
- `tooluniverse.tool.PubChemTox_get_acute_effects`
- `tooluniverse.tool.PubChemTox_get_carcinogen_classification`
- `tooluniverse.tool.PubChemTox_get_ghs_classification`
- `tooluniverse.tool.PubChemTox_get_toxicity_summary`
- `tooluniverse.tool.PubChemTox_get_toxicity_values`
- `tooluniverse.tool.PubChem_get_CID_by_compound_name`
- `tooluniverse.tool.PubChem_get_compound_properties_by_CID`
- `tooluniverse.tool.STITCH_get_chemical_protein_interactions`
- `tooluniverse.tool.STRING_get_interaction_partners`
- `tooluniverse.tool.drugbank_get_safety_by_drug_name_or_drugbank_id`
- `tooluniverse.tool.get_tool_info`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-chemical-safety/SKILL.md)；Apache-2.0；原文 SHA-256：`deacea8a570cd6132d182366420c8df9d15296a1654309c25ee72d71185a95c2`。
