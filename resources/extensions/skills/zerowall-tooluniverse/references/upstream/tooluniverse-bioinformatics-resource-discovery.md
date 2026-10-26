# bioinformatics resource discovery

Discover which bioinformatics software tool, biomedical REST API, R/Bioconductor package, CRAN package, or training material exists for a task, before writing analysis code or building a pipeline. Covers ELIXIR bio.tools (30,000+ software tools/databases by keyword, EDAM topic, or EDAM operation), SmartAPI (biomedical API registry, incl. NCATS Translator components), ELIXIR TeSS (bioinformatics training materials/events), Bioconductor (R packages for computational biology), and CRAN (general R packages). Use when someone asks 'is there an existing tool/package for X', 'what software does [analysis]', 'find an API for Y', or 'is there a tutorial on Z'.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- When to Use This Skill
- 1. bio.tools — Bioinformatics Software & Database Registry
- 2. SmartAPI — Biomedical API Registry
- 3. ELIXIR TeSS — Training Materials & Events
- 4. Bioconductor — R Packages for Computational Biology
- 5. CRAN — General R Package Registry
- Choosing Among the Five Resources
- Common Pitfalls

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.BioTools_get_tool`
- `tooluniverse.tool.BioTools_search`
- `tooluniverse.tool.BioTools_search_by_operation`
- `tooluniverse.tool.BioTools_search_by_topic`
- `tooluniverse.tool.BioTools_search_by_type`
- `tooluniverse.tool.Bioconductor_get_package`
- `tooluniverse.tool.Bioconductor_search_packages`
- `tooluniverse.tool.CRAN_get_package`
- `tooluniverse.tool.CRAN_get_package_versions`
- `tooluniverse.tool.ELIXIRTeSS_search_events`
- `tooluniverse.tool.ELIXIRTeSS_search_materials`
- `tooluniverse.tool.SmartAPI_get_api`
- `tooluniverse.tool.SmartAPI_search_apis`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-bioinformatics-resource-discovery/SKILL.md)；Apache-2.0；原文 SHA-256：`aa7922d517190aab1f2d084dbf05b4ad619ed8800b0772f6deeec67c0eb3c508`。
