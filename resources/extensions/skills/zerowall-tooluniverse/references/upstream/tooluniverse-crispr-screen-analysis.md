# crispr screen analysis

Analyze CRISPR-Cas9 genetic screens — MAGeCK gene-level scores, sgRNA count QC, replicate correlation, hit prioritization, and pathway GSEA on screen output. Use for genome-wide essentiality screens, synthetic-lethality discovery, dropout vs positive-selection screen analysis, target identification, and resistance-screen interpretation. Includes screen-QC and statistical thresholds.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- RULE ZERO — Check for pre-computed results FIRST
- Overview
- Core Workflow
- Phase 1: Data Import & sgRNA Count Processing
- Phase 2: Quality Control & Filtering
- Phase 3: Normalization
- Phase 4: Gene-Level Scoring
- Phase 5: Synthetic Lethality Detection
- Phase 6: Pathway Enrichment Analysis
- Phase 7: Drug Target Prioritization
- Phase 8: Report Generation
- ToolUniverse Tool Integration
- Domain Reasoning: Hits Are Statistical, Not Biological
- Interpretation Framework
- Analysis conventions
- Replicate Spearman correlation — match the paper's aggregation level
- Reactome GSEA ranking column
- Pathway naming
- See Also

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.COSMIC_get_mutations_by_gene`
- `tooluniverse.tool.ChEMBL_search_targets`
- `tooluniverse.tool.ClinVar_search_variants`
- `tooluniverse.tool.DGIdb_get_drug_gene_interactions`
- `tooluniverse.tool.DGIdb_get_gene_druggability`
- `tooluniverse.tool.GEO_search_rnaseq_datasets`
- `tooluniverse.tool.PubMed_search_articles`
- `tooluniverse.tool.ReactomeAnalysis_pathway_enrichment`
- `tooluniverse.tool.STRING_get_network`
- `tooluniverse.tool.UniProt_get_function_by_accession`
- `tooluniverse.tool.cBioPortal_get_mutations`
- `tooluniverse.tool.civic_search_evidence_items`
- `tooluniverse.tool.enrichr_gene_enrichment_analysis`
- `tooluniverse.tool.geo_search_datasets`
- `tooluniverse.tool.gnomad_get_gene_constraints`
- `tooluniverse.tool.kegg_get_pathway_info`
- `tooluniverse.tool.kegg_search_pathway`
- `tooluniverse.tool.read_executed_notebook`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-crispr-screen-analysis/SKILL.md)；Apache-2.0；原文 SHA-256：`c3bbb208367f8c9fddd13f4784a9e485f93ddd3f380157bce071a8981b9cdc9c`。
