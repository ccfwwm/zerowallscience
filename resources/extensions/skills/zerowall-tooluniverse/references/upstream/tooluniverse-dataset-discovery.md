# dataset discovery

Find and evaluate research datasets for any scientific question. Maps research questions to required study designs (longitudinal vs cross-sectional, observational vs experimental, single-cohort vs multi-cohort). Use when the user asks 'find data about X', 'where can I get data on Y', or needs a specific cohort/survey/repository. Covers GEO, ArrayExpress, dbGaP, NHANES, UK Biobank, ClinicalTrials.gov, GWAS Catalog, and 30+ scientific repositories.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- When to Use
- Step 1: Understand What the Research Question Requires
- Step 2: Search Strategy
- Step 3: Evaluate Dataset Fitness
- Step 4: Download and Analyze
- Data Loading Cookbook
- Merge, Clean, Analyze
- Step 5: Report Honestly
- LOOK UP, DON'T GUESS

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.DDBJ_search_entries`
- `tooluniverse.tool.DHSProgram_search_indicators`
- `tooluniverse.tool.DbGaP_search_studies`
- `tooluniverse.tool.EGA_get_study`
- `tooluniverse.tool.GSA_get_accession`
- `tooluniverse.tool.Synapse_get_entity`
- `tooluniverse.tool.Synapse_list_children`
- `tooluniverse.tool.Synapse_search_entities`
- `tooluniverse.tool.re3data_get_repository`
- `tooluniverse.tool.re3data_search_repositories`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-dataset-discovery/SKILL.md)；Apache-2.0；原文 SHA-256：`4279322885100b417cd163dfe9b3b1ee0c0ae4fbad283b300062896a2e672aa4`。
