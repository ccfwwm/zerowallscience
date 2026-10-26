# comparative genomics

Cross-species gene comparison and ortholog analysis. Integrates Ensembl Compara orthologs, NCBI Gene, UniProt, OLS, Monarch, and OpenTargets to identify orthologs, paralogs, sequence conservation, functional conservation across species, and lineage-specific gene gains/losses. Use for phylogenetic gene tracing, model-organism mapping, and evolutionary-genomics queries.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- LOOK UP, DON'T GUESS
- COMPUTE, DON'T DESCRIBE
- When to Use This Skill
- Conservation Reasoning Framework
- Workflow Overview
- Phase 1: Gene Identification & Validation
- Phase 2: Ortholog Discovery
- OMA as a complementary/broader ortholog source
- OrthoDB as a second group-based ortholog source
- Phase 3: Sequence Retrieval
- Phase 4: Functional Annotation Comparison
- Phase 5: Cross-Species Phenotype Bridging
- Phase 6: Gene Tree & Evolutionary Context
- Synthesis Questions
- Fallback Strategies
- Limitations

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.BLAST_protein_search`
- `tooluniverse.tool.EnsemblCompara_get_gene_tree`
- `tooluniverse.tool.EnsemblCompara_get_orthologues`
- `tooluniverse.tool.EnsemblCompara_get_paralogues`
- `tooluniverse.tool.EnsemblSeq_get_id_sequence`
- `tooluniverse.tool.GoaT_get_species`
- `tooluniverse.tool.MonarchV3_get_associations`
- `tooluniverse.tool.Monarch_get_gene_diseases`
- `tooluniverse.tool.Monarch_get_gene_phenotypes`
- `tooluniverse.tool.Monarch_search_gene`
- `tooluniverse.tool.NCBIDatasets_get_genome_assembly`
- `tooluniverse.tool.NCBIDatasets_get_sequence_reports`
- `tooluniverse.tool.NCBIDatasets_list_genomes_by_taxon`
- `tooluniverse.tool.NCBI_fetch_accessions`
- `tooluniverse.tool.NCBI_get_sequence`
- `tooluniverse.tool.NCBI_search_nucleotide`
- `tooluniverse.tool.OMA_get_genome_pair_orthologs`
- `tooluniverse.tool.OMA_get_group`
- `tooluniverse.tool.OMA_get_hog`
- `tooluniverse.tool.OMA_get_orthologs`
- `tooluniverse.tool.OMA_get_protein`
- `tooluniverse.tool.OMA_get_protein_go`
- `tooluniverse.tool.OMA_resolve_xref`
- `tooluniverse.tool.OpenTargets_get_target_homologues_by_ensemblID`
- `tooluniverse.tool.OrthoDB_get_group_details`
- `tooluniverse.tool.OrthoDB_get_group_fasta`
- `tooluniverse.tool.OrthoDB_get_orthologs`
- `tooluniverse.tool.OrthoDB_search_groups`
- `tooluniverse.tool.Sequence_dn_ds`
- `tooluniverse.tool.UniProt_get_function_by_accession`
- `tooluniverse.tool.UniProt_search`
- `tooluniverse.tool.ensembl_get_homology`
- `tooluniverse.tool.ensembl_lookup_gene`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-comparative-genomics/SKILL.md)；Apache-2.0；原文 SHA-256：`d9926c5f28779f9b1b02626361269a13eaf302ba6273c723ab757f39134bcd09`。
