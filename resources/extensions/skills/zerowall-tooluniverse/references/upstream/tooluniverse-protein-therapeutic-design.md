# protein therapeutic design

AI-guided de novo protein design — RFdiffusion backbone generation, ProteinMPNN sequence design, structure validation (pLDDT, pTM, MPNN scores). Use for designing therapeutic protein binders, novel scaffolds, enzyme variants, and miniprotein/protein-interface design before experimental validation.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- LOOK UP, DON'T GUESS
- COMPUTE, DON'T DESCRIBE
- When to Use
- Workflow Overview
- Critical Requirements
- Report-First Approach (MANDATORY)
- Design Documentation (MANDATORY)
- NVIDIA NIM Tools
- Common Parameter Mistakes
- NVIDIA NIM Requirements
- Supporting Tools
- Folding and Developability Screening
- Completeness Checklist

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.EMDB_get_structure`
- `tooluniverse.tool.EMDB_search_structures`
- `tooluniverse.tool.ESMFold_predict_structure`
- `tooluniverse.tool.InterPro_get_protein_domains`
- `tooluniverse.tool.NVIDIA_API_KEY`
- `tooluniverse.tool.NvidiaNIM_alphafold2`
- `tooluniverse.tool.NvidiaNIM_esm2_650m`
- `tooluniverse.tool.NvidiaNIM_proteinmpnn`
- `tooluniverse.tool.NvidiaNIM_rfdiffusion`
- `tooluniverse.tool.PDBe_get_uniprot_mappings`
- `tooluniverse.tool.RCSBData_get_entry`
- `tooluniverse.tool.UniProt_get_entry_by_accession`
- `tooluniverse.tool.alphafold_get_prediction`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-protein-therapeutic-design/SKILL.md)；Apache-2.0；原文 SHA-256：`d984203310eecd97a7bba1fb67753007c6bda3b78f192ab6b977a685798d4093`。
