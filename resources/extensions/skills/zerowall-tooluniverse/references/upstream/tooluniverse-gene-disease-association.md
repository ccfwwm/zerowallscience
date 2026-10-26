# gene disease association

Gene-disease association analysis across DisGeNET, OpenTargets, Monarch, OMIM, GenCC, Orphanet, Gene2Phenotype (G2P). Cross-references multiple sources for evidence-graded association reports with concordance scoring (5/5 sources agree → strong, 1/5 → weak). Use for 'which diseases is gene X associated with' or 'which genes cause disease Y' queries with quantitative confidence, including clinical-panel-based curation (developmental disorders, cancer, cardiac, skeletal, eye, skin panels).

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- LOOK UP, DON'T GUESS
- Core Principles
- Workflow Overview
- Phase 1: Gene/Disease Identification & ID Resolution
- Phase 2: DisGeNET Associations
- Phase 3: OpenTargets Associations
- Phase 4: Monarch Initiative Associations
- Phase 5: Mendelian Disease Evidence
- Phase 6: Variant-Disease Associations (Optional)
- Phase 7: Evidence Synthesis
- Unified Association Table
- Reasoning Strategies for Evidence Evaluation
- Common Patterns
- Resources

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.ClinVar_get_variant_details`
- `tooluniverse.tool.ClinVar_search_variants`
- `tooluniverse.tool.DISGENET_API_KEY`
- `tooluniverse.tool.DisGeNET_get_disease_genes`
- `tooluniverse.tool.DisGeNET_get_gda`
- `tooluniverse.tool.DisGeNET_get_vda`
- `tooluniverse.tool.DisGeNET_search_disease`
- `tooluniverse.tool.DisGeNET_search_gene`
- `tooluniverse.tool.EnsemblPheno_get_by_gene`
- `tooluniverse.tool.EnsemblPheno_get_by_variant`
- `tooluniverse.tool.G2P_download_panel`
- `tooluniverse.tool.G2P_get_panel`
- `tooluniverse.tool.G2P_get_record`
- `tooluniverse.tool.G2P_search`
- `tooluniverse.tool.GenCC_get_classifications`
- `tooluniverse.tool.GenCC_search_disease`
- `tooluniverse.tool.GenCC_search_gene`
- `tooluniverse.tool.Harmonizome_get_gene`
- `tooluniverse.tool.MonarchV3_get_associations`
- `tooluniverse.tool.MonarchV3_get_entity`
- `tooluniverse.tool.MonarchV3_get_histopheno`
- `tooluniverse.tool.MonarchV3_get_mappings`
- `tooluniverse.tool.MonarchV3_search`
- `tooluniverse.tool.Monarch_search`
- `tooluniverse.tool.MyGene_query_genes`
- `tooluniverse.tool.OMIM_API_KEY`
- `tooluniverse.tool.OMIM_get_clinical_synopsis`
- `tooluniverse.tool.OMIM_get_entry`
- `tooluniverse.tool.OMIM_get_gene_map`
- `tooluniverse.tool.OMIM_search`
- `tooluniverse.tool.OpenTargets_get_diseases_phenotypes_by_target_ensembl`
- `tooluniverse.tool.OpenTargets_multi_entity_search_by_query_string`
- `tooluniverse.tool.OpenTargets_target_disease_evidence`
- `tooluniverse.tool.Orphanet_get_gene_diseases`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-gene-disease-association/SKILL.md)；Apache-2.0；原文 SHA-256：`47cf1a0b08593a7454e07a6080c29d91d0a96bdb0abbac480f52c9676c0b5826`。
