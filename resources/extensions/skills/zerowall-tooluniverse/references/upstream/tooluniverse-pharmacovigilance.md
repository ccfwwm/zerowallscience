# pharmacovigilance

Drug safety and adverse event analysis — FAERS spontaneous-report mining, FDA black-box warnings, signal detection (PRR, ROR, IC), risk factors by demographic/comorbidity, label change tracking, and SIDER curated label-derived side-effect frequencies. Use for post-market safety surveillance, AE signal investigation, drug-AE association strength scoring, "what side effects does drug X have" questions, and pharmacovigilance reports.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- COMPUTE, DON'T DESCRIBE
- When to Use
- Clinical Reasoning Framework
- Reasoning Strategy 1: On-Target vs Off-Target Thinking
- Reasoning Strategy 2: Timeline as Diagnostic Tool
- Reasoning Strategy 3: Dose-Dependent vs Idiosyncratic Classification
- Reasoning Strategy 4: The Naranjo Algorithm for Causality Classification
- Reasoning Strategy 5: The Rechallenge Question
- Reasoning Strategy 5: Disproportionality Reasoning
- Reasoning Strategy 6: When to Use Tools vs Reason
- Reasoning Strategy 7: Pharmacogenomic Risk Assessment
- Critical Workflow Requirements
- Report-First Approach (MANDATORY)
- Citation Requirements (MANDATORY)
- Workflow Overview
- Phase 0: Mechanistic Reasoning (DO THIS BEFORE TOOLS)
- Phase 1: Drug Disambiguation
- Phase 2: Adverse Event Profiling (FAERS)
- FAERS `filter_serious_events` -- MedDRA Spelling (CRITICAL)
- Phase 3: Label Warning Extraction
- Phase 3.5: SIDER Structured Label Side Effects (Faster Alternative/Complement to Raw Label Parsing)
- Phase 4: Pharmacogenomic Risk
- Phase 5: Clinical Trial Safety
- Phase 5.5: Pathway & Mechanism Context

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.CPIC_list_guidelines`
- `tooluniverse.tool.ChEMBL_search_drugs`
- `tooluniverse.tool.DailyMed_get_spl_by_setid`
- `tooluniverse.tool.DailyMed_search_spls`
- `tooluniverse.tool.FAERS_count_reactions_by_drug_event`
- `tooluniverse.tool.FAERS_filter_serious_events`
- `tooluniverse.tool.FAERS_stratify_by_demographics`
- `tooluniverse.tool.FDA_get_adverse_reactions_by_drug_name`
- `tooluniverse.tool.OpenFDA_search_drug_events`
- `tooluniverse.tool.OpenFDA_search_drug_labels`
- `tooluniverse.tool.OpenTargets_get_drug_indications_by_chemblId`
- `tooluniverse.tool.PharmGKB_search_drugs`
- `tooluniverse.tool.PubMed_search_articles`
- `tooluniverse.tool.SIDER_get_drug_indications`
- `tooluniverse.tool.SIDER_get_drug_side_effects`
- `tooluniverse.tool.SIDER_get_drugs_for_side_effect`
- `tooluniverse.tool.SIDER_search_drug`
- `tooluniverse.tool.SIDER_search_side_effect`
- `tooluniverse.tool.search_clinical_trials`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-pharmacovigilance/SKILL.md)；Apache-2.0；原文 SHA-256：`1cc1349b5cede5622668c45d23c5b70986f31461f892d4f32e263ffafc5d3e0d`。
