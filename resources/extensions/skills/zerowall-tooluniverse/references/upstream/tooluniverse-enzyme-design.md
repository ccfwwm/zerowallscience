# enzyme design

De novo enzyme design by catalytic-motif scaffolding — build a transition-state motif, generate scaffolds with AlphaProtein Novo, fold every mechanistic state, and triage with mechanism-inspired filters (catalytic geometry, multi-state H-bonds, multi-resequence backbone scoring). Use for designing enzymes for a named reaction, scoring or filtering existing designs, or deciding which designs to order.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- LOOK UP, DON'T GUESS
- COMPUTE, DON'T DESCRIBE
- When to Use
- What AP Novo is, exactly
- Workflow Overview
- Phase 1 — Define the reaction and build the motif
- Phase 2 — Validate the motif spec first
- Phase 3 — Generate scaffolds
- Phase 4 — Resequence, or don't
- Phase 5 — Fold every mechanistic state
- Phase 6 — Evaluate and filter
- Phase 7 — Backbone-ensemble scoring (MR / MPD)
- Phase 8 — Triage, novelty check, report

推荐发现词：`enzyme design`。没有静态命中的工具时，通过实时关键词检索；不能推断工作流已实现。

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-enzyme-design/SKILL.md)；Apache-2.0；原文 SHA-256：`9d091c6df06044a860f71db306885b138d547d3fa54d56a5a6781e0fcc7abf23`。
