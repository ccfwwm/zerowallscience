# gwas drug discovery

Transform GWAS signals into drug targets and repurposing opportunities. Connects GWAS-significant loci to causal genes via fine-mapping/eQTL, then to druggable proteins via DGIdb/OpenTargets, then to existing drugs via ChEMBL. Use for GWAS-to-target hypothesis generation, druggable-fraction analysis of disease loci, and human-genetics-validated drug-repurposing prioritization.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Overview
- Reasoning Strategy
- Workflow Steps
- Step 1: GWAS Gene Discovery
- Step 2: Druggability Assessment
- Step 3: Target Prioritization
- Step 4: Existing Drug Search
- Step 5: Clinical Evidence & Safety
- Step 6: Repurposing Opportunities
- All Tools by Category
- Best Practices
- Parameter Gotchas
- Interpretation: From GWAS Hit to Drug Target
- GWAS Signal Strength Assessment
- Target Prioritization Decision Tree

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.ChEMBL_get_drug_mechanisms`
- `tooluniverse.tool.ChEMBL_get_target_activities`
- `tooluniverse.tool.ChEMBL_search_drugs`
- `tooluniverse.tool.ClinicalTrials_search_studies`
- `tooluniverse.tool.DGIdb_get_drug_gene_interactions`
- `tooluniverse.tool.EuropePMC_search_articles`
- `tooluniverse.tool.FDA_get_active_ingredient_info_by_drug_name`
- `tooluniverse.tool.FDA_get_adverse_reactions_by_drug_name`
- `tooluniverse.tool.OpenTargets_get_associated_drugs_by_disease_efoId`
- `tooluniverse.tool.OpenTargets_get_drug_mechanisms_of_action_by_chemblId`
- `tooluniverse.tool.OpenTargets_get_drug_warnings_by_chemblId`
- `tooluniverse.tool.OpenTargets_get_target_classes_by_ensemblID`
- `tooluniverse.tool.OpenTargets_get_target_genomic_location_by_ensemblID`
- `tooluniverse.tool.OpenTargets_get_target_safety_profile_by_ensemblID`
- `tooluniverse.tool.OpenTargets_get_target_tractability_by_ensemblID`
- `tooluniverse.tool.OpenTargets_get_variant_credible_sets`
- `tooluniverse.tool.OpenTargets_search_gwas_studies_by_disease`
- `tooluniverse.tool.PubMed_search_articles`
- `tooluniverse.tool.gwas_get_associations_for_snp`
- `tooluniverse.tool.gwas_get_associations_for_trait`
- `tooluniverse.tool.gwas_search_associations`
- `tooluniverse.tool.gwas_search_studies`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-gwas-drug-discovery/SKILL.md)；Apache-2.0；原文 SHA-256：`275ef79244acd42079621fd052234516cf4dade521a9871c3f4295e00b568bfa`。
