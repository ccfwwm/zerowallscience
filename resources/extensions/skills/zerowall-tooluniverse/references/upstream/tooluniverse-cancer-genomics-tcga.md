# cancer genomics tcga

TCGA/GDC cancer genomics analysis — cohort construction, clinical metadata retrieval, somatic mutation frequencies, survival analysis, and multi-omics integration. Use for TCGA-BRCA-style cohort studies, mutation prevalence by cancer type, survival-by-mutation analysis, and pan-cancer driver discovery. Always cancer-type-specific (don't use pan-cancer counts without cohort context).

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- When to Use
- NOT for (use other skills instead)
- Workflow Overview
- Key Identifiers
- Common TCGA Project IDs
- Phase 1: Study Selection
- Phase 2: Clinical Data
- Phase 3: Somatic Mutations
- Phase 4: CNV Analysis (Progenetix)
- Phase 5: Survival Analysis
- Phase 6: Variant Interpretation (OncoKB)
- Example Workflows
- Workflow 1: Gene-Centric Mutation + Survival Analysis
- Workflow 2: Cohort Clinical Summary
- Workflow 3: CNV Analysis for a Gene
- Reasoning Framework
- Evidence Grading
- Interpretation Guidance
- Synthesis Questions
- Programmatic Access (Beyond Tools)
- Limitations

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.GDC_get_clinical_data`
- `tooluniverse.tool.GDC_get_mutation_frequency`
- `tooluniverse.tool.GDC_get_ssm_by_gene`
- `tooluniverse.tool.GDC_get_survival`
- `tooluniverse.tool.GDC_list_files`
- `tooluniverse.tool.GDC_list_projects`
- `tooluniverse.tool.GDC_search_cases`
- `tooluniverse.tool.ONCOKB_API_TOKEN`
- `tooluniverse.tool.OncoKB_annotate_variant`
- `tooluniverse.tool.Progenetix_cnv_search`
- `tooluniverse.tool.Progenetix_list_cohorts`
- `tooluniverse.tool.Progenetix_list_filtering_terms`
- `tooluniverse.tool.Progenetix_search_biosamples`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-cancer-genomics-tcga/SKILL.md)；Apache-2.0；原文 SHA-256：`1780c1fb2c14d51115e9c2c6848d6270e636845f138c0a8f894037611f3ceeac`。
