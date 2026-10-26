# protein structural annotation pdb

Given a PDB structure, produce a per-residue annotation table: which residues sit at a binding interface (vs a partner chain), which line a ligand pocket, which are buried (core) vs solvent-exposed (surface), and optionally secondary structure. This is the structural track drawn under a DMS heatmap and the structural prior SAE feature drops are read against. Use when you need to anchor a variant-interpretation or DMS analysis to the protein's actual physical context.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- When to use this skill
- Required inputs
- Workflow
- Step 1 (optional): Find the relevant PDB
- Step 2: Run the annotation
- Step 3: Verify the numbering before joining
- Step 4: Combine with secondary structure (optional)
- Step 5: Use the annotation
- Interpretation table
- Honest limitations

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.PDBeSIFTS_get_all_structures`
- `tooluniverse.tool.PDBeSIFTS_get_best_structures`
- `tooluniverse.tool.RCSBAdvSearch_search_structures`
- `tooluniverse.tool.Structure_annotate_per_residue`
- `tooluniverse.tool.UniProt_get_sequence_by_accession`
- `tooluniverse.tool.pdbe_get_entry_secondary_structure`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-protein-structural-annotation-pdb/SKILL.md)；Apache-2.0；原文 SHA-256：`bae9628a653c70fe72b03bc27c4790d6618f11cd78036f9200799082ae9c85bd`。
