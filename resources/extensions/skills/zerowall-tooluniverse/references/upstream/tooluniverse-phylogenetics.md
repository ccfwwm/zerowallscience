# phylogenetics

Phylogenetic analysis — de novo multiple sequence alignment (Clustal Omega/MUSCLE/MAFFT via EBI_msa_align) and neighbour-joining/UPGMA tree building (EBI_build_phylogenetic_tree) from your own sequences, plus tree analysis, treeness, saturation (PhyKIT), parsimony-informative sites, alignment gap analysis, DVMC, long-branch detection, BUSCO orthologs. Uses PhyKIT, Biopython, DendroPy. Use to align a set of sequences, build a tree from sequences or an alignment, or for phylogenetic tree QC, multi-gene phylogenomics, evolutionary-rate analysis, and comparative-genomics studies.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Four traps that produce a confidently wrong number
- RULE ZERO — Check for pre-computed results FIRST
- BUSCO scogs questions (multi-species phylogenomics)
- PRIMARY SCRIPT — both groups in one pass (use this FIRST)
- Single-group script (when only one group is asked about)
- `phykit parsimony_informative` is NOT a valid CLI subcommand
- Group-median ratio vs paired ratio (read this carefully)
- Total amino-acid count across single-copy orthologs — single representative, not all species
- Lowest-non-zero ratios
- File-layout fallback (alignment naming)
- Which alignment goes with which metric (this changes the answer)
- LOOK UP, DON'T GUESS
- When to Use
- Required Packages
- Workflow Decision Tree
- Common Patterns
- Single Metric Across Groups
- Statistical Comparison
- Filtering + Metric
- Batch Processing
- Answer Extraction
- Interpretation
- Completeness Checklist
- Analysis conventions

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.EBI_build_phylogenetic_tree`
- `tooluniverse.tool.EBI_msa_align`
- `tooluniverse.tool.phykit_batch_analysis`
- `tooluniverse.tool.read_executed_notebook`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-phylogenetics/SKILL.md)；Apache-2.0；原文 SHA-256：`9053a867fe8b8d137262cfdabf5dd909f081f3d0d5811615afefe310f69bd2b2`。
