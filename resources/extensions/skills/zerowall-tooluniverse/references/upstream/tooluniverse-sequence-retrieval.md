# sequence retrieval

Retrieve DNA/RNA/protein sequences from NCBI and ENA with disambiguation. Quality hierarchy: RefSeq (NM_/NP_) > RefSeq predicted (XM_/XP_) > GenBank submissions. Use for fetching specific sequences by accession, gene-symbol-to-sequence lookup, transcript-isoform retrieval, and curated-vs-raw-submission preference.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Domain Reasoning
- Workflow
- Phase 0: Clarification (When Needed)
- Phase 1: Gene/Organism Disambiguation
- Accession Type Decision Tree
- Identity Checklist
- Phase 2: Data Retrieval (Internal)
- Fallback Chains
- Phase 3: Report Sequence Profile
- Curation Level Tiers
- Reasoning Framework
- Synthesis Questions
- Error Handling
- Sequence Archive and Clustering (UniParc, UniRef)
- Subcellular Location Vocabulary (UniProt Locations)
- Sample Metadata (EBI BioSamples)
- Organism Taxonomy (EBI Taxonomy)
- Cross-Domain Quick Lookup (BioThings Gateway)
- Cross-Database ID Resolution (Bioregistry, Identifiers.org, TogoID)
- EBI dbfetch (One Interface, Many Databases)

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.BioSamples_get_facets`
- `tooluniverse.tool.BioSamples_get_relationships`
- `tooluniverse.tool.BioSamples_get_sample`
- `tooluniverse.tool.BioSamples_search`
- `tooluniverse.tool.BioSamples_search_by_filter`
- `tooluniverse.tool.BioThings_get_entity`
- `tooluniverse.tool.BioThings_get_metadata`
- `tooluniverse.tool.BioThings_list_apis`
- `tooluniverse.tool.BioThings_query`
- `tooluniverse.tool.Bioregistry_resolve_reference`
- `tooluniverse.tool.EBITaxonomy_get_by_id`
- `tooluniverse.tool.IdentifiersOrg_resolve`
- `tooluniverse.tool.NCBI_fetch_accessions`
- `tooluniverse.tool.NCBI_get_sequence`
- `tooluniverse.tool.NCBI_search_nucleotide`
- `tooluniverse.tool.TogoID_convert`
- `tooluniverse.tool.UniParc_get_entry`
- `tooluniverse.tool.UniParc_search`
- `tooluniverse.tool.UniProtLocations_get_location`
- `tooluniverse.tool.UniProtLocations_search`
- `tooluniverse.tool.UniProtRef_get_proteome`
- `tooluniverse.tool.UniProtRef_search_proteomes`
- `tooluniverse.tool.UniProt_search_proteomes`
- `tooluniverse.tool.UniRef_get_cluster`
- `tooluniverse.tool.UniRef_search_clusters`
- `tooluniverse.tool.dbfetch_fetch_batch`
- `tooluniverse.tool.dbfetch_fetch_entry`
- `tooluniverse.tool.dbfetch_list_databases`
- `tooluniverse.tool.dbfetch_list_formats`
- `tooluniverse.tool.ena_get_entry`
- `tooluniverse.tool.ena_get_entry_summary`
- `tooluniverse.tool.ena_get_sequence_fasta`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-sequence-retrieval/SKILL.md)；Apache-2.0；原文 SHA-256：`bfb293a610ae1df8630a266408a4b15beb1cac2166c0107a84bead4526721035`。
