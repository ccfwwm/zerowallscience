# regulatory genomics

Transcription factor binding, cis-regulatory elements (cCREs), chromatin accessibility, and regulatory annotation using JASPAR (motifs), UniBind, ENCODE (cCREs, ChIP-seq), RegulomeDB (regulatory variant scoring), UCSC, and the Ensembl Regulatory Build (motif instances, evolutionarily constrained elements, TF binding matrices) — plus sequence-based deep-learning prediction of regulatory activity and non-coding variant effects (AlphaGenome, Enformer, Borzoi, ChromBPNet, Evo 2). Use for regulatory element annotation, TF-binding-site prediction, regulatory-region functional impact assessment, and predicting how a non-coding variant or a raw DNA sequence affects expression/chromatin/accessibility. Use this whenever a user asks what regulates a gene, whether a SNP hits a regulatory element, or to predict a non-coding variant's functional effect from sequence.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Domain Reasoning
- LOOK UP DON'T GUESS
- COMPUTE, DON'T DESCRIBE
- When to Use
- Key Tools
- Sequence-based deep-learning models (predict, don't just annotate)
- Workflow
- Phase 1: TF Motif Discovery (JASPAR)
- Phase 1b: Direct TF-DNA Binding Sites (UniBind)
- Phase 1c: Ensembl Regulatory Build (motifs + the missing conservation evidence type)
- Repeat Elements (Dfam)
- Phase 2: ENCODE Experiment Search
- Phase 3: cCRE Annotation (UCSC + ENCODE)
- Phase 4: Regulatory Variant Scoring (RegulomeDB)
- Common Patterns
- Pattern 1: TF Binding Site Investigation
- Pattern 2: Regulatory Variant Interpretation
- Pattern 3: Cell-Type Regulatory Landscape
- Pattern 4: Gene Regulatory Region Mapping
- Fallback Strategies
- Limitations

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.ALPHA_GENOME_API_KEY`
- `tooluniverse.tool.AlphaGenome_atlas_lookup_variant`
- `tooluniverse.tool.AlphaGenome_atlas_scan_interval`
- `tooluniverse.tool.AlphaGenome_predict_interval`
- `tooluniverse.tool.AlphaGenome_score_ism_variants`
- `tooluniverse.tool.AlphaGenome_score_variant`
- `tooluniverse.tool.Dfam_get_annotations`
- `tooluniverse.tool.Dfam_get_family`
- `tooluniverse.tool.Dfam_search_families`
- `tooluniverse.tool.ENCODE_get_chromatin_state`
- `tooluniverse.tool.ENCODE_get_experiment`
- `tooluniverse.tool.ENCODE_search_annotations`
- `tooluniverse.tool.ENCODE_search_biosamples`
- `tooluniverse.tool.ENCODE_search_chromatin_accessibility`
- `tooluniverse.tool.ENCODE_search_experiments`
- `tooluniverse.tool.ENCODE_search_histone_experiments`
- `tooluniverse.tool.EnsemblReg_get_binding_matrix`
- `tooluniverse.tool.EnsemblReg_get_constrained_elements`
- `tooluniverse.tool.EnsemblReg_get_motif_features`
- `tooluniverse.tool.Evo2_score_variant`
- `tooluniverse.tool.GENOMIC_INTELLIGENCE_MCP_URL`
- `tooluniverse.tool.HOCOMOCO_get_motif`
- `tooluniverse.tool.HOCOMOCO_search_motifs`
- `tooluniverse.tool.JASPAR_get_transcription_factors`
- `tooluniverse.tool.MEME_discover_motifs`
- `tooluniverse.tool.MEME_fimo_scan`
- `tooluniverse.tool.MEME_list_databases`
- `tooluniverse.tool.MEME_tomtom_compare`
- `tooluniverse.tool.MyGene_query_genes`
- `tooluniverse.tool.NVIDIA_API_KEY`
- `tooluniverse.tool.RegulomeDB_query_variant`
- `tooluniverse.tool.UCSC_get_encode_cCREs`
- `tooluniverse.tool.UniBind_get_dataset`
- `tooluniverse.tool.UniBind_list_tfs`
- `tooluniverse.tool.UniBind_search_datasets`
- `tooluniverse.tool.ensembl_lookup_gene`
- `tooluniverse.tool.jaspar_get_matrix`
- `tooluniverse.tool.jaspar_get_matrix_versions`
- `tooluniverse.tool.jaspar_search_matrices`
- `tooluniverse.tool.run_borzoi_predict`
- `tooluniverse.tool.run_borzoi_variant_effect`
- `tooluniverse.tool.run_chrombpnet_predict`
- `tooluniverse.tool.run_chrombpnet_variant_effect`
- `tooluniverse.tool.run_enformer_predict`
- `tooluniverse.tool.run_enformer_variant_effect`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-regulatory-genomics/SKILL.md)；Apache-2.0；原文 SHA-256：`15801c94c45a8fa1006c4547d03b52ddb7437909cc80055fca362ef4c91b16e2`。
