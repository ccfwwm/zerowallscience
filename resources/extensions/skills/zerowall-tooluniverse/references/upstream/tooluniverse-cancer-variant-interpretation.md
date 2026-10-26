# cancer variant interpretation

Clinical interpretation of somatic cancer mutations for precision oncology. Transforms a gene + variant + cancer-type input into an actionable report: clinical evidence tier (CIViC, OncoKB), therapeutic options (FDA-approved + investigational), resistance mechanisms, prognosis, and matching clinical trials. Use for tumor-board variant calls, somatic-mutation actionability assessment, and treatment selection. Always cancer-type-specific.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- LOOK UP, DON'T GUESS
- COMPUTE, DON'T DESCRIBE
- When to Use
- Input Parsing
- Phase 0: Tool Parameter Verification (CRITICAL)
- Workflow Overview
- Clinical Reasoning Strategies
- Driver vs Passenger Reasoning
- Actionability Reasoning
- Resistance Reasoning
- When to Use Which Tool
- Gene Resolution
- Clinical Evidence
- Drug Information
- Mutation Prevalence
- Clinical Trials & Literature
- Variant Annotation & Cancer Hotspots (Genome Nexus)
- Cancer Driver Gene Classification (IntOGen)
- Somatic Classification Tiers (CancerVar)
- Fallback Strategy

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.CancerVar_classify_variant`
- `tooluniverse.tool.ChEMBL_get_drug_mechanisms`
- `tooluniverse.tool.ESM_API_KEY`
- `tooluniverse.tool.ESM_explain_variant_mechanism`
- `tooluniverse.tool.FDA_get_indications_by_drug_name`
- `tooluniverse.tool.GTEx_get_median_gene_expression`
- `tooluniverse.tool.GenomeNexus_annotate_dbsnp`
- `tooluniverse.tool.GenomeNexus_annotate_mutation`
- `tooluniverse.tool.GenomeNexus_annotate_variant`
- `tooluniverse.tool.GenomeNexus_get_cancer_hotspots`
- `tooluniverse.tool.GenomeNexus_get_canonical_transcript`
- `tooluniverse.tool.IntOGen_get_drivers`
- `tooluniverse.tool.IntOGen_get_gene_info`
- `tooluniverse.tool.IntOGen_list_cancer_types`
- `tooluniverse.tool.IntOGen_list_cohorts`
- `tooluniverse.tool.MyGene_query_genes`
- `tooluniverse.tool.OpenTargets_get_associated_drugs_by_target_ensemblID`
- `tooluniverse.tool.OpenTargets_get_drug_chembId_by_generic_name`
- `tooluniverse.tool.OpenTargets_get_target_id_description_by_name`
- `tooluniverse.tool.OpenTargets_target_disease_evidence`
- `tooluniverse.tool.PubMed_search_articles`
- `tooluniverse.tool.Reactome_map_uniprot_to_pathways`
- `tooluniverse.tool.UniProt_search`
- `tooluniverse.tool.cBioPortal_get_cancer_studies`
- `tooluniverse.tool.cBioPortal_get_mutations`
- `tooluniverse.tool.civic_get_variant`
- `tooluniverse.tool.civic_get_variants_by_gene`
- `tooluniverse.tool.civic_search_genes`
- `tooluniverse.tool.drugbank_get_drug_basic_info_by_drug_name_or_id`
- `tooluniverse.tool.ensembl_lookup_gene`
- `tooluniverse.tool.search_clinical_trials`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-cancer-variant-interpretation/SKILL.md)；Apache-2.0；原文 SHA-256：`d5dd298f77e063943d72f6a134db48460ecb70e2cda96f2245a6f1a776cc7c4b`。
