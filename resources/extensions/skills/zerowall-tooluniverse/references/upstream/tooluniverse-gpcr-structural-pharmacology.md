# gpcr structural pharmacology

GPCR receptor pharmacology — agonist/antagonist/inverse-agonist/biased-agonist classification, GPCRdb structural data, receptor-ligand binding analysis, antibody-target interface (SAbDab). Use for GPCR drug discovery, biased-agonism analysis, receptor subtype selectivity questions, and orthosteric vs allosteric pocket characterization.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- When to Use
- GPCRdb Entry Name Format
- Workflow Overview
- Phase 1: GPCR Receptor Identification
- Phase 2: Ligand Landscape
- Phase 3: Structural Data
- Phase 4: Mutation Data
- Phase 5: Antibody Structure Retrieval
- Common Research Patterns
- Pattern 1: GPCR Drug Target Profiling
- Pattern 2: Antibody-Antigen Interface Analysis
- Pattern 3: GPCR Family Survey
- Pattern 4: Structure Interface Characterization
- Tool Combinations with Other Skills
- Fallback Chains
- Completeness Checklist

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.ChEMBL_search_molecules`
- `tooluniverse.tool.GPCRdb_get_ligands`
- `tooluniverse.tool.GPCRdb_get_mutations`
- `tooluniverse.tool.GPCRdb_get_protein`
- `tooluniverse.tool.GPCRdb_get_structures`
- `tooluniverse.tool.GPCRdb_list_proteins`
- `tooluniverse.tool.PDBePISA_get_assemblies`
- `tooluniverse.tool.PDBePISA_get_interfaces`
- `tooluniverse.tool.PDBePISA_get_monomer_analysis`
- `tooluniverse.tool.PubChem_get_CID_by_compound_name`
- `tooluniverse.tool.SAbDab_get_structure`
- `tooluniverse.tool.SAbDab_get_summary`
- `tooluniverse.tool.SAbDab_search_structures`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-gpcr-structural-pharmacology/SKILL.md)；Apache-2.0；原文 SHA-256：`898c8621907e53694b7175e631c3eb5965d4b8e5e08e94b7814a45db2907ffad`。
