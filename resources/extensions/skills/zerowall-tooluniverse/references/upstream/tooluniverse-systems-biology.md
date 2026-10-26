# systems biology

Systems biology and pathway analysis integrating Reactome, KEGG, WikiPathways, BioCarta, NCI-Nature Pathway Interaction Database. Multi-database pathway enrichment, protein-pathway relationships, network reasoning. Use for pathway analysis on a gene list, multi-source pathway concordance, and systems-level interpretation across databases.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- When to Use This Skill
- COMPUTE, DON'T DESCRIBE
- Domain Reasoning: Enrichment vs Causation
- Core Databases Integrated
- Workflow Overview
- Phase 1: Pathway Enrichment Analysis
- Tools & Workflow
- Phase 2: Protein-Pathway Mapping
- Tools Used
- Workflow
- Decision Logic
- Phase 3: Keyword-Based Pathway Search
- Tools
- Phase 4: Top-Level Pathway Catalog
- Tools Used
- Workflow
- Decision Logic
- Output Structure
- Domain Reasoning: Enzyme Kinetics & Metabolic Analysis
- Michaelis-Menten Kinetics
- Allosteric Regulation & Cooperative Binding
- Enzyme Inhibition Types
- Metabolic Flux Analysis Reasoning
- Genome-Scale Metabolic Models & FBA (BiGG)

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.BRENDA_EMAIL`
- `tooluniverse.tool.BRENDA_PASSWORD`
- `tooluniverse.tool.BRENDA_get_enzyme_info`
- `tooluniverse.tool.BiGG_download_model`
- `tooluniverse.tool.BiGG_get_database_version`
- `tooluniverse.tool.BiGG_get_metabolite`
- `tooluniverse.tool.BiGG_get_model`
- `tooluniverse.tool.BiGG_get_model_reactions`
- `tooluniverse.tool.BiGG_get_reaction`
- `tooluniverse.tool.BiGG_list_models`
- `tooluniverse.tool.BiGG_search`
- `tooluniverse.tool.BindingDB_search_by_target`
- `tooluniverse.tool.ChEMBL_get_molecule`
- `tooluniverse.tool.EuropePMC_search_articles`
- `tooluniverse.tool.GOAPI_get_gene_functions`
- `tooluniverse.tool.GOAPI_get_genes_by_function`
- `tooluniverse.tool.GOAPI_get_term`
- `tooluniverse.tool.GO_get_annotations_for_gene`
- `tooluniverse.tool.GO_get_term_by_id`
- `tooluniverse.tool.GO_get_term_details`
- `tooluniverse.tool.INDRA_get_evidence_count`
- `tooluniverse.tool.INDRA_get_statement_by_hash`
- `tooluniverse.tool.INDRA_get_statements`
- `tooluniverse.tool.KEGG_get_brite_hierarchy`
- `tooluniverse.tool.KEGG_list_brite_hierarchies`
- `tooluniverse.tool.PathwayCommons_search`
- `tooluniverse.tool.ReactomeAnalysis_pathway_enrichment`
- `tooluniverse.tool.ReactomeInteractors_get_entity_pathways`
- `tooluniverse.tool.ReactomeInteractors_get_protein_interactors`
- `tooluniverse.tool.ReactomeInteractors_search_entity`
- `tooluniverse.tool.Reactome_get_interactor`
- `tooluniverse.tool.Reactome_get_pathway_reactions`
- `tooluniverse.tool.Reactome_list_top_pathways`
- `tooluniverse.tool.Reactome_map_uniprot_to_pathways`
- `tooluniverse.tool.Rhea_get_reaction`
- `tooluniverse.tool.Rhea_get_reaction_participants`
- `tooluniverse.tool.Rhea_search_by_chebi`
- `tooluniverse.tool.Rhea_search_by_ec`
- `tooluniverse.tool.Rhea_search_reactions`
- `tooluniverse.tool.STRING_functional_enrichment`
- `tooluniverse.tool.WikiPathways_search`
- `tooluniverse.tool.biomodels_search`
- `tooluniverse.tool.enrichr_gene_enrichment_analysis`
- `tooluniverse.tool.intact_get_interactions`
- `tooluniverse.tool.kegg_get_pathway_info`
- `tooluniverse.tool.kegg_search_pathway`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-systems-biology/SKILL.md)；Apache-2.0；原文 SHA-256：`7f8c1810fdca2572372c21f7e9bb04d6e5ba277e57907334b48153bdae560520`。
