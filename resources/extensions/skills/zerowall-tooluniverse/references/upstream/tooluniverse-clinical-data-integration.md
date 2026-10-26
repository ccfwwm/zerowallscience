# clinical data integration

End-to-end drug safety review integrating FDA labels, FAERS adverse event reports, PRR/ROR disproportionality, pharmacogenomic biomarkers, clinical trial data, and published literature. Use for regulatory drug safety reviews, comprehensive pharmacovigilance reports, label-vs-real-world AE comparison, and clinical decision support for drug safety.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- LOOK UP, DON'T GUESS
- COMPUTE, DON'T DESCRIBE
- When to Use
- Core Data Sources
- Workflow Overview
- Phase Details
- Phase 0: Drug Identity & Context
- Phase 1: FDA Label Extraction
- Phase 2: FAERS Signal Detection
- Phase 3: Pharmacogenomics
- Phase 4: Clinical Trials
- Phase 5: Literature Evidence
- Phase 6: Integrated Safety Report
- Common Analysis Patterns
- Edge Cases & Fallbacks
- Limitations

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.CPIC_list_guidelines`
- `tooluniverse.tool.DailyMed_parse_adverse_reactions`
- `tooluniverse.tool.DailyMed_parse_drug_interactions`
- `tooluniverse.tool.DailyMed_search_spls`
- `tooluniverse.tool.FAERS_calculate_disproportionality`
- `tooluniverse.tool.FAERS_count_reactions_by_drug_event`
- `tooluniverse.tool.FAERS_filter_serious_events`
- `tooluniverse.tool.FAERS_stratify_by_demographics`
- `tooluniverse.tool.FDA_get_boxed_warning_info_by_drug_name`
- `tooluniverse.tool.FDA_get_warnings_and_cautions_by_drug_name`
- `tooluniverse.tool.OpenFDA_get_approval_history`
- `tooluniverse.tool.PubMed_search_articles`
- `tooluniverse.tool.fda_pharmacogenomic_biomarkers`
- `tooluniverse.tool.search_clinical_trials`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-clinical-data-integration/SKILL.md)；Apache-2.0；原文 SHA-256：`f884d55c4e4a03786091c59893efd8e300e175bcd706a9ae8cd7dd3f723aaeb5`。
