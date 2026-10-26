# metagenomics analysis

Microbiome and metagenomics analysis using MGnify, GTDB taxonomy, ENA sequencing data, and EuropePMC literature. Covers taxonomic classification, genome quality assessment, biome-clinical phenotype linkage, and pathway interpretation. Use for amplicon/shotgun metagenomics study analysis.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- LOOK UP, DON'T GUESS
- COMPUTE, DON'T DESCRIBE
- Core Databases
- Workflow
- Key Phase Notes
- Edge Cases & Fallbacks
- Limitations

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.ENAPortal_search_studies`
- `tooluniverse.tool.GTDB_get_species`
- `tooluniverse.tool.GTDB_search_genomes`
- `tooluniverse.tool.GTDB_search_taxon`
- `tooluniverse.tool.MGnify_get_genome`
- `tooluniverse.tool.MGnify_search_genomes`
- `tooluniverse.tool.MGnify_search_studies`
- `tooluniverse.tool.kegg_search_pathway`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-metagenomics-analysis/SKILL.md)；Apache-2.0；原文 SHA-256：`e880b7e006f2c0ccd0474bc2e78e0a40a4b997072088f6cdc07b1363b3c227c1`。
