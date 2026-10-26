# immune repertoire analysis

TCR/BCR repertoire analysis — V(D)J segment usage, CDR3 sequence diversity, clonality scoring, antigen specificity matching to IEDB, public-clone identification. Use for adaptive immune response characterization, post-treatment immune monitoring, antigen-specific clone tracking, and clonal-expansion analysis in immunotherapy or vaccination studies.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Domain Reasoning
- LOOK UP DON'T GUESS
- Overview
- Core Workflow
- Phase 1: Data Import & Clonotype Definition
- Phase 2: Diversity & Clonality Analysis
- Phase 3: V(D)J Gene Usage Analysis
- Phase 4: CDR3 Sequence Analysis
- Phase 5: Clonal Expansion Detection
- Phase 6: Convergence & Public Clonotypes
- Phase 7: Epitope Prediction & Specificity
- Phase 8: Integration with Single-Cell Data
- ToolUniverse Tool Integration
- Reasoning Framework for Result Interpretation
- Evidence Grading
- Interpretation Guidance
- Synthesis Questions
- See Also

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.BVBRC_search_epitopes`
- `tooluniverse.tool.ImmPort_search_studies`
- `tooluniverse.tool.NCBI_SRA_search_runs`
- `tooluniverse.tool.PubMed_search_articles`
- `tooluniverse.tool.UniProt_get_entry_by_accession`
- `tooluniverse.tool.VDJDB_get_antigen_specificity`
- `tooluniverse.tool.VDJDB_get_database_summary`
- `tooluniverse.tool.VDJDB_search_cdr3`
- `tooluniverse.tool.iedb_get_epitope_antigens`
- `tooluniverse.tool.iedb_get_epitope_mhc`
- `tooluniverse.tool.iedb_search_bcell`
- `tooluniverse.tool.iedb_search_epitopes`
- `tooluniverse.tool.iedb_search_tcell_assays`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-immune-repertoire-analysis/SKILL.md)；Apache-2.0；原文 SHA-256：`5e21328a9069c5434f7b6b04cf70668d7facddcb9fc8621a5da8f6cd5d082577`。
