# ecology biodiversity

Ecology, biodiversity, and conservation biology research — species identification (GBIF, NCBI Taxonomy), invasive species impact, ecosystem dynamics, conservation status (IUCN), niche ecology. Use for biodiversity questions, species comparison, invasion biology, conservation prioritization, and ecology-related literature search.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Reasoning Strategy
- 1. Species & Taxonomy Questions
- 2. Invasive Species Impact Assessment
- 3. Pollinator Ecology
- 4. Population Dynamics
- 5. Community Ecology & Food Webs
- 6. Evolutionary Ecology
- Available Tools
- Navigating the GBIF taxonomic tree
- Additional Taxonomy & Biodiversity Sources
- LOOK UP DON'T GUESS
- COMPUTE, DON'T DESCRIBE

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.BOLDSystems_search_by_taxon`
- `tooluniverse.tool.CoL_get_children`
- `tooluniverse.tool.CoL_get_taxon`
- `tooluniverse.tool.CoL_search_species`
- `tooluniverse.tool.EOL_get_collection`
- `tooluniverse.tool.EOL_get_hierarchy_entry`
- `tooluniverse.tool.EOL_get_page`
- `tooluniverse.tool.EOL_search_species`
- `tooluniverse.tool.EuropePMC_search_articles`
- `tooluniverse.tool.GBIF_get_taxon_children`
- `tooluniverse.tool.GBIF_get_taxon_parents`
- `tooluniverse.tool.GBIF_get_taxon_synonyms`
- `tooluniverse.tool.GBIF_get_vernacular_names`
- `tooluniverse.tool.GBIF_match_name`
- `tooluniverse.tool.GBIF_parse_name`
- `tooluniverse.tool.GBIF_search_occurrences`
- `tooluniverse.tool.GBIF_search_species`
- `tooluniverse.tool.ITIS_get_full_record`
- `tooluniverse.tool.ITIS_get_hierarchy`
- `tooluniverse.tool.ITIS_search_by_scientific_name`
- `tooluniverse.tool.IUCN_API_KEY`
- `tooluniverse.tool.IUCN_get_conservation_status`
- `tooluniverse.tool.MarineRegions_get_record`
- `tooluniverse.tool.MarineRegions_search_by_name`
- `tooluniverse.tool.NCBIDatasets_get_taxonomy`
- `tooluniverse.tool.OBIS_search_occurrences`
- `tooluniverse.tool.OBIS_search_taxa`
- `tooluniverse.tool.OpenTree_get_induced_subtree`
- `tooluniverse.tool.OpenTree_get_mrca`
- `tooluniverse.tool.OpenTree_get_taxon`
- `tooluniverse.tool.OpenTree_match_names`
- `tooluniverse.tool.PubMed_search_articles`
- `tooluniverse.tool.WoRMS_search_species`
- `tooluniverse.tool.eBird_get_taxon_groups`
- `tooluniverse.tool.eBird_get_taxonomy`
- `tooluniverse.tool.ensembl_get_taxonomy`
- `tooluniverse.tool.iDigBio_get_record`
- `tooluniverse.tool.iDigBio_search_records`
- `tooluniverse.tool.iNaturalist_search_taxa`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-ecology-biodiversity/SKILL.md)；Apache-2.0；原文 SHA-256：`afdbcf489f8bcf5a4296fa52fa4f5196476e9b4702ff1d0c321a650537b74380`。
