# small molecule discovery

Small molecule identification, characterization, and procurement — PubChem, ChEMBL, BindingDB, ADMET-AI, SwissADME, eMolecules, Enamine. Covers compound name to structure to activity to ADMET properties to commercial sourcing. Use for chemical biology, lead identification, probe selection, and the full small-molecule discovery pipeline.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Domain Reasoning
- LOOK UP DON'T GUESS
- COMPUTE, DON'T DESCRIBE
- When to Use
- Key Tools
- Workflow
- Phase 1: Compound Identification
- Phase 2: Structure-Based Search
- Phase 3: Bioactivity and Binding Affinity
- Phase 4: Drug-likeness and ADMET
- Phase 5: Target Prediction
- Phase 6: Commercial Availability
- Common Patterns
- Pattern 1: Full Compound Profile
- Pattern 2: Analog Discovery
- Pattern 3: Target-Based Compound Search
- Pattern 4: ADMET Risk Assessment
- Fallback Chains
- Limitations

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.ADMETAI_predict_BBB_penetrance`
- `tooluniverse.tool.ADMETAI_predict_CYP_interactions`
- `tooluniverse.tool.ADMETAI_predict_bioavailability`
- `tooluniverse.tool.ADMETAI_predict_physicochemical_properties`
- `tooluniverse.tool.ADMETAI_predict_toxicity`
- `tooluniverse.tool.BindingDB_get_ligands_by_uniprot`
- `tooluniverse.tool.BindingDB_get_targets_by_compound`
- `tooluniverse.tool.ChEMBL_get_drug_mechanisms`
- `tooluniverse.tool.ChEMBL_get_molecule`
- `tooluniverse.tool.ChEMBL_get_target_activities`
- `tooluniverse.tool.ChEMBL_search_activities`
- `tooluniverse.tool.ChEMBL_search_molecules`
- `tooluniverse.tool.ChEMBL_search_similar_molecules`
- `tooluniverse.tool.ChEMBL_search_targets`
- `tooluniverse.tool.Enamine_get_compound`
- `tooluniverse.tool.Enamine_get_libraries`
- `tooluniverse.tool.Enamine_search_catalog`
- `tooluniverse.tool.Enamine_search_smiles`
- `tooluniverse.tool.PubChem_get_CID_by_SMILES`
- `tooluniverse.tool.PubChem_get_CID_by_compound_name`
- `tooluniverse.tool.PubChem_get_compound_properties_by_CID`
- `tooluniverse.tool.PubChem_get_compound_synonyms_by_CID`
- `tooluniverse.tool.PubChem_search_compounds_by_similarity`
- `tooluniverse.tool.PubChem_search_compounds_by_substructure`
- `tooluniverse.tool.SwissADME_calculate_adme`
- `tooluniverse.tool.SwissADME_check_druglikeness`
- `tooluniverse.tool.SwissTargetPrediction_predict`
- `tooluniverse.tool.eMolecules_get_vendors`
- `tooluniverse.tool.eMolecules_search`
- `tooluniverse.tool.eMolecules_search_smiles`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-small-molecule-discovery/SKILL.md)；Apache-2.0；原文 SHA-256：`3a06856ea8d4752a30f81994eab04bc2670136a2272b4b731f8f26c107b1510c`。
