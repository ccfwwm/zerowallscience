# molecular cloning

Molecular cloning, in both directions. DESIGN — Gibson Assembly (overlap design for seamless multi-fragment joining) and Golden Gate Assembly (Type IIS / BsaI / BbsI / Esp3I / BsmBI / SapI design with unique 4-bp fusion overhangs). ANALYSIS — work out what an existing reaction produces: given input plasmid sequences and an enzyme, digest them, join the fragments by their overhangs, and identify features of the product (expressed ORF, gRNA spacer and its target gene). Use when you need to plan how to join DNA fragments into a construct, design assembly overlaps/overhangs, decide between cloning methods, or determine the product of a stated Gibson/Golden Gate reaction. Covers the domestication (internal-site removal), overhang-uniqueness, and overlap-Tm rules. For PCR primers to generate the fragments, see tooluniverse-primer-design.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Step 0 — Pick the method
- Step 1 — Gibson Assembly
- Step 2 — Golden Gate Assembly
- Step 3 — QC before ordering
- Step 4 — Gotchas (state these)
- Working backwards — what does an existing assembly produce?
- Honest limitations

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.DNA_gibson_design`
- `tooluniverse.tool.DNA_golden_gate_assemble`
- `tooluniverse.tool.DNA_golden_gate_design`
- `tooluniverse.tool.DNA_virtual_digest`
- `tooluniverse.tool.REBASE_get_enzyme`
- `tooluniverse.tool.REBASE_list_isoschizomers`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-molecular-cloning/SKILL.md)；Apache-2.0；原文 SHA-256：`12b33f10d99db539b4d69f8c6f4b3f99f475d9a8a070afb876295666152b4613`。
