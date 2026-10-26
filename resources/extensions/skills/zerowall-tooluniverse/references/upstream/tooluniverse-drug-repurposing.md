# drug repurposing

Identify drug repurposing candidates via target-based, compound-based, and disease-based strategies. Combines drug-target-disease network reasoning with mechanism rationale, clinical-trial precedent, and patent/regulatory feasibility. Use for hypothesis-generating repurposing for orphan diseases, finding existing drugs for new indications, and prioritizing candidates by evidence and feasibility.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Reasoning Before Searching
- Core Strategies
- Workflow Overview
- Key ToolUniverse Tools
- Scoring & Decision Framework
- Repurposing Viability Score (0-100)
- Evidence Grading for Repurposing
- How to Interpret and Combine Results
- Best Practices
- Patent Landscape Check (USPTO)
- Signature-Based Repurposing (LINCS / L1000FWD)
- Cross-Knowledge-Graph Queries (NCATS Biomedical Data Translator)
- Computational Procedure: Drug-Target Dose Feasibility Check

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.ADMETAI_predict_BBB_penetrance`
- `tooluniverse.tool.ADMETAI_predict_physicochemical_properties`
- `tooluniverse.tool.ADMETAI_predict_toxicity`
- `tooluniverse.tool.CTD_get_gene_diseases`
- `tooluniverse.tool.ChEMBL_get_drug_mechanisms`
- `tooluniverse.tool.ChEMBL_search_activities`
- `tooluniverse.tool.ChEMBL_search_drugs`
- `tooluniverse.tool.DGIdb_get_drug_gene_interactions`
- `tooluniverse.tool.EuropePMC_search_articles`
- `tooluniverse.tool.FAERS_count_death_related_by_drug`
- `tooluniverse.tool.FAERS_search_reports_by_drug_and_reaction`
- `tooluniverse.tool.FDA_get_warnings_and_cautions_by_drug_name`
- `tooluniverse.tool.L1000FWD_sig_search`
- `tooluniverse.tool.LINCS_list_libraries`
- `tooluniverse.tool.LINCS_search_signatures`
- `tooluniverse.tool.NCATSTranslator_query_associations`
- `tooluniverse.tool.NCATSTranslator_resolve_entity`
- `tooluniverse.tool.OpenTargets_get_associated_targets_by_disease_efoId`
- `tooluniverse.tool.OpenTargets_get_disease_id_description_by_name`
- `tooluniverse.tool.PubMed_search_articles`
- `tooluniverse.tool.ReactomeAnalysis_pathway_enrichment`
- `tooluniverse.tool.STRING_get_network`
- `tooluniverse.tool.USPTO_API_KEY`
- `tooluniverse.tool.UniProt_get_entry_by_accession`
- `tooluniverse.tool.drugbank_get_drug_basic_info_by_drug_name_or_id`
- `tooluniverse.tool.drugbank_get_drug_interactions_by_drug_name_or_id`
- `tooluniverse.tool.drugbank_get_drug_name_and_description_by_indication`
- `tooluniverse.tool.drugbank_get_drug_name_and_description_by_target_name`
- `tooluniverse.tool.drugbank_get_indications_by_drug_name_or_drugbank_id`
- `tooluniverse.tool.drugbank_get_pharmacology_by_drug_name_or_drugbank_id`
- `tooluniverse.tool.drugbank_get_targets_by_drug_name_or_drugbank_id`
- `tooluniverse.tool.get_associated_documents_metadata`
- `tooluniverse.tool.get_patent_application_metadata`
- `tooluniverse.tool.get_patent_continuity_data`
- `tooluniverse.tool.get_patent_foreign_priority_data`
- `tooluniverse.tool.get_patent_overview_by_text_query`
- `tooluniverse.tool.get_patent_term_adjustment_data`
- `tooluniverse.tool.search_clinical_trials`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-drug-repurposing/SKILL.md)；Apache-2.0；原文 SHA-256：`7874b2d9cc069baf902ee374974d75aa24e2e78cae102d8b5f7c9e55029181a8`。
