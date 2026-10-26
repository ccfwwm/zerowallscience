# single cell

Single-cell RNA-seq analysis with scanpy/anndata — h5ad data loading, scRNA-seq quality control and QC gating (n_genes_by_counts, total_counts, mitochondrial percent / pct_counts_mt, pct_counts_ribo, doublet detection with Scrublet/scDblFinder, ambient RNA / SoupX awareness, empty-droplet filtering, MAD-based thresholds), normalization, dimensionality reduction (PCA, UMAP, t-SNE), clustering (Leiden, Louvain), marker gene identification, cell-type annotation, pseudotime/trajectory analysis. Use for any scRNA-seq workflow, including deciding which cells to filter, flag, or investigate before downstream analysis.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- RULE ZERO — Check for pre-computed results FIRST
- LOOK UP, DON'T GUESS
- When to Use This Skill
- Core Principles
- Required Packages
- Workflow Decision Tree
- Data Loading
- Quality Control and QC Gating (do this BEFORE downstream analysis)
- Per-cell QC metrics (what to compute)
- WHY each metric flags a problem (reason from biology, not magic numbers)
- Choosing thresholds — distribution-aware (MAD), not hardcoded
- Doublets, ambient RNA, empty droplets (per-cell metrics miss these)
- QC Interpretation Table (metric -> concern -> action)
- Differential Expression Decision Tree
- Batch Correction (Harmony)
- ToolUniverse Integration
- Data Discovery (before analysis)
- Cell Type Markers
- Gene Annotation
- Cell-Cell Communication
- Enrichment (Post-DE)
- Clinical Context (for tumor immunology)
- Scanpy vs Seurat Equivalents
- Reasoning Framework for Result Interpretation

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.CellMarker_list_cell_types`
- `tooluniverse.tool.CellMarker_search_by_cell_type`
- `tooluniverse.tool.CellMarker_search_by_gene`
- `tooluniverse.tool.CellMarker_search_cancer_markers`
- `tooluniverse.tool.CellTypist_get_model`
- `tooluniverse.tool.CellTypist_search_models`
- `tooluniverse.tool.CxGDisc_search_datasets`
- `tooluniverse.tool.DGIdb_get_drug_gene_interactions`
- `tooluniverse.tool.GEO_search_rnaseq_datasets`
- `tooluniverse.tool.GTEx_get_expression_summary`
- `tooluniverse.tool.HPA_search_genes_by_query`
- `tooluniverse.tool.MyGene_batch_query`
- `tooluniverse.tool.MyGene_query_genes`
- `tooluniverse.tool.NCBI_SRA_search_runs`
- `tooluniverse.tool.OmicsDI_search_datasets`
- `tooluniverse.tool.OmniPath_get_complexes`
- `tooluniverse.tool.OmniPath_get_ligand_receptor_interactions`
- `tooluniverse.tool.OmniPath_get_signaling_interactions`
- `tooluniverse.tool.PANTHER_enrichment`
- `tooluniverse.tool.PanglaoDB_cell_types_for_gene`
- `tooluniverse.tool.PanglaoDB_list_cell_types`
- `tooluniverse.tool.PanglaoDB_markers_for_cell_type`
- `tooluniverse.tool.PubMed_search_articles`
- `tooluniverse.tool.ReactomeAnalysis_pathway_enrichment`
- `tooluniverse.tool.SCP_get_study`
- `tooluniverse.tool.SCP_list_studies`
- `tooluniverse.tool.SCP_search_studies`
- `tooluniverse.tool.SCXA_get_cluster_marker_genes`
- `tooluniverse.tool.SCXA_list_experiments`
- `tooluniverse.tool.SCXA_search_gene`
- `tooluniverse.tool.STRING_functional_enrichment`
- `tooluniverse.tool.TIMER2_immune_estimation`
- `tooluniverse.tool.UCSCCellBrowser_get_dataset`
- `tooluniverse.tool.UCSCCellBrowser_list_facets`
- `tooluniverse.tool.UCSCCellBrowser_search_datasets`
- `tooluniverse.tool.UniProt_get_function_by_accession`
- `tooluniverse.tool.civic_search_evidence_items`
- `tooluniverse.tool.ensembl_lookup_gene`
- `tooluniverse.tool.geo_search_datasets`
- `tooluniverse.tool.read_executed_notebook`
- `tooluniverse.tool.run_celltypist_annotate`
- `tooluniverse.tool.run_deseq2_analysis`
- `tooluniverse.tool.search_clinical_trials`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-single-cell/SKILL.md)；Apache-2.0；原文 SHA-256：`f393659f67a066e76f0a9c150b1864cfb5013bef250a3ebe52edce93ce0d5064`。
