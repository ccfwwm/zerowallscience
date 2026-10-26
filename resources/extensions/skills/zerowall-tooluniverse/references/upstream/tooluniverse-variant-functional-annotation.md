# variant functional annotation

Functional annotation of protein variants — ProtVar structural/functional context, ClinVar clinical classifications, gnomAD population frequencies, CADD deleteriousness, ClinGen gene-disease validity, plus FAVOR one-call comprehensive GRCh38 annotation. Use for variant annotation pipelines, missense effect prediction, and protein-level variant interpretation with functional context.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- LOOK UP, DON'T GUESS
- COMPUTE, DON'T DESCRIBE
- When to Use This Skill
- Pathogenicity Reasoning Framework
- KEY PRINCIPLES
- Evidence Grading
- Workflow Overview
- Phase 0: Variant Notation Normalization
- Phase 1a: One-Call Comprehensive Annotation (FAVOR)
- Phase 1: ProtVar Protein-Level Annotation
- Phase 2: Population Frequency (gnomAD)
- Phase 3: Deleteriousness Scores (CADD)
- Phase 3b: Multi-Source Annotation (OpenCRAVAT)
- Phase 4: Clinical Classification (ClinVar)
- Phase 5: Gene-Disease Validity (ClinGen)
- Synthesis: Integrated Annotation Report
- Fallback Chains
- Limitations

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.CADD_get_variant_score`
- `tooluniverse.tool.ClinGen_search_gene_validity`
- `tooluniverse.tool.ClinVar_get_variant_details`
- `tooluniverse.tool.ClinVar_search_variants`
- `tooluniverse.tool.FAVOR_annotate_variant`
- `tooluniverse.tool.OpenCRAVAT_annotate_variant`
- `tooluniverse.tool.ProtVar_get_function`
- `tooluniverse.tool.ProtVar_get_population`
- `tooluniverse.tool.ProtVar_map_variant`
- `tooluniverse.tool.gnomad_get_variant`
- `tooluniverse.tool.gnomad_search_variants`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-variant-functional-annotation/SKILL.md)；Apache-2.0；原文 SHA-256：`b5a3aca25c01ab5d9c097cc909fab383d411ed4fe5d69a5e016fed2121e0802b`。
