# neuroscience

Neuroscience research workflows: neuroanatomy, neural circuits, neurotransmitter biology, neurological/psychiatric disease genetics, neural-protein function. Uses Allen Brain Atlas, WormBase (C. elegans connectome), UniProt for neural proteins, PubMed for primary literature. Use for brain-region biology, neural development, neurodegeneration mechanisms (Alzheimer's, Parkinson's, ALS), and synaptic-protein characterization.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- LOOK UP, DON'T GUESS
- 1. Computational Neuroscience Reasoning
- Rate-Based Models
- Integrate-and-Fire Neurons
- Synaptic Plasticity
- Network Dynamics
- Quantitative Problem-Solving Strategy
- 2. Neuroanatomy Reasoning
- CRITICAL: Look Up Neuroanatomy
- Human Brain — Major Divisions
- Model Organism Neuroanatomy
- Reasoning Pattern for "Where in the Brain?" Questions
- 3. Clinical Neurology Reasoning
- Cranial Nerve Examination
- Stroke Localization
- Upper vs Lower Motor Neuron
- Neurodegenerative Disease Patterns
- Reasoning Pattern for Clinical Neuro Questions
- 4. Neurophysiology Reasoning
- Action Potential
- Synaptic Transmission
- 5. Available Tools
- Tool Selection Strategy
- 6. C. elegans Connectome Lookups

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.AllenCellTypes_search_specimens`
- `tooluniverse.tool.Alliance_search_genes`
- `tooluniverse.tool.ClinVar_search_variants`
- `tooluniverse.tool.DANDI_get_dataset`
- `tooluniverse.tool.DANDI_list_assets`
- `tooluniverse.tool.DANDI_search_datasets`
- `tooluniverse.tool.EuropePMC_search_articles`
- `tooluniverse.tool.ModelDB_get_celltype`
- `tooluniverse.tool.ModelDB_get_model`
- `tooluniverse.tool.ModelDB_get_paper`
- `tooluniverse.tool.ModelDB_list_celltypes`
- `tooluniverse.tool.ModelDB_list_models`
- `tooluniverse.tool.NCBIGene_search`
- `tooluniverse.tool.NeuroMorpho_get_field_values`
- `tooluniverse.tool.NeuroMorpho_get_literature`
- `tooluniverse.tool.NeuroMorpho_get_morphometry`
- `tooluniverse.tool.NeuroMorpho_get_neuron`
- `tooluniverse.tool.NeuroMorpho_get_persistence_vector`
- `tooluniverse.tool.NeuroMorpho_search_literature`
- `tooluniverse.tool.NeuroMorpho_search_neurons`
- `tooluniverse.tool.NeuroVault_get_atlas`
- `tooluniverse.tool.NeuroVault_get_collection`
- `tooluniverse.tool.NeuroVault_get_image`
- `tooluniverse.tool.NeuroVault_list_atlases`
- `tooluniverse.tool.NeuroVault_list_collection_images`
- `tooluniverse.tool.NeuroVault_list_collections`
- `tooluniverse.tool.OpenNeuro_advanced_search`
- `tooluniverse.tool.OpenNeuro_get_dataset`
- `tooluniverse.tool.OpenNeuro_get_dataset_snapshots`
- `tooluniverse.tool.OpenNeuro_get_snapshot_files`
- `tooluniverse.tool.OpenNeuro_get_snapshot_validation`
- `tooluniverse.tool.OpenNeuro_list_datasets`
- `tooluniverse.tool.OpenNeuro_search_by_modality`
- `tooluniverse.tool.OpenTargets_multi_entity_search_by_query_string`
- `tooluniverse.tool.Orphanet_search_diseases`
- `tooluniverse.tool.PubMed_search_articles`
- `tooluniverse.tool.UniProt_search`
- `tooluniverse.tool.WormBase_get_gene`
- `tooluniverse.tool.gwas_search_associations`
- `tooluniverse.tool.kegg_get_pathway_info`
- `tooluniverse.tool.proteins_api_search`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-neuroscience/SKILL.md)；Apache-2.0；原文 SHA-256：`af9482c6b9a50a0c04b560c05188ee798b6e1ecef8e0ef253a625f515cb13874`。
