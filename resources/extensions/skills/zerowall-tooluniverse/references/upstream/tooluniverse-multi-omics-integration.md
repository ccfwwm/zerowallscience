# multi omics integration

Multi-omics integration — orchestrate per-layer analysis (transcriptomics, proteomics, epigenomics, genomics, metabolomics) then perform cross-omics correlation, multi-omics clustering, and pathway-level integration. Use for integrative systems-biology analysis, multi-modal disease characterization, and cross-omics biomarker discovery.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Domain Reasoning
- LOOK UP DON'T GUESS
- When to Use This Skill
- Workflow Overview
- Supported Data Types
- Core Operations
- Sample Matching
- Cross-Omics Correlation
- Pathway Integration
- Multi-Omics Clustering Methods
- ToolUniverse Skills Coordination
- Use Cases
- Cancer Multi-Omics
- eQTL + Expression + Methylation
- Drug Response Multi-Omics
- Quantified Minimums
- Limitations

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.ReactomeAnalysis_pathway_enrichment`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-multi-omics-integration/SKILL.md)；Apache-2.0；原文 SHA-256：`3cc9143eda6ace285f425558bd4a38e66f8d960a8adbc741175023e840e607f7`。
