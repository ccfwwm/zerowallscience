# scientific problem selection

Conversational framework for choosing what scientific problem to work on, pitching a new project idea, troubleshooting a stuck project, or making a strategic research decision. Use when users say "I have an idea for a project", "I'm stuck on my research", "what should I work on", "help me evaluate this project's risk", "is this idea worth pursuing", "help me decide between two research directions", "I need strategic advice about my research", or ask to pitch/refine/de-risk a hypothesis before running any experiments or analyses. Grounds the conversation in real literature-precedent and funding-landscape lookups rather than pure opinion.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- When to Use This Skill
- Three Entry Points
- Core Principles
- 1. Problem choice beats execution quality
- 2. Risk is a resource, not a hazard
- 3. Define success before starting
- 4. Fix one thing, float the rest
- 5. Crises are data, not verdicts
- 6. Ground claims in evidence, not confidence
- Workflow by Entry Point
- Pitching an idea
- Strategic question
- Precedent and Fundability Grounding
- Output
- Attribution

推荐发现词：`scientific problem selection`。没有静态命中的工具时，通过实时关键词检索；不能推断工作流已实现。

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-scientific-problem-selection/SKILL.md)；Apache-2.0；原文 SHA-256：`42c06ed9f8288cfe978d3fd901fc05dac5ca89f6542440ccd3688afed69c086e`。
