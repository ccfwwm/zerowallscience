# chemical sourcing

Find commercial sources for chemical compounds — PubChem/ChEMBL identity resolution then vendor catalog search across ZINC, Enamine, eMolecules, Mcule. Compares pricing, availability, and identifies purchasable analogs when an exact compound is not in stock. Use for chemical procurement, virtual library curation, and 'where can I buy X' questions for synthesis planning.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- LOOK UP, DON'T GUESS
- COMPUTE, DON'T DESCRIBE
- When to Use
- Core Databases
- Workflow Overview
- Phase Details
- Phase 0: Compound Identity Resolution
- Phase 1: Vendor Search
- Phase 2: Price & Availability Comparison
- Phase 3: Analog Search
- Phase 4: Bioactivity Context (Optional)
- Phase 5: Decision & Order Summary
- Common Analysis Patterns
- Edge Cases & Fallbacks
- Interpretation Framework
- Limitations

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.ChEMBL_get_molecule`
- `tooluniverse.tool.Enamine_get_compound`
- `tooluniverse.tool.Enamine_search_catalog`
- `tooluniverse.tool.Mcule_get_compound`
- `tooluniverse.tool.PubChem_get_CID_by_compound_name`
- `tooluniverse.tool.PubChem_get_compound_properties_by_CID`
- `tooluniverse.tool.ZINC_get_compound`
- `tooluniverse.tool.ZINC_search_compounds`
- `tooluniverse.tool.eMolecules_get_compound`
- `tooluniverse.tool.eMolecules_search`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-chemical-sourcing/SKILL.md)；Apache-2.0；原文 SHA-256：`c231d894b4ca68ea08ef6388951e75e521a1dbb574d520e437c4a252d684042f`。
