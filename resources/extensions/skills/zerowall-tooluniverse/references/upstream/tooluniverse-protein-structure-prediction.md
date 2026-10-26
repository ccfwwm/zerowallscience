# protein structure prediction

Protein 3D structure prediction from sequence — ESMFold de novo prediction, AlphaFold database retrieval, experimental structures from RCSB, ProtVar variant impact assessment, ProtParam sequence properties. Use for structure prediction when no experimental structure exists, fold-confidence scoring, and structure-guided variant interpretation.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- LOOK UP, DON'T GUESS
- COMPUTE, DON'T DESCRIBE
- When to Use
- Input Parameters
- Workflow Overview
- Phase 0: Input Preparation
- If sequence is already provided
- If only protein name or UniProt ID is provided
- Phase 1: Sequence Properties
- Tools
- Key Properties to Report
- Phase 2: De Novo Structure Prediction (ESMFold)
- Tools
- Workflow
- Quality Interpretation
- ESMFold vs AlphaFold
- Tools
- Workflow
- Decision Logic
- Complex / Ligand-Binding Prediction (Boltz, paid -- optional)
- Membrane Topology & Signal Peptide Prediction (DTU tools, optional)
- Phase 4: Experimental Structure Comparison
- Tools
- Workflow

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.AlphaFill_get_transplants`
- `tooluniverse.tool.BOLTZ_API_KEY`
- `tooluniverse.tool.Boltz_estimate_structure_binding_cost`
- `tooluniverse.tool.Boltz_get_structure_binding`
- `tooluniverse.tool.Boltz_start_structure_binding`
- `tooluniverse.tool.ESMFold_predict_structure`
- `tooluniverse.tool.MyGene_query_genes`
- `tooluniverse.tool.ProtParam_calculate`
- `tooluniverse.tool.ProtVar_get_function`
- `tooluniverse.tool.ProtVar_map_variant`
- `tooluniverse.tool.RCSBAdvSearch_search_structures`
- `tooluniverse.tool.RCSBData_get_entry`
- `tooluniverse.tool.UniProt_get_entry_by_accession`
- `tooluniverse.tool.UniProt_search`
- `tooluniverse.tool.alphafold_get_annotations`
- `tooluniverse.tool.alphafold_get_prediction`
- `tooluniverse.tool.alphafold_get_summary`
- `tooluniverse.tool.dtu_protein_predict`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-protein-structure-prediction/SKILL.md)；Apache-2.0；原文 SHA-256：`45d44139605cb914bea3d2a4e03dd2a189be2227b93ee18dab86254289be7962`。
