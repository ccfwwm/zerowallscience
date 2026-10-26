# synthetic biology parts

Look up synthetic biology genetic parts (promoters, RBS, CDS/genes, terminators, reporters, composite devices) from the SynBioHub repository, including the iGEM Registry of Standard Biological Parts. Use when someone asks to "find a genetic part", "look up a BioBrick", "search SynBioHub", "get the sequence for BBa_...", "browse iGEM part collections", "find a promoter/RBS/terminator for a genetic circuit", or "what parts are available for [organism/function]". NOT for plasmid backbone/vector lookup by catalog ID (use tooluniverse-molecular-cloning's Addgene coverage), NOT for primer design once a part sequence is chosen (use tooluniverse-primer-design). Honest: SynBioHub disabled anonymous public REST access upstream — every unauthenticated call currently returns 401/HTML-login-page, verified live. This skill explains that limitation plainly and how to unlock real access (SYNBIOHUB_API_TOKEN) rather than pretending the tools work with no setup.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Honesty contract (read first) — verify auth status before promising results
- When to Use This Skill
- Workflow
- 1. Browse available collections (optional starting point)
- 2. Search for a part by keyword
- 3. Get full detail for one part
- Downstream Handoff

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.ADDGENE_API_KEY`
- `tooluniverse.tool.Addgene_get_plasmid`
- `tooluniverse.tool.Addgene_search_depositors`
- `tooluniverse.tool.Addgene_search_plasmids`
- `tooluniverse.tool.SynBioHub_get_collections`
- `tooluniverse.tool.SynBioHub_get_part`
- `tooluniverse.tool.SynBioHub_search_parts`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-synthetic-biology-parts/SKILL.md)；Apache-2.0；原文 SHA-256：`f9c3494411adbf0b927076a15920c69960cd6a79ce64be14d8df161b761b35ac`。
