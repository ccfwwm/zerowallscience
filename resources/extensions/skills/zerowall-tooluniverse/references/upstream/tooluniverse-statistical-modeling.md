# statistical modeling

Statistical modeling — linear/logistic/ordinal/Poisson regression, ANOVA, Kruskal-Wallis, chi-square, Mann-Whitney, Cox survival, spline fits (R `ns()`), odds ratios, Cohen's d, F-statistic, p-value computation. Specializes in clinical-trial AE analysis (SDTM DM/AE), severity ordinal regression, and per-feature stat workflows.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- RULE ZERO — Check for pre-computed results FIRST
- PRIMARY SCRIPTS — use these FIRST
- Concrete invocations
- Workspace isolation (CRITICAL)
- CRITICAL — Read before writing any code
- COMPUTE, DON'T DESCRIBE
- LOOK UP, DON'T GUESS
- Features
- When to Use
- Model Selection Decision Tree
- Workflow
- Phase 0: Data Validation
- Phase 1: Model Fitting
- Phase 1b: ANOVA for Multi-Feature Data
- Phase 2: Model Diagnostics
- Phase 3: Interpretation
- Common Patterns
- Statsmodels vs Scikit-learn
- Key Principles
- Reasoning Framework for Result Interpretation
- Evidence Grading
- Interpretation Guidance
- Synthesis Questions
- Completeness Checklist

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.FAERS_calculate_disproportionality`
- `tooluniverse.tool.OpenTargets_target_disease_evidence`
- `tooluniverse.tool.Survival_cox_regression`
- `tooluniverse.tool.Survival_kaplan_meier`
- `tooluniverse.tool.Survival_log_rank_test`
- `tooluniverse.tool.clinical_trial_ae_severity_test`
- `tooluniverse.tool.expression_anova_per_gene`
- `tooluniverse.tool.fda_pharmacogenomic_biomarkers`
- `tooluniverse.tool.read_executed_notebook`
- `tooluniverse.tool.search_clinical_trials`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-statistical-modeling/SKILL.md)；Apache-2.0；原文 SHA-256：`c9844766824e929bb8ef034871be298b16eb09879fe9e4ebadadfdcfee0cf657`。
