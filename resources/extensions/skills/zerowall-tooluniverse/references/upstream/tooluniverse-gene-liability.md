# gene liability

Evaluate the human safety liability of knocking down, knocking out, degrading, or pharmacologically inhibiting a gene. Use for gene safety scoring, on-target toxicity assessment, essentiality and genetic-constraint review, critical-organ expression analysis, or deciding whether a target needs partial, transient, or tissue-specific modulation.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Required Input
- Evidence Rules
- Workflow
- 1. Resolve the gene
- 2. Gather the five scoring dimensions
- 3. Assign dimension points
- Human genetic constraint — 0 to 25
- Mammalian knockout phenotype — 0 to 25
- Critical-organ expression — 0 to 20
- Observed on-target effects — 0 to 20
- Cellular essentiality and redundancy — 0 to 10
- 4. Calculate score, coverage, and confidence
- 5. Translate liability into a strategy
- Required Output

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.ClinVar_search_variants`
- `tooluniverse.tool.DepMap_get_gene_dependencies`
- `tooluniverse.tool.GTEx_get_median_gene_expression`
- `tooluniverse.tool.HPA_get_comprehensive_gene_details_by_ensembl_id`
- `tooluniverse.tool.MyGene_query_genes`
- `tooluniverse.tool.OpenTargets_get_associated_drugs_by_target_ensemblID`
- `tooluniverse.tool.OpenTargets_get_biological_mouse_models_by_ensemblID`
- `tooluniverse.tool.OpenTargets_get_target_safety_profile_by_ensemblID`
- `tooluniverse.tool.gnomad_get_gene_constraints`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-gene-liability/SKILL.md)；Apache-2.0；原文 SHA-256：`48874430fea22847827aa250359c348ddfc4067baef590b29be0cfb23eee8b0f`。
