# glycobiology

Glycobiology and glycomics research using GlyGen — glycan structure lookup by GlyTouCan accession, glycan search by mass/monosaccharide-count/type, glycoprotein glycosylation profiles by UniProt accession, glycosylation-site-level detail (position, flanking sequence, attached glycan, co-located SNVs). Use when someone asks about "what glycans are attached to protein X", "N-linked vs O-linked glycosylation sites", "glycan mass/composition search", "GlyTouCan accession lookup", "glycosylation site at position N", or "which proteins have reported glycosylation in human/mouse". NOT for protein sequence/structure retrieval alone (use tooluniverse-sequence-retrieval or tooluniverse-protein-structure-retrieval), NOT for general small-molecule chemistry (use tooluniverse-chemical-compound-retrieval), NOT for post-translational modifications other than glycosylation (use tooluniverse-protein-modification-analysis).

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- When to Use This Skill
- Tool Chains for Common Questions
- Response Shape Notes (observed from live calls, not assumed from schema)
- Output

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.GlyGen_get_glycan`
- `tooluniverse.tool.GlyGen_get_glycoprotein`
- `tooluniverse.tool.GlyGen_get_site`
- `tooluniverse.tool.GlyGen_search_glycans`
- `tooluniverse.tool.GlyGen_search_glycoproteins`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-glycobiology/SKILL.md)；Apache-2.0；原文 SHA-256：`fede0d0b546d688bdb9e4e1763b727fc6ca54bfda069d89a9161bb66ad501c32`。
