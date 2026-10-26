# toxicology

Drug and chemical toxicity assessment via adverse outcome pathways (AOPs), real-world FAERS adverse event signals, FDA labels, toxicogenomic associations, and EPA CompTox quantitative hazard/high-throughput bioactivity data. Triangulates molecular initiating event to cellular outcome to organ-level toxicity to clinical adverse event. Use for hepatotoxicity/cardiotoxicity/nephrotoxicity prediction and toxicology reports.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Domain Reasoning
- LOOK UP DON'T GUESS
- COMPUTE, DON'T DESCRIBE
- When to Use This Skill
- KEY PRINCIPLES
- Evidence Grading
- Workflow Overview
- Phase 0: Disambiguation
- Phase 1: Adverse Outcome Pathway Mapping
- Tools
- Workflow
- Decision Logic
- AOP Table Format
- Phase 2: Real-World Adverse Event Signals (FAERS)
- Tools
- Workflow
- Signal Thresholds
- Phase 3: FDA Label Safety Mining
- Tools
- Workflow
- Phase 4: Toxicogenomics (CTD)
- Tools
- Workflow
- Phase 4c: Quantitative Hazard & HTS Bioactivity (EPA CompTox)

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.AOPWiki_get_aop`
- `tooluniverse.tool.AOPWiki_list_aops`
- `tooluniverse.tool.CTD_get_chemical_diseases`
- `tooluniverse.tool.CTD_get_chemical_gene_interactions`
- `tooluniverse.tool.ChEMBL_search_drugs`
- `tooluniverse.tool.CompTox_get_bioactivity_assays`
- `tooluniverse.tool.CompTox_get_bioactivity_summary`
- `tooluniverse.tool.CompTox_get_hazard_data`
- `tooluniverse.tool.CompTox_search_chemical`
- `tooluniverse.tool.DailyMed_parse_adverse_reactions`
- `tooluniverse.tool.DailyMed_parse_clinical_pharmacology`
- `tooluniverse.tool.DailyMed_parse_contraindications`
- `tooluniverse.tool.DailyMed_parse_drug_interactions`
- `tooluniverse.tool.EPA_COMPTOX_API_KEY`
- `tooluniverse.tool.FAERS_calculate_disproportionality`
- `tooluniverse.tool.FAERS_count_reactions_by_drug_event`
- `tooluniverse.tool.FAERS_filter_serious_events`
- `tooluniverse.tool.FAERS_stratify_by_demographics`
- `tooluniverse.tool.OpenFDA_search_drug_events`
- `tooluniverse.tool.PubChem_get_CID_by_compound_name`
- `tooluniverse.tool.T3DB_get_toxin`
- `tooluniverse.tool.T3DB_search_toxins`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-toxicology/SKILL.md)；Apache-2.0；原文 SHA-256：`c3d2f0efd4c2e6add6c140ff7ce0831a6b1ecaa546e650e4b5e408511939a197`。
