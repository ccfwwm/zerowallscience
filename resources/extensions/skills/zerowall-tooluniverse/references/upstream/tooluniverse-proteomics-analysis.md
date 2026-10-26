# proteomics analysis

Mass-spec proteomics analysis — protein identification, quantification (LFQ, TMT, iTRAQ), differential expression (tumor vs normal, treatment vs control), PTM identification, and pathway enrichment on protein lists. Use when you have proteomics MS output, asking about protein abundance differences, or doing systems-level proteomic interpretation.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- RULE ZERO — Check for pre-computed results FIRST
- When to Use This Skill
- COMPUTE, DON'T DESCRIBE
- Core Capabilities
- Workflow Overview
- Integration with ToolUniverse
- Normal-Tissue Expression Context (ProteomicsDB)
- Quantified Minimums
- Interpretation Framework
- Starting Point: Experimental Design
- Protein Identification Reasoning
- Post-Translational Modification (PTM) Analysis Reasoning
- Differential Expression Thresholds
- Evidence Grading
- Synthesis Questions
- Limitations

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.OpenTargets_get_target_safety_profile_by_ensemblID`
- `tooluniverse.tool.ProteomicsDB_get_expression_summary`
- `tooluniverse.tool.ProteomicsDB_get_peptides_for_protein`
- `tooluniverse.tool.ProteomicsDB_get_protein_expression`
- `tooluniverse.tool.ProteomicsDB_list_tissues`
- `tooluniverse.tool.ProteomicsDB_search_proteins`
- `tooluniverse.tool.UniProt_search`
- `tooluniverse.tool.proteins_api_search`
- `tooluniverse.tool.read_executed_notebook`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-proteomics-analysis/SKILL.md)；Apache-2.0；原文 SHA-256：`79527d270c07ebf7340a961070c61565653aeb6addf18ab22e716258390be21c`。
