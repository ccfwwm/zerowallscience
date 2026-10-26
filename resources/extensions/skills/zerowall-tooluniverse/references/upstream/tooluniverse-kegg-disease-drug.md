# kegg disease drug

KEGG-based disease-drug-variant network research. Connects diseases to causal genes, drugs to molecular targets, and variants to pathways using KEGG's editorially curated databases (KEGG Disease, Drug, Network, Variant, Pathway). Use for drug repurposing via shared pathways, mechanistic disease-gene-drug networks, and pathway-based target discovery. Distinguishes direct (binding) vs indirect (pathway co-membership) drug-target relationships.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Reasoning Strategy
- When to Use
- Tool Inventory (12 tools)
- Workflow
- Phase 1: Disease Lookup
- Phase 2: Disease Genes
- Phase 3: Drug Search
- Phase 4: Drug Targets
- Phase 5: Network & Variant Context
- Example Workflow: Find Drugs Targeting BRAF Variants in Cancer
- ID Conversion & Cross-Linking
- Integration with Other Skills
- Reasoning Framework for Result Interpretation
- Evidence Grading
- Interpretation Guidance
- Synthesis Questions
- Output

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.KEGG_convert_ids`
- `tooluniverse.tool.KEGG_get_disease`
- `tooluniverse.tool.KEGG_get_disease_genes`
- `tooluniverse.tool.KEGG_get_drug`
- `tooluniverse.tool.KEGG_get_drug_targets`
- `tooluniverse.tool.KEGG_get_network`
- `tooluniverse.tool.KEGG_get_variant`
- `tooluniverse.tool.KEGG_link_entries`
- `tooluniverse.tool.KEGG_search_disease`
- `tooluniverse.tool.KEGG_search_drug`
- `tooluniverse.tool.KEGG_search_network`
- `tooluniverse.tool.KEGG_search_variant`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-kegg-disease-drug/SKILL.md)；Apache-2.0；原文 SHA-256：`2de4a6af019e747a735b15ab5ac6d577f31ca938a7165b2d8413322422cd3404`。
