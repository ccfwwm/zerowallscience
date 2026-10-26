# drug synergy

Drug-combination synergy analysis — quantify whether two drugs together are synergistic, additive, or antagonistic using the standard reference models (Bliss independence, HSA / highest single agent, Loewe additivity, ZIP, and the Chou-Talalay Combination Index). Use when you have measured single-drug and combination effects (inhibition/viability) and need a synergy score. Explains which model to use, what data each one needs, and how to read the score. NOT for looking up pre-computed synergy in a database (use the SYNERGxDB tool / cell-line-profiling skill).

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Step 0 — Pick the model by the data you have
- Step 1 — What each model's "additivity" means
- Step 2 — Run it
- Step 3 — Interpret the score
- Step 4 — Gotchas (state these)
- Honest limitations

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.DrugSynergy_calculate_bliss`
- `tooluniverse.tool.DrugSynergy_calculate_ci`
- `tooluniverse.tool.DrugSynergy_calculate_hsa`
- `tooluniverse.tool.DrugSynergy_calculate_loewe`
- `tooluniverse.tool.DrugSynergy_calculate_zip`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-drug-synergy/SKILL.md)；Apache-2.0；原文 SHA-256：`cc2b347b0f1ab954e2dc573eccb14583264b3392a19eea85d3ccdf6cb85cfa7e`。
