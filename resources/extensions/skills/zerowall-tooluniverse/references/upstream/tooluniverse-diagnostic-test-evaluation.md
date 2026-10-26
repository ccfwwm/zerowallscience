# diagnostic test evaluation

Diagnostic test / biomarker accuracy — sensitivity, specificity, PPV, NPV, likelihood ratios, accuracy from a 2x2 table; ROC curve, AUC, and the optimal cutoff (Youden) for a continuous biomarker; and post-test probability via Bayes. Use when you have test results vs a gold standard (binary 2x2, or a continuous score + true labels) and need to judge how good the test is, pick a threshold, or compute the probability of disease given a result. Emphasizes the prevalence-dependence of PPV/NPV.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Which case are you in?
- Step 1 — Fixed-cutoff metrics from a 2×2 table
- Step 2 — ROC / AUC / optimal cutoff for a continuous biomarker
- Step 3 — Post-test probability (Bayes)
- Gotchas (state these)
- Honest limitations

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.Epidemiology_bayesian`
- `tooluniverse.tool.Epidemiology_diagnostic`
- `tooluniverse.tool.ROC_analysis`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-diagnostic-test-evaluation/SKILL.md)；Apache-2.0；原文 SHA-256：`e26ee602e74a31dba070a2172e092682ee2444b2270f14f00260e1112e514dd6`。
