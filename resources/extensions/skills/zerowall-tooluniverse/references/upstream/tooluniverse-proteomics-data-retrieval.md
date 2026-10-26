# proteomics data retrieval

Find and retrieve proteomics datasets from MassIVE, ProteomeXchange, PRIDE Archive, and the NCI Proteomics Data Commons (PDC). Search by species, keyword, accession, or protein; retrieve detailed metadata (instruments, publications, species, PTMs studied), real file-download URLs (PRIDE), or quantitative abundance matrices with clinical linkage (PDC/CPTAC). Use for locating public proteomics datasets to reanalyze, comparing instrument/protocol coverage across studies, pre-download dataset evaluation, and finding every dataset that identified a specific protein.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- When to Use This Skill
- COMPUTE, DON'T DESCRIBE
- KEY PRINCIPLES
- Domain Reasoning: Dataset Quality Assessment
- Core Repositories Integrated
- PeptideAtlas: Peptide-Level Observation Evidence
- Cancer Proteomics via PDC
- PRIDE Archive: Full-Text Search, File Downloads, and Reverse Protein Lookup
- Workflow Overview
- Phase 0: Input Resolution
- Decision Logic
- Phase 1: Repository Search
- Tools
- Workflow
- Response Format Notes
- Phase 2: Dataset Detail Retrieval
- Tools
- Workflow
- Key Fields to Extract
- Phase 3: Result Synthesis
- Report Format
- Fallback Strategies
- Common Species Taxonomy IDs
- Interpretation Framework

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.Dataverse_get_dataset`
- `tooluniverse.tool.MassIVE_get_dataset`
- `tooluniverse.tool.MassIVE_search_datasets`
- `tooluniverse.tool.PDC_get_clinical_data`
- `tooluniverse.tool.PDC_get_gene_protein`
- `tooluniverse.tool.PDC_get_quant_data_matrix`
- `tooluniverse.tool.PDC_get_study_summary`
- `tooluniverse.tool.PDC_list_programs`
- `tooluniverse.tool.PDC_search_studies`
- `tooluniverse.tool.PRIDE_get_project`
- `tooluniverse.tool.PRIDE_get_project_files`
- `tooluniverse.tool.PRIDE_get_projects_for_protein`
- `tooluniverse.tool.PRIDE_search_proteomics`
- `tooluniverse.tool.PeptideAtlas_get_observed_peptides`
- `tooluniverse.tool.ProteomeXchange_get_dataset`
- `tooluniverse.tool.ProteomeXchange_search_datasets`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-proteomics-data-retrieval/SKILL.md)；Apache-2.0；原文 SHA-256：`ba2b399ae071d548ef5c748eb1a8d4ee5152c143d4d89612e1f2559bce4c3e33`。
