# drug drug interaction

Assess drug-drug interactions — CYP metabolic interactions (substrate/inhibitor/inducer), transporter (P-gp, BCRP, OATP) effects, pharmacodynamic synergy/antagonism, clinical significance scoring, and management recommendations. Use for polypharmacy review, prescribing decision support, and safety analysis when adding or switching drugs.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- LOOK UP, DON'T GUESS
- New Symptom After New Medication: First-Line Reasoning
- When to Use This Skill
- Clinical Reasoning Framework
- The Perpetrator-Victim Model
- Phase II Metabolism: Glucuronidation Interactions (UGT Enzymes)
- Enzyme Induction and Inhibition: Cascading Effects
- ADR Attribution: Which Mechanism Caused the Problem?
- Timeline Reasoning
- The Three Questions
- Severity Reasoning
- Critical Workflow Requirements
- 1. Report-First Approach (MANDATORY)
- Tool Workflow
- Phase 1: Drug Identification
- Phase 2: PK Interaction Analysis
- Phase 3: PD Interaction Analysis
- Phase 4: Clinical Evidence Assessment
- Phase 5: Risk Scoring
- Phase 6: Alternatives and Monitoring
- Output Report Structure
- Success Criteria

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.ChEMBL_get_drug_mechanisms`
- `tooluniverse.tool.DailyMed_get_spl_by_setid`
- `tooluniverse.tool.KEGG_get_drug`
- `tooluniverse.tool.PubMed_search_articles`
- `tooluniverse.tool.drugbank_get_drug_interactions_by_drug_name_or_id`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-drug-drug-interaction/SKILL.md)；Apache-2.0；原文 SHA-256：`a4c85078abaec5af40d544f262e34e5746a08d84d8efe16e24ac1c0097e2f306`。
