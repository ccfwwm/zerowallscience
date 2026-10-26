# data wrangling

Universal data access patterns for downloading and parsing scientific data when ToolUniverse tools don't cover the source, only return metadata, or you need bulk records. Use for VCF/h5ad/BAM/SDF/GCT parsing, multi-step API workflows (search to filter to download to parse), thousands of records at once, or sources with no dedicated tool. Write Python code via Bash for every step.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- When to Use
- Decision: Tool vs Code
- Section A: Format Cookbook
- Tabular
- Genomics
- Structural
- Omics Matrices
- Mass Spectrometry & Flow Cytometry
- Neuroimaging
- Phylogenetics & Systems Biology
- Serialized
- Compressed
- Section B: API Patterns by Domain
- 1. NCBI E-utilities (Gene, Nucleotide, Protein, SRA, GEO)
- 2. EBI APIs (UniProt, PDBe, ChEMBL, Ensembl, InterPro)
- 3. NCI GDC (TCGA/TARGET Cancer Data)
- 4. CDC Health Surveys (NHANES, BRFSS, WONDER)
- 5. GWAS & Genetics (GWAS Catalog, gnomAD, ClinVar)
- 6. Chemical (PubChem, ChEMBL, KEGG)
- 7. Expression (GEO, ArrayExpress, GTEx)
- 8. Clinical (ClinicalTrials.gov, FDA/OpenFDA, FAERS)
- 9. Literature (PubMed, PMC, EuropePMC)
- 10. Data Repositories (Zenodo, Figshare, Dryad, DataCite)
- 11-24. Specialized Domains

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.DataCite_search_dois`
- `tooluniverse.tool.Dryad_search_datasets`
- `tooluniverse.tool.EuropePMC_search_articles`
- `tooluniverse.tool.GDC_get_clinical_data`
- `tooluniverse.tool.GDC_list_files`
- `tooluniverse.tool.GDC_search_cases`
- `tooluniverse.tool.NCBIGene_search`
- `tooluniverse.tool.NCBI_search_nucleotide`
- `tooluniverse.tool.NHANES_download_and_parse`
- `tooluniverse.tool.PubMed_search_articles`
- `tooluniverse.tool.SRA_search_experiments`
- `tooluniverse.tool.UniProt_search`
- `tooluniverse.tool.Zenodo_search_records`
- `tooluniverse.tool.arrayexpress_search_experiments`
- `tooluniverse.tool.cdc_data_search_datasets`
- `tooluniverse.tool.execute_tool`
- `tooluniverse.tool.geo_search_datasets`
- `tooluniverse.tool.gwas_search_associations`
- `tooluniverse.tool.search_clinical_trials`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-data-wrangling/SKILL.md)；Apache-2.0；原文 SHA-256：`09181d900dff2b93540eae754aa7155759329f860ae998d43b7e7001b0872b90`。
