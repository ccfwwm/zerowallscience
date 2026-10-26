# structural proteomics

Structural biology plus proteomics integration for drug target validation. Combines PDB experimental structures, AlphaFold predictions, GPCRdb, SAbDab antibody structures, ProteinsPlus binding-site prediction, BindingDB ligand-affinity data, BMRB NMR data, CATH/InterPro fold classification, intrinsic-disorder prediction (MobiDB/DisProt/IUPred3), membrane-protein topology (OPM/TopDB/PDBTM/ChannelsDB), enzyme catalytic-site data (M-CSA), PDBe ligand/compound chemistry, and MD simulation trajectory metadata (MDDB). Use for druggability assessment, binding-site characterization, ligand-pocket analysis, structural-confidence scoring (resolution, pLDDT), antibody-target interface analysis, disordered-region assessment, membrane-protein topology, catalytic-mechanism lookup, and finding published MD simulations for a target.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- LOOK UP DON'T GUESS
- COMPUTE, DON'T DESCRIBE
- Domain Reasoning
- Tool Inventory
- PDB (RCSB)
- PDB (PDBe)
- PDBe PISA
- AlphaFold
- Binding Sites
- Ligand/Compound Chemistry (PDBe Compounds)
- Foldseek
- GPCRdb
- SAbDab
- Domains
- Fold/Domain Classification (CATH + InterPro member databases)
- Domain Architecture and Clans (InterPro, Pfam-accession-keyed)
- Proteomics
- Molecular Dynamics Simulation Metadata (MDDB)
- BMRB (NMR data)
- Intrinsic Disorder (MobiDB, DisProt, IUPred3)
- Membrane Protein Structure (OPM, TopDB, PDBTM, ChannelsDB)
- Catalytic Site Atlas (M-CSA)
- Workflow 1: Find All Structures for a Drug Target
- Workflow 4: NMR Structural/Dynamics Data (BMRB)

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.BMRB_get_entries_by_pdb_id`
- `tooluniverse.tool.BMRB_get_entries_by_uniprot`
- `tooluniverse.tool.BMRB_get_entry`
- `tooluniverse.tool.BMRB_get_entry_citation`
- `tooluniverse.tool.BMRB_get_validation`
- `tooluniverse.tool.BMRB_search_by_keyword`
- `tooluniverse.tool.BMRB_search_by_sequence`
- `tooluniverse.tool.BMRB_search_chemical_shifts`
- `tooluniverse.tool.BindingDB_get_ligands_by_pdb`
- `tooluniverse.tool.BindingDB_get_ligands_by_uniprot`
- `tooluniverse.tool.BindingDB_get_targets_by_compound`
- `tooluniverse.tool.CATH_get_domain_summary`
- `tooluniverse.tool.CATH_get_funfam`
- `tooluniverse.tool.CATH_get_superfamily`
- `tooluniverse.tool.CATH_list_funfams`
- `tooluniverse.tool.ChannelsDB_get_channels_cofactor`
- `tooluniverse.tool.ChannelsDB_get_channels_pdb`
- `tooluniverse.tool.DisProt_get_entry`
- `tooluniverse.tool.DisProt_search`
- `tooluniverse.tool.Foldseek_get_result`
- `tooluniverse.tool.Foldseek_search_structure`
- `tooluniverse.tool.GPCRdb_get_ligands`
- `tooluniverse.tool.GPCRdb_get_mutations`
- `tooluniverse.tool.GPCRdb_get_protein`
- `tooluniverse.tool.GPCRdb_get_structures`
- `tooluniverse.tool.IUPred3_predict_disorder`
- `tooluniverse.tool.InterPro_get_clan_members`
- `tooluniverse.tool.InterPro_get_member_signature`
- `tooluniverse.tool.InterPro_get_protein_domain_architecture`
- `tooluniverse.tool.InterPro_get_protein_domains`
- `tooluniverse.tool.InterPro_get_structures_for_domain`
- `tooluniverse.tool.InterPro_get_structures_for_entry`
- `tooluniverse.tool.InterPro_list_member_databases`
- `tooluniverse.tool.InterPro_list_member_signatures`
- `tooluniverse.tool.MCSA_get_entry`
- `tooluniverse.tool.MCSA_search_enzymes`
- `tooluniverse.tool.MDDB_get_project`
- `tooluniverse.tool.MDDB_search_projects`
- `tooluniverse.tool.MobiDB_get_consensus`
- `tooluniverse.tool.MobiDB_get_protein`
- `tooluniverse.tool.OPM_search_structures`
- `tooluniverse.tool.PDBTM_get_topology`
- `tooluniverse.tool.PDBePISA_get_assemblies`
- `tooluniverse.tool.PDBePISA_get_interfaces`
- `tooluniverse.tool.PDBeSIFTS_get_all_structures`
- `tooluniverse.tool.PDBeSIFTS_get_best_structures`
- `tooluniverse.tool.PDBeSearch_search_structures`
- `tooluniverse.tool.PDBeValidation_get_quality_scores`
- `tooluniverse.tool.PDBe_KB_get_interface_residues`
- `tooluniverse.tool.PDBe_KB_get_ligand_sites`
- `tooluniverse.tool.PDBe_get_bound_molecules`
- `tooluniverse.tool.PDBe_get_compound_structures`
- `tooluniverse.tool.PDBe_get_compound_summary`
- `tooluniverse.tool.PDBe_get_structure_ligands`
- `tooluniverse.tool.Pfam_get_protein_annotations`
- `tooluniverse.tool.ProteinsPlus_predict_binding_sites`
- `tooluniverse.tool.ProteomeXchange_get_dataset`
- `tooluniverse.tool.ProteomeXchange_search_datasets`
- `tooluniverse.tool.RCSBAdvSearch_search_structures`
- `tooluniverse.tool.RCSBData_get_entry`
- `tooluniverse.tool.RCSBGraphQL_get_ligand_info`
- `tooluniverse.tool.RCSBGraphQL_get_structure_summary`
- `tooluniverse.tool.RCSB_get_chemical_component`
- `tooluniverse.tool.SAbDab_get_structure`
- `tooluniverse.tool.SAbDab_search_structures`
- `tooluniverse.tool.SKEMPI_get_mutation`
- `tooluniverse.tool.SKEMPI_search_by_protein`
- `tooluniverse.tool.SKEMPI_search_by_structure`
- `tooluniverse.tool.TheraSAbDab_search_by_target`
- `tooluniverse.tool.TheraSAbDab_search_therapeutics`
- `tooluniverse.tool.TopDB_get_topology`
- `tooluniverse.tool.UniProt_get_entry_by_accession`
- `tooluniverse.tool.alphafold_get_annotations`
- `tooluniverse.tool.alphafold_get_prediction`
- `tooluniverse.tool.alphafold_get_summary`
- `tooluniverse.tool.pdbe_get_entry_summary`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-structural-proteomics/SKILL.md)；Apache-2.0；原文 SHA-256：`ad0efa6cf00dc3942085d44879925727108c5ccbcd4280bf5861e3b62139402f`。
