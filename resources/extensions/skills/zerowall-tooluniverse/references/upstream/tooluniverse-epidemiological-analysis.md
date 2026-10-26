# epidemiological analysis

End-to-end observational epidemiology analysis — from research question (PECO Population/Exposure/Comparator/Outcome) to publication-ready statistical report. Covers cohort/case-control/cross-sectional design, regression with confounders, propensity scoring, sensitivity analysis. Writes Python code for every step. Use for epidemiology study analysis, NHANES/UK-Biobank-style analyses.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Step 1: Formulate the Research Question (PECO Framework)
- Step 2: Find and Evaluate Data
- Step 3: Download and Prepare Data
- Step 4: Descriptive Statistics (Table 1)
- Step 5: Regression Analysis
- Step 6: Sensitivity Analyses
- Step 7: Biological Interpretation (ToolUniverse Advantage)
- Step 8: Visualization
- Step 9: Report Structure
- Completeness Checklist

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.DHSProgram_get_data`
- `tooluniverse.tool.DHSProgram_search_indicators`
- `tooluniverse.tool.DiseaseSH_get_covid_historical`
- `tooluniverse.tool.DiseaseSH_get_vaccine_coverage`
- `tooluniverse.tool.DiseaseSh_get_country_stats`
- `tooluniverse.tool.DiseaseSh_get_global_stats`
- `tooluniverse.tool.DiseaseSh_get_historical`
- `tooluniverse.tool.EuropePMC_search_articles`
- `tooluniverse.tool.HF_TOKEN`
- `tooluniverse.tool.OpenMeteo_get_air_quality`
- `tooluniverse.tool.OpenMeteo_get_historical_climate`
- `tooluniverse.tool.PubMed_search_articles`
- `tooluniverse.tool.WAQI_get_air_quality`
- `tooluniverse.tool.WHOGHO_get_indicator_data`
- `tooluniverse.tool.WHOGHO_list_dimension_values`
- `tooluniverse.tool.WHOGHO_search_indicators`
- `tooluniverse.tool.euhealthinfo_deepdive`
- `tooluniverse.tool.euhealthinfo_search_cancer`
- `tooluniverse.tool.execute_tool`
- `tooluniverse.tool.health_disparities_get_county_rankings_info`
- `tooluniverse.tool.health_disparities_get_svi_info`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-epidemiological-analysis/SKILL.md)；Apache-2.0；原文 SHA-256：`93e2c844c16f03c79710d4e78b8ea9891c13759baeb4eb54cd90d136a5c15c19`。
