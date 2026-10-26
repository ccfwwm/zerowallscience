# clinical trial protocol

Generate a full clinical trial protocol document (ICH E6(R2)/FDA-style) for a drug or medical device, including background, objectives/endpoints, study design, population/eligibility, intervention details, assessment schedule, statistical analysis plan with sample-size justification, safety monitoring, and regulatory/ethical sections. Use when users say "generate a clinical trial protocol", "draft a protocol for [drug/device]", "write up the study design as a protocol document", "create an FDA submission protocol", "help me write section X of a trial protocol", or "calculate the sample size for this trial". Produces a stakeholder-ready Markdown deliverable, not a feasibility score.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- When to Use This Skill
- NOT for (use other skills instead)
- Workflow
- Step 1 — Confirm feasibility inputs exist
- Step 2 — Identify intervention type
- Step 3 — Draft each protocol section with grounded evidence
- Step 4 — Calculate sample size
- Step 5 — Assemble the final document
- Integration with Other Skills

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.ClinicalTrials_get_study`
- `tooluniverse.tool.ClinicalTrials_search_by_intervention`
- `tooluniverse.tool.ClinicalTrials_search_studies`
- `tooluniverse.tool.FDAGSRS_search_substances`
- `tooluniverse.tool.FDAPurpleBook_search_products`
- `tooluniverse.tool.FDA_OrangeBook_get_approval_history`
- `tooluniverse.tool.FDA_OrangeBook_get_exclusivity`
- `tooluniverse.tool.FDA_OrangeBook_search_drug`
- `tooluniverse.tool.OpenFDADevice_get_classification`
- `tooluniverse.tool.OpenFDADevice_search_510k`
- `tooluniverse.tool.OpenFDADevice_search_adverse_events`
- `tooluniverse.tool.OpenFDADevice_search_pma`
- `tooluniverse.tool.OpenFDADevice_search_recalls`
- `tooluniverse.tool.OpenFDADevice_search_udi`
- `tooluniverse.tool.OpenFDA_get_approval_history`
- `tooluniverse.tool.OpenFDA_get_approved_products`
- `tooluniverse.tool.OpenFDA_search_drug_approvals`
- `tooluniverse.tool.PubMed_search_articles`
- `tooluniverse.tool.extract_clinical_trial_adverse_events`
- `tooluniverse.tool.get_clinical_trial_eligibility_criteria`
- `tooluniverse.tool.get_clinical_trial_outcome_measures`
- `tooluniverse.tool.search_clinical_trials`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-clinical-trial-protocol/SKILL.md)；Apache-2.0；原文 SHA-256：`b8c5c6e8217a43b0584ad003f210b6dbf76a865e9777c7bac89353ed7fce42e1`。
