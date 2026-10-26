# aging senescence

Aging biology, cellular senescence, and longevity research. Covers senescence markers (p16/CDKN2A, SASP, SA-beta-gal), aging hallmarks, senolytic drug discovery (dasatinib+quercetin, fisetin, navitoclax), epigenetic clocks, telomere biology, and longevity GWAS. Use for senescence-pathway analysis, age-related disease genetics, senolytic-target discovery, and centenarian-genetics queries. Distinguishes correlative vs causal evidence (knockout, intervention).

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Aging Research Reasoning
- LOOK UP, DON'T GUESS
- When to Use
- Workflow
- Phase 1: Hallmarks Classification
- Phase 2: Genetic Evidence
- Phase 3: Pathway Analysis
- Interpreting Senescence Markers
- Phase 4: Senolytic and Geroprotector Drug Discovery
- Phase 5: Literature and Clinical Context
- Phase 6: Report Structure
- Age-Dependent Expression Analysis
- Limitations

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.AgingCohort_search`
- `tooluniverse.tool.ChEMBL_search_drugs`
- `tooluniverse.tool.DGIdb_get_drug_gene_interactions`
- `tooluniverse.tool.GTEx_get_median_gene_expression`
- `tooluniverse.tool.KEGG_get_pathway_genes`
- `tooluniverse.tool.OpenGenes_get_gene`
- `tooluniverse.tool.OpenGenes_search_genes`
- `tooluniverse.tool.OpenTargets_get_associated_targets_by_disease_efoId`
- `tooluniverse.tool.PubMed_search_articles`
- `tooluniverse.tool.ReactomeAnalysis_pathway_enrichment`
- `tooluniverse.tool.STRING_get_network`
- `tooluniverse.tool.gwas_get_snps_for_gene`
- `tooluniverse.tool.gwas_search_associations`
- `tooluniverse.tool.kegg_search_pathway`
- `tooluniverse.tool.search_clinical_trials`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-aging-senescence/SKILL.md)；Apache-2.0；原文 SHA-256：`111b8e32bb0726043223745691822a281976e80ccedad13eeecbafb01520ab37`。
