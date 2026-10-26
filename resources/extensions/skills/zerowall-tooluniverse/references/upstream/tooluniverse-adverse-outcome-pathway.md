# adverse outcome pathway

Map environmental and industrial chemicals to adverse outcome pathways (AOPs) — molecular initiating event to organ-level toxicity. Uses AOPWiki, GHS classification, IARC carcinogen status, and LD50 data. Use for environmental/industrial chemical risk assessment, regulatory-grade hazard characterization, and AOP stressor mapping. Distinct from drug-safety analysis (use tooluniverse-pharmacovigilance for drugs).

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- When to Use
- Key Tools
- Workflow
- Phase 1: Compound Identity Resolution
- Phase 2: AOP Discovery
- Phase 3: Hazard Quantification (PubChemTox)
- Phase 4: Toxicogenomics (CTD)
- Common Patterns
- Reasoning Framework for Result Interpretation
- Evidence Grading
- Interpretation Guidance
- Synthesis Questions
- Fallback Chains

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.AOPWiki_get_aop`
- `tooluniverse.tool.AOPWiki_list_aops`
- `tooluniverse.tool.CTD_get_chemical_diseases`
- `tooluniverse.tool.CTD_get_chemical_gene_interactions`
- `tooluniverse.tool.CTD_get_gene_diseases`
- `tooluniverse.tool.PubChemTox_get_acute_effects`
- `tooluniverse.tool.PubChemTox_get_carcinogen_classification`
- `tooluniverse.tool.PubChemTox_get_ghs_classification`
- `tooluniverse.tool.PubChemTox_get_target_organs`
- `tooluniverse.tool.PubChemTox_get_toxicity_summary`
- `tooluniverse.tool.PubChemTox_get_toxicity_values`
- `tooluniverse.tool.PubChem_get_CID_by_compound_name`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-adverse-outcome-pathway/SKILL.md)；Apache-2.0；原文 SHA-256：`494b3bc03289a5f7fecdaa620a182edaa64394130c00f3eed251a75342ef0301`。
