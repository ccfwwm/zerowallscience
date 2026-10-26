# dose response

Dose-response / concentration-response curve fitting — IC50, EC50, Hill slope, Emax/Emin efficacy, and relative potency from paired concentration vs response data (enzyme/cell assays, drug screening, agonist/antagonist pharmacology). Fits the 4-parameter logistic (Hill sigmoidal) model. Use when you have concentrations + responses and need a potency value, to compare two compounds' potency, or to judge curve quality. NOT for image-derived dose-response (use tooluniverse-image-analysis) and NOT for survival/regression (use tooluniverse-statistical-modeling).

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- When to use this
- Step 1 — Prepare the data (where results go wrong)
- Step 2 — Fit / get the potency
- Step 3 — Interpret the four parameters
- Step 4 — Quality gotchas (state these, don't hide them)
- Honest limitations

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.DoseResponse_calculate_ic50`
- `tooluniverse.tool.DoseResponse_compare_potency`
- `tooluniverse.tool.DoseResponse_fit_curve`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-dose-response/SKILL.md)；Apache-2.0；原文 SHA-256：`b4a559d9ec12bd6d01f1a7e4780ae6754e3a1b36852c28ae0dbee803717e3fc9`。
