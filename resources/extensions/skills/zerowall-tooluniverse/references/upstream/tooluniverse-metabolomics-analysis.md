# metabolomics analysis

Analyze metabolomics data end-to-end — metabolite identification, quantification (TIC normalization, batch correction), differential analysis, and pathway interpretation. Use for processing mass-spec metabolomics output, normalization choice, untargeted metabolomics workflows, and integrating with other omics layers.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Domain Reasoning
- LOOK UP DON'T GUESS
- When to Use This Skill
- Core Capabilities
- Workflow Overview
- Phase Summaries
- Phase 1: Data Import & Identification
- Phase 2: Quality Control
- Phase 3: Normalization
- Phase 4: Exploratory Analysis
- Phase 5: Differential Analysis
- Phase 6: Pathway Analysis
- Phase 7: Multi-Omics Integration
- Phase 8: Report
- Integration with ToolUniverse
- Quantified Minimums
- Limitations

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.GNPS_compare_spectra`
- `tooluniverse.tool.GNPS_get_library_record`
- `tooluniverse.tool.GNPS_get_spectrum`
- `tooluniverse.tool.GNPS_npclassifier_from_smiles`
- `tooluniverse.tool.MassBank_get_record_by_accession`
- `tooluniverse.tool.MassBank_search_by_compound`
- `tooluniverse.tool.MassBank_search_by_formula`
- `tooluniverse.tool.MassBank_search_records_advanced`
- `tooluniverse.tool.MassBank_spectral_similarity_search`
- `tooluniverse.tool.Metabolite_get_diseases`
- `tooluniverse.tool.Metabolite_get_info`
- `tooluniverse.tool.Metabolite_search`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-metabolomics-analysis/SKILL.md)；Apache-2.0；原文 SHA-256：`413fd060eb11af9f9e3cc5306b49b87813614ace1b91e41c0ce47bfa4e61eea5`。
