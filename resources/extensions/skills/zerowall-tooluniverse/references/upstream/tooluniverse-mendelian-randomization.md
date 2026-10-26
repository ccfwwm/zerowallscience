# mendelian randomization

Mendelian randomization (MR) causal inference — does an exposure, risk factor, or biomarker CAUSALLY affect a disease/outcome, using genetic variants as instrumental variables (IEU OpenGWAS / EpiGraphDB MR-EvE). Use this whenever the user asks if X causes Y, whether an observational association is actually causal or just correlation, if a biomarker/trait is a causal risk factor, wants to triangulate epidemiology against genetic evidence, or mentions Mendelian randomization, instrumental-variable analysis, two-sample MR, or genetic causal evidence — even if they never say "MR" (e.g. "is LDL cholesterol actually causal for heart disease?", "does BMI cause type 2 diabetes or just correlate?", "is CRP a causal driver of stroke?"). Covers trait-label resolution, MR effect direction/magnitude, instrument quality (MOE score), method agreement (IVW vs MR-Egger vs weighted median), bidirectional MR for reverse causation, and distinguishing causation from genetic correlation. Not for plain GWAS association lookups (use the GWAS skills) or fitting your own instruments from raw summary statistics.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- The three instrumental-variable assumptions
- When to use
- Anchor tools
- Workflow
- Step 1 — Resolve trait labels (avoid silent misses)
- Step 2 — Run MR (exposure → outcome)
- Step 3 — Interpret (see tables below)
- Step 4 — Triangulate
- Step 5 — Actionable follow-up (optional)
- Interpretation tables
- Causal effect (`beta`)
- Instrument quality (`moescore`, "Mixture of Experts")
- Method (`method`)
- Limitations (state these honestly)
- Reporting template

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.EpiGraphDB_get_drugs_for_trait`
- `tooluniverse.tool.EpiGraphDB_get_genetic_correlations`
- `tooluniverse.tool.EpiGraphDB_get_mendelian_randomization`
- `tooluniverse.tool.EpiGraphDB_search_opengwas`
- `tooluniverse.tool.MR_estimate`
- `tooluniverse.tool.OPENGWAS_JWT`
- `tooluniverse.tool.OpenGWAS_get_mr_instruments`
- `tooluniverse.tool.gwas_search_associations`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-mendelian-randomization/SKILL.md)；Apache-2.0；原文 SHA-256：`54982d3be8c369cfc3c6bd2a6a5b67991e0bfd49ac6a67ff91a129ce00a86715`。
