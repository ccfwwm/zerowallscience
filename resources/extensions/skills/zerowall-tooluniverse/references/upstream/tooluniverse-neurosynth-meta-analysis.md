# neurosynth meta analysis

Meta-analytic decoding of human fMRI coordinates using the Neurosynth coordinate database (14,371 studies, ~3,228 cognitive/neuroscience terms) — given an MNI brain coordinate, statistically identify which cognitive terms are over-represented in studies reporting activation there ("reverse inference"); given a term, find the studies and coordinates most associated with it ("forward" lookup). Use when someone asks "what does this brain coordinate/region do", "decode this fMRI activation peak", "what terms are associated with [MNI coordinate]", "find studies about [cognitive term] and their activation coordinates", or "reverse-infer cognitive function from a brain location". This is real local analysis on a downloaded, cached coordinate database — not a live API — following ToolUniverse's honesty-contract pattern (real computed statistics, no fabricated term associations).

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Honesty contract (read first)
- When to Use This Skill
- Workflow
- Decode a coordinate ("what does this location do?")
- Look up a term ("what studies/coordinates are about X?")

推荐发现词：`neurosynth meta analysis`。没有静态命中的工具时，通过实时关键词检索；不能推断工作流已实现。

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-neurosynth-meta-analysis/SKILL.md)；Apache-2.0；原文 SHA-256：`4de753eb655bba83490a335d4ddac36f5d4bff3d0c3879422754614d27e03c22`。
