# nih funding landscape

Analyze NIH grant portfolios and funding history using the OpenNIH FY1985-present corpus, then connect grants to investigators, institutions, publications, clinical trials, patents, targets, or drugs with ToolUniverse. Use for NIH grant discovery, topic or Institute/Center trends, PI and institution profiles, activity-code or mechanism analysis, funding growth and concentration, grant-writing landscape research, SBIR/STTR landscapes, research-policy analysis, expert discovery, funding-to-output translational impact studies, or public-facing NIH explainers for patients, advocates, local and national journalists, trainees, applicants, institutions, entrepreneurs, and taxpayers.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Public Value Routing
- Required Workflow
- Phase 0 — Scope and source state
- Phase 1 — Resolve before analyzing
- Phase 2 — Validate the evidence surface
- Phase 3 — Synthesize and link
- Endpoint-Specific Interpretation
- Analysis Rules
- Quantified Completeness
- Cross-Source Linking
- Output
- Quality Check

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.NIHReporter_get_project`
- `tooluniverse.tool.NIHReporter_search_projects`
- `tooluniverse.tool.ORCID_get_profile`
- `tooluniverse.tool.ORCID_search_researchers`
- `tooluniverse.tool.OpenNIH_activity_code_distribution`
- `tooluniverse.tool.OpenNIH_fetch`
- `tooluniverse.tool.OpenNIH_funding_trend`
- `tooluniverse.tool.OpenNIH_get_pi_profile`
- `tooluniverse.tool.OpenNIH_ic_topic_cross`
- `tooluniverse.tool.OpenNIH_institution_concentration`
- `tooluniverse.tool.OpenNIH_rank_institutions`
- `tooluniverse.tool.OpenNIH_search`
- `tooluniverse.tool.OpenNIH_search_grants`
- `tooluniverse.tool.OpenNIH_source_status`
- `tooluniverse.tool.OpenNIH_topic_trend`
- `tooluniverse.tool.ROR_get_organization`
- `tooluniverse.tool.ROR_match_affiliation`
- `tooluniverse.tool.ROR_search_organizations`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-nih-funding-landscape/SKILL.md)；Apache-2.0；原文 SHA-256：`d3a36b1bac520f6687a45de08345ff6382a954b38eeef814c6f7ca74fb1cc630`。
