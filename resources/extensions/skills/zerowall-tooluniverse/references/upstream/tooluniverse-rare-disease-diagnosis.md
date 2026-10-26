# rare disease diagnosis

Rare disease differential diagnosis from patient phenotype — HPO term matching to candidate diseases (Orphanet, OMIM), gene panel prioritization, ACMG variant interpretation, and structure-based variant analysis. Use for diagnostic odyssey assistance, phenotype-to-disease ranking, and genetic-counseling differential generation.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- LOOK UP, DON'T GUESS
- COMPUTE, DON'T DESCRIBE
- Clinical Reasoning Framework (BEFORE Tools)
- Tool Parameter Corrections
- Workflow
- Key Phase Details
- Evidence Grading
- Fallback Chains

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.ClinVar_get_variant_details`
- `tooluniverse.tool.DisGeNET_search_gene`
- `tooluniverse.tool.FAVOR_annotate_variant`
- `tooluniverse.tool.GTEx_get_expression_summary`
- `tooluniverse.tool.HPA_search_genes_by_query`
- `tooluniverse.tool.HPO_search_terms`
- `tooluniverse.tool.MARRVEL_get_gene`
- `tooluniverse.tool.MARRVEL_get_omim_phenotypes`
- `tooluniverse.tool.MyGene_query_genes`
- `tooluniverse.tool.OMIM_search`
- `tooluniverse.tool.OpenTargets_get_associated_drugs_by_target_ensemblID`
- `tooluniverse.tool.Orphanet_get_genes`
- `tooluniverse.tool.Orphanet_search_diseases`
- `tooluniverse.tool.PanelApp_get_panel`
- `tooluniverse.tool.PanelApp_search_genes`
- `tooluniverse.tool.PanelApp_search_panels`
- `tooluniverse.tool.get_joint_associated_diseases_by_HPO_ID_list`
- `tooluniverse.tool.gnomad_get_variant`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-rare-disease-diagnosis/SKILL.md)；Apache-2.0；原文 SHA-256：`eef1c9e364341dae1edede6676bf83e2ed173dde398654ee01c146cdca591878`。
