# meta analysis

Meta-analysis / evidence synthesis — pool effect sizes across studies (odds ratios, risk ratios, hazard ratios, mean differences, correlations, GWAS betas) with fixed- or random-effects models, quantify heterogeneity (Q, I², τ²), and build a forest plot. Use when you have results from MULTIPLE studies and need a single pooled estimate, or to synthesize evidence from a systematic review / multiple GWAS / replicated experiments. Handles the error-prone effect-size + standard-error preparation (converting OR/HR/CI, two-group means±SD, proportions, and correlations into the (effect, SE) the pooling step needs).

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- When to use this
- The workflow
- Step 1 — Convert each study to (effect_size, se)  ← do this carefully
- Step 2 — Fixed vs random effects
- Step 3 — Pool with MetaAnalysis_run
- Step 4 — Interpret heterogeneity (decides the story)
- Step 5 — Forest plot + report
- Honest limitations

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.Crossref_check_retraction`
- `tooluniverse.tool.MetaAnalysis_run`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-meta-analysis/SKILL.md)；Apache-2.0；原文 SHA-256：`8d2987381af558cf5e404c9602b4bb1dfdc41f346fc4572df683c06fd3219e69`。
