# drug regulatory

Drug regulatory and approval research — FDA substance registry, ATC/EPC classification, EMA decisions, generic-drug status, FDA Orange Book exclusivity, NDA/BLA pathways. Use for jurisdiction-aware approval status (FDA vs EMA), generic vs brand availability, exclusivity expiry tracking, and regulatory pathway selection. Always specifies the market when reporting status.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- When to Use
- NOT for (use other skills instead)
- Workflow Overview
- Phase 1: Substance Identification (FDAGSRS)
- Phase 2: Drug Classification (RxClass)
- Phase 3: Approval & Generic Status (FDA Orange Book / Purple Book)
- Phase 4: Patent & Exclusivity
- Phase 5: Label Parsing (DailyMed)
- Phase 6: Clinical Trials
- Example Workflows
- Workflow 1: Full Regulatory Profile for a Drug
- Workflow 2: List All Drugs in a Therapeutic Class
- Workflow 3: Drug Label Review
- Common Mistakes
- Reasoning Framework
- Interpretation Guidance
- Synthesis Questions

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.DailyMed_parse_adverse_reactions`
- `tooluniverse.tool.DailyMed_parse_clinical_pharmacology`
- `tooluniverse.tool.DailyMed_parse_contraindications`
- `tooluniverse.tool.DailyMed_parse_dosing`
- `tooluniverse.tool.DailyMed_parse_drug_interactions`
- `tooluniverse.tool.DailyMed_search_spls`
- `tooluniverse.tool.FAERS_count_reactions_by_drug_event`
- `tooluniverse.tool.FDAGSRS_get_structure`
- `tooluniverse.tool.FDAGSRS_get_substance`
- `tooluniverse.tool.FDAGSRS_search_substances`
- `tooluniverse.tool.FDAPurpleBook_search_products`
- `tooluniverse.tool.FDA_OrangeBook_check_generic_availability`
- `tooluniverse.tool.FDA_OrangeBook_get_approval_history`
- `tooluniverse.tool.FDA_OrangeBook_get_exclusivity`
- `tooluniverse.tool.FDA_OrangeBook_get_patent_info`
- `tooluniverse.tool.FDA_OrangeBook_get_te_code`
- `tooluniverse.tool.FDA_OrangeBook_search_drug`
- `tooluniverse.tool.OpenFDA_get_approval_history`
- `tooluniverse.tool.PubMed_search_articles`
- `tooluniverse.tool.RxClass_find_classes`
- `tooluniverse.tool.RxClass_get_class_members`
- `tooluniverse.tool.RxClass_get_drug_classes`
- `tooluniverse.tool.RxNorm_get_drug_names`
- `tooluniverse.tool.drugbank_vocab_search`
- `tooluniverse.tool.search_clinical_trials`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-drug-regulatory/SKILL.md)；Apache-2.0；原文 SHA-256：`ac25604c507d5384fee71090846f457c08789c5a60c233c2f3fe2285b1702ff5`。
