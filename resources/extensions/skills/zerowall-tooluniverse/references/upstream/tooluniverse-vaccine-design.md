# vaccine design

Computational vaccine candidate design: peptide/subunit vaccines via MHC-I/MHC-II epitope prediction (IEDB), population HLA coverage optimization, B-cell epitope identification, and cross-strain conservation analysis. Use for vaccine epitope prediction, HLA allele coverage, multi-epitope construct design, and immunogenicity assessment. Combines predicted MHC binding with experimentally validated IEDB epitopes for higher-confidence designs.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Reasoning Strategy
- When to Use
- Core Tools
- Workflow
- Phase 0: Antigen Selection
- Phase 1: T-Cell Epitope Prediction
- Phase 2: B-Cell Epitope Prediction
- Phase 3: Population Coverage
- Phase 4: Conservation Analysis
- Phase 5: Candidate Assembly & Report
- Limitations

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.BVBRC_search_genome_features`
- `tooluniverse.tool.EnsemblVEP_annotate_hgvs`
- `tooluniverse.tool.IEDB_predict_bcell_epitopes`
- `tooluniverse.tool.IEDB_predict_mhci_binding`
- `tooluniverse.tool.IEDB_predict_mhcii_binding`
- `tooluniverse.tool.PubMed_search_articles`
- `tooluniverse.tool.UniProt_get_entry_by_accession`
- `tooluniverse.tool.UniProt_search`
- `tooluniverse.tool.alphafold_get_prediction`
- `tooluniverse.tool.iedb_get_epitope_mhc`
- `tooluniverse.tool.iedb_search_epitopes`
- `tooluniverse.tool.iedb_search_mhc`
- `tooluniverse.tool.search_clinical_trials`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-vaccine-design/SKILL.md)；Apache-2.0；原文 SHA-256：`ebd9ab4bb66cf46160b5998c03df8f96bf1c5ec60c1ecd662cf56da474fb71d6`。
