# infectious disease

Rapid pathogen characterization and drug repurposing for outbreaks. Combines pathogen genomics (NCBI, BVBRC), host immune response (IEDB), drug-target databases (ChEMBL, DGIdb), and literature surveillance (PubMed/EuropePMC). Use for emerging-pathogen profiling, antiviral candidate identification, and outbreak intelligence reporting.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- COMPUTE, DON'T DESCRIBE
- When to Use
- Critical Workflow Requirements
- 1. Report-First Approach (MANDATORY)
- 2. Citation Requirements (MANDATORY)
- Phase 0: Tool Verification
- Known Parameter Corrections
- Workflow Overview
- Phase Summaries
- Phase 1: Pathogen Identification
- Phase 2: Target Identification
- Phase 3: Structure Prediction
- Phase 4: Drug Repurposing Screen
- Phase 4.5: Pathway Analysis
- Phase 5: Literature Intelligence
- Phase 6: Report Synthesis
- Evidence Grading
- Completeness Checklist
- Phase 1: Pathogen ID
- Phase 2: Targets
- Phase 3: Structures
- Phase 4: Drug Screen
- Phase 5: Literature
- Phase 6: Recommendations

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.BVBRC_search_taxonomy`
- `tooluniverse.tool.ChEMBL_search_drugs`
- `tooluniverse.tool.ChEMBL_search_targets`
- `tooluniverse.tool.ESMFold_predict_structure`
- `tooluniverse.tool.FDA_get_drug_label_info_by_field_value`
- `tooluniverse.tool.NCBIDatasets_get_genome_assembly`
- `tooluniverse.tool.NCBIDatasets_get_sequence_reports`
- `tooluniverse.tool.NCBIDatasets_get_taxonomy`
- `tooluniverse.tool.NCBIDatasets_list_genomes_by_taxon`
- `tooluniverse.tool.NCBIDatasets_suggest_taxonomy`
- `tooluniverse.tool.NVIDIA_API_KEY`
- `tooluniverse.tool.Nextstrain_get_dataset`
- `tooluniverse.tool.Nextstrain_list_datasets`
- `tooluniverse.tool.NvidiaNIM_alphafold2`
- `tooluniverse.tool.NvidiaNIM_boltz2`
- `tooluniverse.tool.OpenFDA_search_drug_labels`
- `tooluniverse.tool.Pathoplexus_count_sequences`
- `tooluniverse.tool.Pathoplexus_get_mutations`
- `tooluniverse.tool.PubMed_search_articles`
- `tooluniverse.tool.UniProtTaxonomy_get_taxon`
- `tooluniverse.tool.UniProt_search`
- `tooluniverse.tool.alphafold_get_prediction`
- `tooluniverse.tool.drugbank_full_search`
- `tooluniverse.tool.drugbank_vocab_search`
- `tooluniverse.tool.get_diffdock_info`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-infectious-disease/SKILL.md)；Apache-2.0；原文 SHA-256：`f21dffc9e6c8b822c0702c66374ad132cdc5de828d9ce1d722ce32b4e39259c4`。
