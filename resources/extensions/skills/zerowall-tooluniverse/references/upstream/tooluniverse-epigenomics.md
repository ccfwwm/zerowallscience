# epigenomics

Genomics and epigenomics analysis: DNA methylation (CpG, 5mC, 5hmC, bisulfite, RRBS), m6A RNA modification (MeRIP-seq), ChIP-seq peaks, ATAC-seq accessibility, histone modifications, chromatin state, multi-omics integration. Combines pandas/scipy/pysam computation with ToolUniverse annotation tools. Use for genome-wide epigenomic statistics, methylation analysis, and chromatin-genome integration.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- ⚠️ TOP-OF-MIND RULE: long-format methylation CSV — count ROWS, not unique positions
- RULE ZERO — Check for pre-computed results FIRST
- LOOK UP, DON'T GUESS
- When to Use
- Key Principles
- PRIMARY SCRIPT — methylation_density.py (use FIRST for CpG-density questions)
- Distinguish "rows" vs "unique sites" — methylation CSVs are usually long-format
- Workflow
- Phase 0: Question Parsing
- Phase 1: Methylation Processing
- Phase 2: ChIP-seq Peak Analysis
- Phase 3: ATAC-seq
- Phase 4: Multi-Omics Integration
- Phase 5: Clinical Data
- Phase 6: ToolUniverse Annotation
- Phase 7: Genome-Wide Statistics
- Common Patterns
- GTEx Tissue IDs
- Evidence Grading
- Limitations

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.ENCODE_search_histone_experiments`
- `tooluniverse.tool.ENCODE_search_rnaseq_experiments`
- `tooluniverse.tool.EWASAtlas_get_probe`
- `tooluniverse.tool.EWASAtlas_get_publication`
- `tooluniverse.tool.EWASAtlas_get_study`
- `tooluniverse.tool.EWASAtlas_search_by_gene`
- `tooluniverse.tool.EWASAtlas_search_by_region`
- `tooluniverse.tool.EWASCatalog_search_by_cpg`
- `tooluniverse.tool.EWASCatalog_search_by_gene`
- `tooluniverse.tool.GEO_search_atacseq_datasets`
- `tooluniverse.tool.GEO_search_rnaseq_datasets`
- `tooluniverse.tool.GTEx_get_median_gene_expression`
- `tooluniverse.tool.GTEx_query_eqtl`
- `tooluniverse.tool.SCREEN_get_regulatory_elements`
- `tooluniverse.tool.SRA_search_experiments`
- `tooluniverse.tool.ensembl_get_regulatory_features`
- `tooluniverse.tool.ensembl_lookup_gene`
- `tooluniverse.tool.read_executed_notebook`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-epigenomics/SKILL.md)；Apache-2.0；原文 SHA-256：`bd1528681342292db6b9c2f61b64c1000f37d9de977758270121423ceb6f5f70`。
