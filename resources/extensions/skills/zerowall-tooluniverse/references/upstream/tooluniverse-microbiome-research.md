# microbiome research

Microbiome research using MGnify, GTDB, ENA, OLS (ENVO biomes), EuropePMC, BacDive (strain phenotypes), MediaDive (growth media recipes), and GMrepo (gut microbiome disease-association counts). Covers study discovery, taxonomic profiling, host-microbe interaction analysis, biome-by-condition queries, strain culturing requirements, and phenotype/disease prevalence lookups. Use for microbiome study selection, organism-environment associations, clinical-microbiome literature review, and "how do I grow this organism" / "how prevalent is this species in condition X" questions. Distinct from analytical workflow (use tooluniverse-metagenomics-analysis for that).

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Core Tools
- Common Workflows
- Workflow 1: Study Discovery by Environment
- Workflow 2: Taxonomic Profiling
- Workflow 3: Genome Quality Assessment
- Workflow 4: Functional Annotation
- Workflow 5: Literature Integration
- Workflow 6: Strain Phenotype, Culturing Requirements, and Disease-Association Prevalence
- MGnify Biome Hierarchy
- Key Identifiers
- Reasoning Framework
- Starting Point: Define the Question First
- Dysbiosis Assessment Strategy
- Taxonomic vs Functional Analysis: When to Use Each
- Evidence Grading
- Interpretation Guidance
- Synthesis Questions
- Tips

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.BacDive_get_strain`
- `tooluniverse.tool.BacDive_search_by_taxon`
- `tooluniverse.tool.CTD_get_chemical_gene_interactions`
- `tooluniverse.tool.ENAPortal_search_samples`
- `tooluniverse.tool.ENAPortal_search_studies`
- `tooluniverse.tool.EuropePMC_search_articles`
- `tooluniverse.tool.GMrepo_get_phenotypes`
- `tooluniverse.tool.GMrepo_search_species`
- `tooluniverse.tool.GTDB_get_species`
- `tooluniverse.tool.GTDB_get_taxon_info`
- `tooluniverse.tool.GTDB_search_genomes`
- `tooluniverse.tool.GTDB_search_taxon`
- `tooluniverse.tool.MGnify_get_genome`
- `tooluniverse.tool.MGnify_get_go_terms`
- `tooluniverse.tool.MGnify_get_interpro`
- `tooluniverse.tool.MGnify_get_study_detail`
- `tooluniverse.tool.MGnify_get_taxonomy`
- `tooluniverse.tool.MGnify_list_analyses`
- `tooluniverse.tool.MGnify_list_biomes`
- `tooluniverse.tool.MGnify_search_genomes`
- `tooluniverse.tool.MGnify_search_studies`
- `tooluniverse.tool.MediaDive_get_ingredient`
- `tooluniverse.tool.MediaDive_get_medium`
- `tooluniverse.tool.MediaDive_search_ingredients`
- `tooluniverse.tool.MediaDive_search_media`
- `tooluniverse.tool.PubChem_get_CID_by_compound_name`
- `tooluniverse.tool.PubChem_get_compound_properties_by_CID`
- `tooluniverse.tool.PubMed_search_articles`
- `tooluniverse.tool.ReactomeAnalysis_pathway_enrichment`
- `tooluniverse.tool.drugbank_vocab_search`
- `tooluniverse.tool.kegg_get_pathway_info`
- `tooluniverse.tool.kegg_search_pathway`
- `tooluniverse.tool.ols_search_terms`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-microbiome-research/SKILL.md)；Apache-2.0；原文 SHA-256：`3c9e84949769ff47f7183517922e87e9ad95d914628fb7265bc512079cef7130`。
