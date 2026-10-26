# protein modification analysis

Post-translational modification (PTM) analysis — phosphorylation, ubiquitination, acetylation, glycosylation, methylation. Uses iPTMnet (sites + enzymes), ProtVar (functional consequences), UniProt (baseline), STRING, ELM (linear motifs), MassIVE/ProteomeXchange (experimental), and the EBI Proteins API (mutagenesis, MS-proteomics/HPP peptide evidence, antigenic regions, genomic coordinates, protein-level variant lookup by accession/dbSNP/HGVS) as a cross-validation source. Use for PTM site annotation, kinase-substrate identification, and PTM-disease associations.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- LOOK UP DON'T GUESS
- COMPUTE, DON'T DESCRIBE
- Domain Reasoning
- KEY PRINCIPLES
- Workflow
- Phase 0: Disambiguation
- Phase 1: PTM Sites
- Phase 2: Proteoforms
- Phase 3: PTM-Dependent Interactions
- Phase 4: Functional Context
- Phase 4b: Linear Motifs (ELM)
- Phase 4c: Experimental Data
- Phase 4d: EBI Proteins Cross-Validation (Structural, Antigenic, MS-Peptide Evidence)
- Evidence Grading
- Fallbacks
- Limitations

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.EBIProteins_get_antigen`
- `tooluniverse.tool.EBIProteins_get_coordinate_mapping`
- `tooluniverse.tool.EBIProteins_get_coordinates`
- `tooluniverse.tool.EBIProteins_get_domains_sites`
- `tooluniverse.tool.EBIProteins_get_epitopes`
- `tooluniverse.tool.EBIProteins_get_features`
- `tooluniverse.tool.EBIProteins_get_hpp_peptides`
- `tooluniverse.tool.EBIProteins_get_molecule_processing`
- `tooluniverse.tool.EBIProteins_get_mutagenesis`
- `tooluniverse.tool.EBIProteins_get_proteins_by_genomic_loc`
- `tooluniverse.tool.EBIProteins_get_proteomics_peptides`
- `tooluniverse.tool.EBIProteins_get_proteomics_ptm`
- `tooluniverse.tool.EBIProteins_get_rna_editing`
- `tooluniverse.tool.EBIProteins_get_structural_features`
- `tooluniverse.tool.EBIProteins_get_variation`
- `tooluniverse.tool.EBIProteins_get_variation_by_dbsnp`
- `tooluniverse.tool.EBIProteins_get_variation_by_hgvs`
- `tooluniverse.tool.ELM_get_instances`
- `tooluniverse.tool.ELM_list_classes`
- `tooluniverse.tool.MassIVE_get_dataset`
- `tooluniverse.tool.MassIVE_search_datasets`
- `tooluniverse.tool.OmniPath_get_enzyme_substrate`
- `tooluniverse.tool.ProtVar_get_function`
- `tooluniverse.tool.STRING_get_interaction_partners`
- `tooluniverse.tool.UniProt_get_ptm_processing_by_accession`
- `tooluniverse.tool.UniProt_search`
- `tooluniverse.tool.iPTMnet_get_proteoforms`
- `tooluniverse.tool.iPTMnet_get_ptm_ppi`
- `tooluniverse.tool.iPTMnet_get_ptm_sites`
- `tooluniverse.tool.iPTMnet_search`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-protein-modification-analysis/SKILL.md)；Apache-2.0；原文 SHA-256：`f25bda7dcf381147ff571bb4b86976408cd62bcdecbba625a8823340012b7dac`。
