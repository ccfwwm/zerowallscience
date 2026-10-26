# binder discovery

Discover novel small-molecule binders for protein targets using structure-based and ligand-based screening. Covers druggability assessment, known-ligand mining (ChEMBL, BindingDB), similarity expansion, ADMET filtering, and synthesis feasibility. Use for hit identification, virtual screening, target-to-compounds workflows, and lead-finding before commit-to-medchem.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Binding Site Reasoning (Start Here)
- Critical Workflow Requirements
- 1. Report-First Approach (MANDATORY)
- 2. Citation Requirements (MANDATORY)
- Workflow Overview
- Phase 0: Tool Verification
- Phase 1: Target Validation
- 1.1 Identifier Resolution
- 1.2 Druggability Assessment
- 1.3 Binding Site Analysis
- 1.4 Structure Prediction (NVIDIA NIM)
- Phase 2: Known Ligand Mining
- Phase 3: Structure Analysis
- Phase 3.5: Docking Validation (NVIDIA NIM)
- Phase 4: Compound Expansion
- 4.1-4.3 Search-Based Expansion
- 4.4 De Novo Generation (NVIDIA NIM)
- Phase 5: ADMET Filtering
- Phase 6: Candidate Docking & Prioritization
- Phase 6.5: Literature Evidence
- Fallback Chains
- Programmatic Access (Beyond Tools)
- NVIDIA NIM Runtime Notes

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.ADMETAI_predict_CYP_interactions`
- `tooluniverse.tool.ADMETAI_predict_bioavailability`
- `tooluniverse.tool.ADMETAI_predict_physicochemical_properties`
- `tooluniverse.tool.ADMETAI_predict_toxicity`
- `tooluniverse.tool.BindingDB_get_ligands_by_uniprot`
- `tooluniverse.tool.BindingDB_get_targets_by_compound`
- `tooluniverse.tool.ChEMBL_get_target_activities`
- `tooluniverse.tool.ChEMBL_search_binding_sites`
- `tooluniverse.tool.ChEMBL_search_compound_structural_alerts`
- `tooluniverse.tool.ChEMBL_search_similar_molecules`
- `tooluniverse.tool.ChEMBL_search_substructure`
- `tooluniverse.tool.ChEMBL_search_targets`
- `tooluniverse.tool.DGIdb_get_gene_druggability`
- `tooluniverse.tool.EMDB_search_structures`
- `tooluniverse.tool.ESMFold_predict_structure`
- `tooluniverse.tool.EuropePMC_search_articles`
- `tooluniverse.tool.GPCRdb_get_ligands`
- `tooluniverse.tool.GPCRdb_get_protein`
- `tooluniverse.tool.GPCRdb_get_structures`
- `tooluniverse.tool.GtoPdb_search_ligands`
- `tooluniverse.tool.GtoPdb_search_targets`
- `tooluniverse.tool.InterPro_get_protein_domains`
- `tooluniverse.tool.MolGlueDB_get_compound`
- `tooluniverse.tool.MolGlueDB_search_compounds`
- `tooluniverse.tool.MyGene_query_genes`
- `tooluniverse.tool.NVIDIA_API_KEY`
- `tooluniverse.tool.NvidiaNIM_alphafold2`
- `tooluniverse.tool.NvidiaNIM_boltz2`
- `tooluniverse.tool.NvidiaNIM_diffdock`
- `tooluniverse.tool.NvidiaNIM_esmfold`
- `tooluniverse.tool.NvidiaNIM_genmol`
- `tooluniverse.tool.NvidiaNIM_molmim`
- `tooluniverse.tool.OpenTargets_get_chemical_probes_by_target_ensemblID`
- `tooluniverse.tool.OpenTargets_get_target_classes_by_ensemblID`
- `tooluniverse.tool.OpenTargets_get_target_tractability_by_ensemblID`
- `tooluniverse.tool.PDB_search_similar_structures`
- `tooluniverse.tool.PubChem_search_assays_by_target_gene`
- `tooluniverse.tool.PubChem_search_compounds_by_similarity`
- `tooluniverse.tool.PubMed_search_articles`
- `tooluniverse.tool.STITCH_get_chemical_protein_interactions`
- `tooluniverse.tool.TheraSAbDab_search_by_target`
- `tooluniverse.tool.UniProt_search`
- `tooluniverse.tool.alphafold_get_prediction`
- `tooluniverse.tool.get_binding_affinity_by_pdb_id`
- `tooluniverse.tool.get_diffdock_info`
- `tooluniverse.tool.get_ligand_smiles_by_chem_comp_id`
- `tooluniverse.tool.get_protein_metadata_by_pdb_id`
- `tooluniverse.tool.get_tool_info`
- `tooluniverse.tool.openalex_search_works`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-binder-discovery/SKILL.md)；Apache-2.0；原文 SHA-256：`aa2b21bb72a556990a0eb1de6e7bc6d97c17f9d995f2698ffba774ae0c43a3c6`。
