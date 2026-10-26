# electron microscopy

Search and analyze electron microscopy data — cryo-EM density maps (EMDB), fitted atomic models (PDB), raw micrograph datasets (EMPIAR), and cryo-electron tomography volumes (CryoET Data Portal). Use for finding 3D structural data on a protein/complex, comparing experimental EM resolution to AlphaFold confidence, and accessing raw EM data for re-processing.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- LOOK UP, DON'T GUESS
- COMPUTE, DON'T DESCRIBE
- When to Use
- Core Databases
- Workflow Overview
- Phase Details
- Phase 0: Query Parsing
- Phase 1: Map & Image Search (EMDB)
- Phase 2: Structure Fitting (EMDB + PDB)
- Phase 3: Raw Data Access (EMPIAR)
- Phase 4: Tomography (CryoET Data Portal)
- Phase 6: Interpretation & Recommendations
- Phase 7: Report Synthesis
- Common Analysis Patterns
- Edge Cases & Fallbacks
- Related Resource: IDR (light microscopy & high-content screening)
- Limitations

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.CryoET_get_dataset`
- `tooluniverse.tool.CryoET_list_datasets`
- `tooluniverse.tool.CryoET_list_runs`
- `tooluniverse.tool.EMDB_get_map_info`
- `tooluniverse.tool.EMDB_get_sample_info`
- `tooluniverse.tool.EMDB_get_structure`
- `tooluniverse.tool.EMDB_get_validation`
- `tooluniverse.tool.EMDB_search_structures`
- `tooluniverse.tool.EMPIAR_get_entry`
- `tooluniverse.tool.EMPIAR_search_entries`
- `tooluniverse.tool.IDR_get_image_map_annotations`
- `tooluniverse.tool.IDR_get_study`
- `tooluniverse.tool.IDR_get_study_datasets`
- `tooluniverse.tool.IDR_list_dataset_images`
- `tooluniverse.tool.IDR_list_metadata_keys`
- `tooluniverse.tool.IDR_list_values_for_key`
- `tooluniverse.tool.IDR_search_images`
- `tooluniverse.tool.IDR_search_studies`
- `tooluniverse.tool.PubMed_search_articles`
- `tooluniverse.tool.RCSBAdvSearch_search_structures`
- `tooluniverse.tool.RCSBData_get_entry`
- `tooluniverse.tool.alphafold_get_prediction`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-electron-microscopy/SKILL.md)；Apache-2.0；原文 SHA-256：`d145e5008fc3a76953acba99b52764456c0519221b829552b42f055c0e9c905b`。
