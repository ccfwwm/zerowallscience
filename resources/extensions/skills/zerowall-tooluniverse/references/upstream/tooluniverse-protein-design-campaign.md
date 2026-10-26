# protein design campaign

Run and review iterative protein binder design campaigns with multiple model families, structural and glycan checks, conditional pH hypotheses, resource-aware computation, and competition submission preparation. Use for ongoing candidate optimization or interpreting conflicting design evidence; not for simple structure retrieval or measured assay analysis.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Establish the current decision
- Choose the next informative computation
- Separate evidence dimensions
- Maintain recoverable evidence
- Prepare a reviewed submission
- Completion criteria

推荐发现词：`protein design campaign`。没有静态命中的工具时，通过实时关键词检索；不能推断工作流已实现。

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-protein-design-campaign/SKILL.md)；Apache-2.0；原文 SHA-256：`3c89e7fe4b979c90517a30524d1a83b5314f01a80dd84a02b062d3bbddc06509`。
