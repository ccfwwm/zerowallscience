# spatial transcriptomics

Spatial transcriptomics analysis — Visium, MERFISH, seqFISH, Slide-seq. Maps gene expression to tissue architecture, identifies spatially variable genes (SVGs), tissue-domain segmentation, and cell-cell interaction inference. Use for spatial gene-expression questions, tissue architecture analysis, and SVG identification.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- LOOK UP, DON'T GUESS
- When to Use This Skill
- Core Capabilities
- Supported Platforms
- Workflow Overview
- Phase Summaries
- Phase 1: Data Import & QC
- Phase 2: Preprocessing
- Phase 3: Spatial Clustering
- Phase 4: Spatially Variable Genes
- Phase 5: Neighborhood Analysis
- Phase 6: scRNA-seq Integration
- Phase 7: Spatial Cell Communication
- Phase 7.5: Data Discovery & Gene Context (ToolUniverse API tools)
- Phase 8: Report Generation
- Integration with ToolUniverse Skills
- ToolUniverse Data Retrieval Tools
- HuBMAP Spatial Atlas Tools
- HuBMAP biospecimen + spatial-registration layer (Samples & Donors)
- Example Use Cases
- Use Case 1: Tumor Microenvironment Mapping
- Use Case 2: Developmental Gradient Analysis
- Use Case 3: Brain Region Identification
- Quantified Minimums

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.CELLxGENE_get_cell_metadata`
- `tooluniverse.tool.DGIdb_get_drug_gene_interactions`
- `tooluniverse.tool.DeepSpotM_predict_gene_expression`
- `tooluniverse.tool.HuBMAP_get_dataset`
- `tooluniverse.tool.HuBMAP_get_sample`
- `tooluniverse.tool.HuBMAP_list_organs`
- `tooluniverse.tool.HuBMAP_search_datasets`
- `tooluniverse.tool.HuBMAP_search_donors`
- `tooluniverse.tool.HuBMAP_search_samples`
- `tooluniverse.tool.NCBI_SRA_search_runs`
- `tooluniverse.tool.OmicsDI_search_datasets`
- `tooluniverse.tool.OmniPath_get_cell_communication_annotations`
- `tooluniverse.tool.OmniPath_get_intercell_roles`
- `tooluniverse.tool.OmniPath_get_ligand_receptor_interactions`
- `tooluniverse.tool.OmniPath_get_signaling_interactions`
- `tooluniverse.tool.PubMed_search_articles`
- `tooluniverse.tool.STRING_get_network`
- `tooluniverse.tool.UniProt_get_function_by_accession`
- `tooluniverse.tool.geo_search_datasets`
- `tooluniverse.tool.kegg_get_pathway_info`
- `tooluniverse.tool.kegg_search_pathway`
- `tooluniverse.tool.list_tools`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-spatial-transcriptomics/SKILL.md)；Apache-2.0；原文 SHA-256：`32d567377fabd25bb719322c1a08908e89b5bcc8a53de1ed20013ac61fdd1a27`。
