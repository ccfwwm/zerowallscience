# drug mechanism research

Trace drug mechanism of action — primary target → downstream signaling → pathway perturbation → tissue/organ effect → clinical outcome. Uses DrugBank, ChEMBL, KEGG, Reactome, STRING. Use for understanding how a drug works, identifying off-target effects, mechanism-based combination therapy design, and writing mechanism sections of reports.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Investigation Philosophy
- When to Use
- NOT for (use other skills)
- Step 1: Resolve the Drug
- Step 2: Identify the Primary Target
- Step 3: Assess Off-Target Effects
- Step 4: Map to Pathway Context
- Step 5: Get the Regulatory View (DailyMed)
- Step 6: Check Pharmacogenomics
- Step 7: Gather Literature Evidence
- Step 8: Integrate and Report
- Evidence Hierarchy
- Report Structure
- Comparing Two Drugs
- Fallback Strategies

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.CPIC_get_drug_info`
- `tooluniverse.tool.CPIC_search_gene_drug_pairs`
- `tooluniverse.tool.ChEMBL_get_drug`
- `tooluniverse.tool.ChEMBL_get_drug_mechanisms`
- `tooluniverse.tool.ChEMBL_get_target_activities`
- `tooluniverse.tool.DailyMed_parse_adverse_reactions`
- `tooluniverse.tool.DailyMed_parse_clinical_pharmacology`
- `tooluniverse.tool.DailyMed_parse_contraindications`
- `tooluniverse.tool.DailyMed_parse_dosing`
- `tooluniverse.tool.DailyMed_parse_drug_interactions`
- `tooluniverse.tool.DailyMed_search_spls`
- `tooluniverse.tool.EuropePMC_get_citations`
- `tooluniverse.tool.EuropePMC_search_articles`
- `tooluniverse.tool.KEGG_get_gene_pathways`
- `tooluniverse.tool.OpenTargets_get_associated_targets_by_drug_chemblId`
- `tooluniverse.tool.OpenTargets_get_drug_chembId_by_generic_name`
- `tooluniverse.tool.OpenTargets_get_drug_description_by_chemblId`
- `tooluniverse.tool.OpenTargets_get_drug_id_description_by_name`
- `tooluniverse.tool.OpenTargets_get_drug_mechanisms_of_action_by_chemblId`
- `tooluniverse.tool.PharmGKB_search_drugs`
- `tooluniverse.tool.PharmGKB_search_genes`
- `tooluniverse.tool.PubMed_search_articles`
- `tooluniverse.tool.ReactomeAnalysis_pathway_enrichment`
- `tooluniverse.tool.Reactome_map_uniprot_to_pathways`
- `tooluniverse.tool.STRING_functional_enrichment`
- `tooluniverse.tool.STRING_get_functional_annotations`
- `tooluniverse.tool.STRING_get_interaction_partners`
- `tooluniverse.tool.WikiPathways_find_pathways_by_gene`
- `tooluniverse.tool.fda_pharmacogenomic_biomarkers`
- `tooluniverse.tool.kegg_find_genes`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-drug-mechanism-research/SKILL.md)；Apache-2.0；原文 SHA-256：`b87f4c31a78c1a3eec19fccc50f9ce95fe4a3581ce4501586032560be091b1b9`。
