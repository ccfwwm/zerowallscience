# clinical trial design

Strategic clinical trial design feasibility assessment. Analyzes 6 dimensions (endpoint, population, comparator, effect size, duration, regulatory pathway) using precedent trials and FDA guidance. Produces enrollment projections, endpoint recommendations, and approval-pathway analysis. Use for trial-protocol design, power/sample-size estimation, comparator selection, and FDA submission strategy. Driven by precedent-based reasoning rather than first-principles math.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Reasoning Before Searching
- Core Principles
- 1. Report-First Approach (MANDATORY)
- 2. Evidence Grading System
- 3. Feasibility Score (0-100)
- When to Use This Skill
- Core Strategy: 6 Research Paths
- Report Structure (14 Sections)
- PATH 1: Patient Population Sizing
- PATH 2: Biomarker Prevalence & Testing
- PATH 3: Comparator Selection
- PATH 4: Endpoint Selection
- PATH 5: Safety Endpoints & Monitoring
- PATH 6: Regulatory Pathway
- Next Steps
- Integration with Other Skills
- Programmatic Access (Beyond Tools)
- Version Information

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.COSMIC_search_mutations`
- `tooluniverse.tool.ClinVar_get_variant_details`
- `tooluniverse.tool.ClinVar_search_variants`
- `tooluniverse.tool.ClinicalTrials_search_studies`
- `tooluniverse.tool.FAERS_count_death_related_by_drug`
- `tooluniverse.tool.FAERS_count_reactions_by_drug_event`
- `tooluniverse.tool.FAERS_search_reports_by_drug_and_reaction`
- `tooluniverse.tool.FDA_OrangeBook_search_drug`
- `tooluniverse.tool.FDA_get_warnings_and_cautions_by_drug_name`
- `tooluniverse.tool.OpenFDA_get_approval_history`
- `tooluniverse.tool.OpenTargets_get_associated_phenotypes_by_disease_efoId`
- `tooluniverse.tool.OpenTargets_get_disease_id_description_by_name`
- `tooluniverse.tool.OpenTargets_get_diseases_phenotypes_by_target_ensembl`
- `tooluniverse.tool.PubMed_search_articles`
- `tooluniverse.tool.drugbank_get_drug_basic_info_by_drug_name_or_id`
- `tooluniverse.tool.drugbank_get_indications_by_drug_name_or_drugbank_id`
- `tooluniverse.tool.drugbank_get_pharmacology_by_drug_name_or_drugbank_id`
- `tooluniverse.tool.gnomad_get_variant`
- `tooluniverse.tool.gnomad_search_variants`
- `tooluniverse.tool.search_clinical_trials`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-clinical-trial-design/SKILL.md)；Apache-2.0；原文 SHA-256：`5d1472040cff9fae3f6d3f4733d6a80658dfc294eeaee68571e4add8387300da`。
