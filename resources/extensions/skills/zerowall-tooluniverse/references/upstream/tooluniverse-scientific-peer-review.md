# scientific peer review

Review scientific manuscripts, abstracts, methods, statistical analyses, results, discussions, protocols, and experimental designs using calibrated rubrics and prioritized revision advice. Use for journal-style peer review, study-design scoring, methodology or statistics critique, novelty and literature-context assessment, interpretation checks, scientific writing review, reproducibility review, ethics screening, protocol optimization, or a combined manuscript review. This is the host-agent replacement for the corresponding ToolUniverse AgenticTool reviewers and does not require a ToolUniverse backend LLM API.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Workflow
- Trust Boundary
- Scope and Evidence Boundary
- Review Method
- Long or Multi-Part Manuscripts
- Output
- Quality Checks

推荐发现词：`scientific peer review`。没有静态命中的工具时，通过实时关键词检索；不能推断工作流已实现。

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-scientific-peer-review/SKILL.md)；Apache-2.0；原文 SHA-256：`015fa060924216039c911f64dcd018b042d914cf655ebae6ebefe64fd1b82174`。
