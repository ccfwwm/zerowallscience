# cancer classification

Translate free-text tumor descriptions to OncoTree codes and resolve cancer subtypes/tissue hierarchy. Cross-references UMLS/NCI vocabularies. Use for standardizing cancer-type nomenclature in EHR free-text, building cohorts in OncoKB or GDC, mapping tumor-board notes to ontology codes, and ensuring consistent terminology across cancer-genomics pipelines.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- When to Use
- Key Tools
- Workflow
- Phase 1: Cancer Type Discovery
- Phase 2: Code Validation and Detail Retrieval
- Phase 3: Tissue-Level Exploration
- Phase 4: Downstream Use in Variant Annotation
- Common OncoTree Codes (verified working)
- Common Patterns
- Tumor Classification Reasoning (CRITICAL)
- Histological vs Molecular Classification
- Biomarker Interpretation Strategy
- Staging vs Grading -- Different Concepts
- Actionability Assessment
- Reasoning Framework for Result Interpretation
- Evidence Grading
- Interpretation Guidance
- Synthesis Questions
- Fallback Chains

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.GDC_get_mutation_frequency`
- `tooluniverse.tool.OncoKB_annotate_variant`
- `tooluniverse.tool.OncoTree_get_type`
- `tooluniverse.tool.OncoTree_list_tissues`
- `tooluniverse.tool.OncoTree_search`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-cancer-classification/SKILL.md)；Apache-2.0；原文 SHA-256：`4de3ed2cfa1774aa48b9de9ea1da49024515e1d2a0cffe48dffa436b217488ab`。
