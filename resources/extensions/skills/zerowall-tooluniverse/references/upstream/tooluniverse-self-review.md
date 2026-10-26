# self review

Review existing work against the user's actual goal and surface evidence-backed strengths, gaps, risks, and next fixes. Use when asked to eval, evaluate, review, assess, or check current/this/my/our work; decide whether a task is complete; build a definition-of-done checklist or rubric; or perform grading, LLM-as-judge, Qworld, or RET evaluation. Treat plain eval/review requests as qualitative: resolve "current work" from the conversation, artifacts, files, or diff, and never assign numeric scores unless the user explicitly requests scores, grades, points, ratings, weighted criteria, Qworld, or RET. Do not use for implementing automated eval suites, tests, graders, or benchmarks.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Non-Negotiable Rules
- Resolve the Review Target
- Choose One Mode
- Qualitative Review Workflow (Default)
- Default Review Shape
- Checklist and Unscored Rubric Modes
- Scored Evaluation Mode (Explicit Opt-In Only)
- Examples of Correct Routing
- Evidence and Honesty

推荐发现词：`self review`。没有静态命中的工具时，通过实时关键词检索；不能推断工作流已实现。

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-self-review/SKILL.md)；Apache-2.0；原文 SHA-256：`a80f3e3860992bc9ff26acc5ee41702a545db9f6d2668258a48ab6543c96076e`。
