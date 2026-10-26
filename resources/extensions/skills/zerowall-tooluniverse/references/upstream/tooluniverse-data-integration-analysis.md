# data integration analysis

Integrate computed statistical results (DEGs, GWAS hits, associations) with biological context from ToolUniverse databases (UniProt, GO, Reactome, ClinVar, OpenTargets). Use for adding gene function/pathway/disease annotations to a result list, building biological narrative around statistical findings, and going beyond p-values to mechanism.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- COMPUTE, DON'T DESCRIBE
- When to Use This Skill
- Step 1: Statistical Results to Biological Questions
- Step 2: Multi-Database Evidence Integration
- Step 3: Causal Reasoning
- Step 4: Cross-Validation
- Step 5: Actionable Reporting
- Evidence Summary Table
- Strength Assessment
- Knowledge Gaps and Next Steps
- Clinical or Public Health Implications

推荐发现词：`data integration analysis`。没有静态命中的工具时，通过实时关键词检索；不能推断工作流已实现。

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-data-integration-analysis/SKILL.md)；Apache-2.0；原文 SHA-256：`e266056bbe28d8e3c0078f9a4b76f47074acda5335a5c5d78e34b8f868e425fd`。
