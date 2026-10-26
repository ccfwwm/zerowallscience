# antibody engineering

Therapeutic antibody engineering and optimization, lead-to-clinical-candidate. Covers sequence humanization (germline alignment, framework retention), affinity maturation, developability (aggregation, stability, PTMs), structure modeling (AlphaFold/PDB CDR analysis), immunogenicity prediction, and manufacturing feasibility. Use for biologic-drug optimization, mAb design review, biosimilar engineering, and clinical-precedent comparison.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- LOOK UP, DON'T GUESS
- When to Use
- Critical Workflow Requirements
- 1. Report-First Approach (MANDATORY)
- 2. Documentation Standards (MANDATORY)
- Phase 0: Tool Verification
- Required Tools
- Workflow Overview
- Phase 1: Input Analysis & Characterization
- Phase 2: Humanization Strategy
- Phase 3: Structure Modeling & Analysis
- Phase 4: Affinity Optimization
- Phase 5: Developability Assessment
- Phase 6: Immunogenicity Prediction
- Phase 7: Manufacturing Feasibility
- Phase 8: Final Report & Recommendations
- IMGT Tools
- Antibody Databases
- Immunogenicity
- Structure & Target
- Reagent Verification (Antibody Registry)
- Systems Biology (for Bispecifics)

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.AntibodyRegistry_get_by_rrid`
- `tooluniverse.tool.AntibodyRegistry_search`
- `tooluniverse.tool.CodonUsage_get_optimal_codons`
- `tooluniverse.tool.CodonUsage_get_table`
- `tooluniverse.tool.ESMFold_predict_structure`
- `tooluniverse.tool.IMGT_get_gene_info`
- `tooluniverse.tool.IMGT_get_sequence`
- `tooluniverse.tool.IMGT_search_genes`
- `tooluniverse.tool.PubMed_search_articles`
- `tooluniverse.tool.RCSBData_get_entry`
- `tooluniverse.tool.SAbDab_get_structure`
- `tooluniverse.tool.SAbDab_search_structures`
- `tooluniverse.tool.STRING_get_enrichment`
- `tooluniverse.tool.STRING_get_interaction_partners`
- `tooluniverse.tool.SciCrunch_resolve_rrid`
- `tooluniverse.tool.TheraSAbDab_search_by_target`
- `tooluniverse.tool.TheraSAbDab_search_therapeutics`
- `tooluniverse.tool.UniProt_get_entry_by_accession`
- `tooluniverse.tool.alphafold_get_prediction`
- `tooluniverse.tool.iedb_get_epitope_references`
- `tooluniverse.tool.iedb_search_bcell`
- `tooluniverse.tool.iedb_search_epitopes`
- `tooluniverse.tool.iedb_search_mhc`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-antibody-engineering/SKILL.md)；Apache-2.0；原文 SHA-256：`c46c775f13531741d3eb704e1ddeeea16ff1404e434bf6d9e7e12ca215524508`。
