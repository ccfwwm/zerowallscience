# hla immunogenomics

HLA gene-family analysis and MHC-peptide binding for transplant compatibility, vaccine epitope coverage, and cancer immunotherapy. Uses IMGT (HLA polymorphism), IEDB (epitope-MHC binding), UniProt (annotation), DGIdb (druggability). Use for HLA typing/imputation review, vaccine HLA coverage, and immunotherapy prediction biomarkers (HLA-LOH, neoantigen presentation).

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Reasoning Strategy
- COMPUTE, DON'T DESCRIBE
- When to Use
- Core Databases
- Workflow Overview
- Phase Details
- Phase 0: Query Parsing & HLA Disambiguation
- Phase 1: HLA Gene Lookup
- Phase 2: MHC Binding & Restriction
- Phase 3: Epitope-MHC Associations
- Phase 4: Functional Annotation
- Phase 5: Clinical & Therapeutic Context
- Phase 6: Report Synthesis
- Edge Cases & Fallbacks
- Limitations

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.BVBRC_search_epitopes`
- `tooluniverse.tool.DGIdb_get_drug_gene_interactions`
- `tooluniverse.tool.HLALigandAtlas_get_benign_peptides`
- `tooluniverse.tool.HLALigandAtlas_get_donors`
- `tooluniverse.tool.IMGT_get_gene_info`
- `tooluniverse.tool.IMGT_search_genes`
- `tooluniverse.tool.IPD_get_hla_allele`
- `tooluniverse.tool.IPD_search_cells`
- `tooluniverse.tool.IPD_search_hla_alleles`
- `tooluniverse.tool.MHCMotifAtlas_get_allele_ligands`
- `tooluniverse.tool.PubMed_search_articles`
- `tooluniverse.tool.UniProt_search`
- `tooluniverse.tool.iedb_get_epitope_mhc`
- `tooluniverse.tool.iedb_search_epitopes`
- `tooluniverse.tool.iedb_search_mhc`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-hla-immunogenomics/SKILL.md)；Apache-2.0；原文 SHA-256：`9272e805c454c4c53a6070463867eae8cc196a55643d36b907c5fe19941aaa52`。
