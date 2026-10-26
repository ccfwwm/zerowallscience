# pharmacokinetics

Pharmacokinetic (PK) analysis of concentration-time data — non-compartmental analysis (NCA) for Cmax, Tmax, AUC (0-t and 0-∞), terminal half-life, clearance (CL), volume of distribution (Vd), MRT, and absolute bioavailability (F). Also one-compartment fitting. Use when you have plasma/serum drug concentrations over time after a dose and need PK parameters, or to compute bioavailability from IV + oral AUCs. NOT for ADMET property prediction from structure (use tooluniverse-admet-prediction).

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- When to use this
- Step 1 — Prepare the concentration-time data
- Step 2 — Run NCA
- Step 3 — Interpret the parameters
- Step 4 — Absolute bioavailability (F)
- Step 5 — Quality gotchas (state these)
- Honest limitations

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.NCA_calculate_bioavailability`
- `tooluniverse.tool.NCA_compute_parameters`
- `tooluniverse.tool.NCA_fit_one_compartment`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-pharmacokinetics/SKILL.md)；Apache-2.0；原文 SHA-256：`c8d688acc7965b4691b4864c57bca1c19e61c76fc81962725af9215f4c60577a`。
