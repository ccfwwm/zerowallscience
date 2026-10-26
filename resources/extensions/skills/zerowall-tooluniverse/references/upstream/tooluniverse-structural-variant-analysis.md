# structural variant analysis

Structural variant (SV) clinical interpretation: deletions, duplications, inversions, translocations, complex rearrangements. Applies ACMG-adapted criteria with ClinGen HI/TS dosage scores, gnomAD frequencies, and ClinVar evidence. Produces 5-tier classification with explicit per-criterion evidence. Use for clinical genomics SV review, dosage-sensitivity assessment, breakpoint analysis, and CNV pathogenicity calls. Gene-dosage-driven reasoning.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- COMPUTE, DON'T DESCRIBE
- Triggers
- SV Pathogenicity Reasoning (Start Here)
- Workflow Overview
- Phase 1: SV Identity & Classification
- Phase 2: Gene Content Analysis
- Phase 3: Dosage Sensitivity Assessment
- Phase 4: Population Frequency Context
- Phase 5: Pathogenicity Scoring
- Phase 6: Literature & Clinical Evidence
- Phase 7: ACMG-Adapted Classification
- Output
- When NOT to Use This Skill

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.ClinGen_search_dosage_sensitivity`
- `tooluniverse.tool.ClinGen_search_gene_validity`
- `tooluniverse.tool.ClinVar_search_variants`
- `tooluniverse.tool.DisGeNET_search_gene`
- `tooluniverse.tool.EuropePMC_search_articles`
- `tooluniverse.tool.GO_get_term_details`
- `tooluniverse.tool.NCBIGene_search`
- `tooluniverse.tool.OMIM_get_entry`
- `tooluniverse.tool.OMIM_search`
- `tooluniverse.tool.PubMed_search_articles`
- `tooluniverse.tool.ensembl_lookup_gene`
- `tooluniverse.tool.gnomad_search_variants`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-structural-variant-analysis/SKILL.md)；Apache-2.0；原文 SHA-256：`fc4012c93fd3ea5b386552744328a8e5ab741786c8f870c448536cca1027e36c`。
