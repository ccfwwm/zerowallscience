# enzyme kinetics

Enzyme kinetics — Michaelis-Menten Km, Vmax, kcat (turnover), and kcat/Km (catalytic efficiency / specificity constant) from substrate-velocity data, plus inhibition-mechanism analysis (competitive / uncompetitive / non-competitive, Ki). Fits the MM equation by nonlinear regression (and reports Lineweaver-Burk for reference). Use when you have substrate concentrations and initial reaction velocities and need kinetic parameters or to classify an inhibitor. NOT for BRENDA database lookups of published constants (use the BRENDA tools).

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- When to use this
- Looking up published constants instead of fitting your own (SABIO-RK)
- Step 1 — Prepare the data
- Step 2 — Fit Michaelis-Menten
- Step 3 — Interpret
- Step 4 — Inhibition mechanism
- Step 5 — Gotchas (state these)
- Honest limitations

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.EnzymeKinetics_calculate`
- `tooluniverse.tool.SABIO_RK_search_reactions`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-enzyme-kinetics/SKILL.md)；Apache-2.0；原文 SHA-256：`d2d79729ee2e889df671ecc8547291d517d83a7e4fe4d27db5ced7d7852ccd26`。
