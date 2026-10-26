# metabolomics

Metabolomics research — metabolite identification, study analysis, and database searches across HMDB, MetaboLights, Metabolomics Workbench, KEGG. Use for annotating mass-spec features to known metabolites, finding metabolomics studies of a disease, and structured metabolomics research reports with metabolite-pathway mapping.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Use Case
- Databases Covered
- Research Workflow
- Phase 1: Metabolite Identification & Annotation
- Phase 2: Study Details Retrieval
- Phase 3: Study Search
- Phase 4: Database Overview
- Usage Patterns
- Pattern 1: Metabolite Identification
- Pattern 2: Study Retrieval
- Pattern 3: Study Search
- Pattern 4: Comprehensive Analysis
- Input Parameters
- metabolite_list (optional)
- study_id (optional)
- search_query (optional)
- organism (optional)
- output_file (optional)
- Output Format
- Implementation Notes
- SOAP Tool Handling
- Response Format Variations
- Fallback Strategy
- Progressive Report Writing

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.FooDB_get_compound`
- `tooluniverse.tool.HMDB_get_metabolite`
- `tooluniverse.tool.HMDB_search`
- `tooluniverse.tool.MetabolomicsWorkbench_get_study`
- `tooluniverse.tool.MetabolomicsWorkbench_search_compound_by_name`
- `tooluniverse.tool.PubChem_get_CID_by_compound_name`
- `tooluniverse.tool.PubChem_get_compound_properties_by_CID`
- `tooluniverse.tool.metabolights_get_study`
- `tooluniverse.tool.metabolights_list_studies`
- `tooluniverse.tool.metabolights_search_studies`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-metabolomics/SKILL.md)；Apache-2.0；原文 SHA-256：`9ddba689efeb892709d7cc70c04f039d0d8c2ca50016b77506d2d1bacfa93caa`。
