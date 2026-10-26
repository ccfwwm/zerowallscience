# chemical compound retrieval

Retrieve chemical compound data from PubChem and ChEMBL with disambiguation, cross-referencing, and stereochemistry handling. Use for resolving compound names to SMILES/InChI/CID/ChEMBL IDs (including OPSIN deterministic IUPAC-name-to-structure parsing), fetching molecular properties, distinguishing isomers/stereo forms, and cross-validating identity across databases. Always use English compound names; flags ambiguous queries (e.g., Vitamin D has multiple forms).

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Domain Reasoning: Disambiguation
- Workflow
- Phase 1: Disambiguation
- Phase 2: Data Retrieval
- Phase 3: Report
- Fallback Chains
- Evidence Grading
- SMILES Verification
- Identifier Resolution and Cross-Database Referencing
- Cheminformatics Calculations and Structure Visualization

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.ChEMBL_get_activity`
- `tooluniverse.tool.ChEMBL_get_assay_activities`
- `tooluniverse.tool.ChEMBL_get_compound_record_activities`
- `tooluniverse.tool.ChEMBL_get_molecule`
- `tooluniverse.tool.ChEMBL_get_molecule_targets`
- `tooluniverse.tool.ChEMBL_get_target`
- `tooluniverse.tool.ChEMBL_search_assays`
- `tooluniverse.tool.ChEMBL_search_drugs`
- `tooluniverse.tool.ChEMBL_search_molecules`
- `tooluniverse.tool.ChEMBL_search_targets`
- `tooluniverse.tool.NCICACTUS_resolve`
- `tooluniverse.tool.OPSIN_name_to_structure`
- `tooluniverse.tool.PubChemBioAssay_get_assay_summary`
- `tooluniverse.tool.PubChemTox_get_acute_effects`
- `tooluniverse.tool.PubChem_get_CID_by_SMILES`
- `tooluniverse.tool.PubChem_get_CID_by_compound_name`
- `tooluniverse.tool.PubChem_get_associated_patents_by_CID`
- `tooluniverse.tool.PubChem_get_compound_2D_image_by_CID`
- `tooluniverse.tool.PubChem_get_compound_properties_by_CID`
- `tooluniverse.tool.PubChem_search_compounds_by_similarity`
- `tooluniverse.tool.PubChem_search_compounds_by_substructure`
- `tooluniverse.tool.RDKit_matched_molecular_pair`
- `tooluniverse.tool.RDKit_pharmacophore_features`
- `tooluniverse.tool.UniChem_connectivity_search`
- `tooluniverse.tool.UniChem_list_sources`
- `tooluniverse.tool.UniChem_search_compound`
- `tooluniverse.tool.visualize_molecule_2d`
- `tooluniverse.tool.visualize_molecule_3d`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-chemical-compound-retrieval/SKILL.md)；Apache-2.0；原文 SHA-256：`8cbe00fb777265a2820252bcba4ebda746a88d370febbe6d7718f2cd54d675dd`。
