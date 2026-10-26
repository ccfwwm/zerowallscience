# protein structure retrieval

Protein structure retrieval from RCSB PDB, PDBe, AlphaFold, SWISS-MODEL, 3D-Beacons (cross-provider structure aggregator), and PDB-REDO (re-refined X-ray structures), with disambiguation, quality assessment (resolution, R-factor, pLDDT, coverage), and metadata. Distinguishes high-quality experimental (X-ray under 2 Angstrom) vs predicted vs homology-model vs medium-quality structures. Use for fetching protein structures, structure-quality comparison, batch model-availability checks across a gene list, checking every structure provider at once, and selecting structures for drug design or modeling.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Domain Reasoning
- Workflow
- Phase 0: Clarification (When Needed)
- Phase 1: Protein Disambiguation
- Identity Checklist
- Phase 2: Data Retrieval (Internal)
- Fallback Chains
- SWISS-MODEL Repository (Homology Models + Re-Indexed Experimental Structures)
- 3D-Beacons (Meta-Aggregator Across All Structure Providers)
- PDB-REDO (Re-Refined Experimental Structures)
- Phase 3: Report Structure Profile
- Quality Assessment
- Experimental Structures
- Resolution Use Cases
- AlphaFold Confidence (pLDDT)
- Error Handling

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.PDB_REDO_get_structure_quality`
- `tooluniverse.tool.PDB_REDO_get_version_info`
- `tooluniverse.tool.PDB_search_similar_structures`
- `tooluniverse.tool.PDBeSIFTS_get_all_structures`
- `tooluniverse.tool.PDBeSearch_search_structures`
- `tooluniverse.tool.PDBeValidation_get_quality_scores`
- `tooluniverse.tool.PDBe_KB_get_ligand_sites`
- `tooluniverse.tool.PDBe_get_structure_ligands`
- `tooluniverse.tool.RCSBData_get_entry`
- `tooluniverse.tool.SwissModel_download_pdb`
- `tooluniverse.tool.SwissModel_get_models`
- `tooluniverse.tool.SwissModel_get_models_batch`
- `tooluniverse.tool.SwissModel_get_summary`
- `tooluniverse.tool.ThreeDBeacons_get_annotations`
- `tooluniverse.tool.ThreeDBeacons_get_structure_summary`
- `tooluniverse.tool.ThreeDBeacons_get_structures`
- `tooluniverse.tool.alphafold_get_prediction`
- `tooluniverse.tool.alphafold_get_summary`
- `tooluniverse.tool.get_protein_metadata_by_pdb_id`
- `tooluniverse.tool.pdbe_get_entry_experiment`
- `tooluniverse.tool.pdbe_get_entry_molecules`
- `tooluniverse.tool.pdbe_get_entry_summary`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-protein-structure-retrieval/SKILL.md)；Apache-2.0；原文 SHA-256：`3a483f7a48f3e79af773fb440566090d4fbf4fc208d55c3a61a08b9081ba0c86`。
