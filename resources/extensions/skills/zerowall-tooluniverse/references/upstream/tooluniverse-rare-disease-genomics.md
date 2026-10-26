# rare disease genomics

Rare disease genomics — disease identification (Orphanet), causative gene discovery, gene-disease validity (GenCC), variant interpretation (ClinVar), and translational research (ClinicalTrials.gov, drug repurposing for orphans). Use for rare-disease-gene curation, novel-gene-discovery analysis, and rare-disease drug-development support.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- COMPUTE, DON'T DESCRIBE
- Rare Disease Investigation Strategy
- Variant Prioritization Reasoning (CRITICAL)
- How to filter thousands of variants down to one causal variant
- When to Use
- NOT for (use other skills instead)
- Workflow Overview
- Phase 0: Disambiguation
- Phase 1: Disease Characterization
- Phase 2: Phenotype Mapping (HPO)
- OLS for ontology lookups
- Phase 3: Causative Gene Discovery
- Phase 4: Gene-Disease Validity Assessment
- Phase 5: Pathogenic Variant Lookup
- Phase 6: Epidemiology
- Phase 6b: Metabolite-Disease Context (IEM)
- Phase 7: Clinical Trials
- Phase 8: Literature
- Evidence Grading
- Fallback Strategies
- Example Workflows
- Full Rare Disease Investigation (disease name input)
- Gene-First Investigation (starting from a gene)
- Common Mistakes to Avoid

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.ClinVar_get_clinical_significance`
- `tooluniverse.tool.ClinVar_get_variant_details`
- `tooluniverse.tool.ClinVar_search_variants`
- `tooluniverse.tool.EuropePMC_search_articles`
- `tooluniverse.tool.GenCC_search_disease`
- `tooluniverse.tool.GenCC_search_gene`
- `tooluniverse.tool.HMDB_get_diseases`
- `tooluniverse.tool.HMDB_get_metabolite`
- `tooluniverse.tool.HMDB_search`
- `tooluniverse.tool.Orphadata_get_disorder`
- `tooluniverse.tool.Orphanet_get_classification`
- `tooluniverse.tool.Orphanet_get_disease`
- `tooluniverse.tool.Orphanet_get_epidemiology`
- `tooluniverse.tool.Orphanet_get_gene_diseases`
- `tooluniverse.tool.Orphanet_get_genes`
- `tooluniverse.tool.Orphanet_get_icd_mapping`
- `tooluniverse.tool.Orphanet_get_natural_history`
- `tooluniverse.tool.Orphanet_get_phenotypes`
- `tooluniverse.tool.Orphanet_search_diseases`
- `tooluniverse.tool.ols_get_term_ancestors`
- `tooluniverse.tool.ols_get_term_children`
- `tooluniverse.tool.ols_get_term_info`
- `tooluniverse.tool.ols_search_terms`
- `tooluniverse.tool.search_clinical_trials`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-rare-disease-genomics/SKILL.md)；Apache-2.0；原文 SHA-256：`374cdb7263dcd051f7186048968818e467ae2ab37fa9318f6f16b7a8afef2360`。
