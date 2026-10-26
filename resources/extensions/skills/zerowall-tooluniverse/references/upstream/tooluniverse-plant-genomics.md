# plant genomics

Plant genomics and biology research — PlantReactome pathways, Ensembl Plants gene structure, POWO species taxonomy, UniProt annotation, KEGG plant pathways. Handles polyploidy (wheat hexaploidy etc.) and homeologous gene copies. Use for crop-gene annotation, plant secondary metabolism queries, and plant-disease/stress-response biology.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Reasoning Strategy
- When to Use
- Core Tools
- Workflow
- Phase 1: Gene Function
- Phase 2: Plant Pathway Analysis
- Phase 3: Species Comparison
- Phase 4: Interpretation Framework
- Synthesis Questions
- Limitations

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.BAR_get_gene_info`
- `tooluniverse.tool.BAR_get_rnaseq_expression`
- `tooluniverse.tool.EnsemblCompara_get_orthologues`
- `tooluniverse.tool.KEGG_get_pathway_genes`
- `tooluniverse.tool.POWO_search_plants`
- `tooluniverse.tool.PlantReactome_get_pathway`
- `tooluniverse.tool.PlantReactome_list_species`
- `tooluniverse.tool.PlantReactome_search_pathways`
- `tooluniverse.tool.Planteome_get_term`
- `tooluniverse.tool.Planteome_search_annotations`
- `tooluniverse.tool.Planteome_search_terms`
- `tooluniverse.tool.PubMed_search_articles`
- `tooluniverse.tool.USDA_plants_get_characteristics`
- `tooluniverse.tool.USDA_plants_get_profile`
- `tooluniverse.tool.UniProt_get_function_by_accession`
- `tooluniverse.tool.UniProt_search`
- `tooluniverse.tool.ensembl_lookup_gene`
- `tooluniverse.tool.kegg_search_pathway`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-plant-genomics/SKILL.md)；Apache-2.0；原文 SHA-256：`5199cd2624668d53d642fd8c810785b1571926d92104294e6620a14aed9a79fd`。
