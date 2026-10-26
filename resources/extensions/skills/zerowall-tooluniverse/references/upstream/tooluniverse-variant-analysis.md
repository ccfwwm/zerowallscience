# variant analysis

VCF and variant analysis — parsing, annotation, classification (synonymous, missense, frameshift, stop_gained), VAF filtering, coding vs non-coding categorization, multi-condition variant comparison, variant-notation conversion (SPDI/HGVS/VCF/rsID interconversion, ALFA per-ancestry allele frequencies), European Variation Archive (EVA) lookups (per-study cohort variant data, RS-accession resolution), HGVS validation/normalization (Mutalyzer), gene-specific curated variants (LOVD), canonical cross-database allele IDs (ClinGen Allele Registry), automated ACMG/AMP classification (GeneBe), principal-transcript selection (APPRIS), Ensembl linkage disequilibrium (LD) for GWAS/fine-mapping, GRCh37/GRCh38 coordinate liftover and protein/cDNA-to-genomic mapping, and Ensembl ID utilities (stable-ID version history, cross-references, region/gene feature overlap, assembly/species metadata). Use for VCF parsing, variant fraction calculations (denominator = coding subset only, NOT all variants), per-sample mutation profiling, converting a variant between SPDI/HGVS/VCF-coordinate/dbSNP-rsID representations, cross-checking a variant against EVA's raw submitted study cohorts, validating an HGVS string's syntax, looking up curated variants for a well-studied gene, resolving a variant to its ClinGen CA ID, getting an automated ACMG verdict, or picking a gene's principal transcript.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- RULE ZERO — Check for pre-computed results FIRST
- PRIMARY SCRIPTS — use these FIRST
- Workspace isolation (CRITICAL)
- Concrete invocations
- Output keys to grep
- Ploidy: match the question's pipeline, not the organism
- CRITICAL — Read before writing any code
- Domain Reasoning
- "Proportion classified as benign" — denominator convention
- LOOK UP DON'T GUESS
- CRISPR sgRNA Design Reasoning
- When to Use This Skill
- Core Capabilities
- Workflow Overview
- Phase Summaries
- Phase 1: VCF Parsing
- Phase 2: Variant Classification
- Phase 3: Filtering
- Phase 4-6: Statistics, Annotation, Reporting
- Phase 7: Structural Variant & CNV Analysis
- Common Question Patterns
- Pattern 1: VAF + Mutation Type Fraction
- Pattern 2: Cohort Comparison
- Pattern 3: Filter and Count

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.APPRIS_get_functional_annotations`
- `tooluniverse.tool.APPRIS_get_isoforms`
- `tooluniverse.tool.APPRIS_get_principal_isoform`
- `tooluniverse.tool.ClinGenAR_get_external_records`
- `tooluniverse.tool.ClinGenAR_lookup_allele`
- `tooluniverse.tool.ClinGenAR_lookup_by_external_id`
- `tooluniverse.tool.ClinGen_dosage_by_gene`
- `tooluniverse.tool.ClinGen_dosage_region_search`
- `tooluniverse.tool.EVA_get_clustered_variant_by_rs`
- `tooluniverse.tool.EVA_get_variants_by_gene`
- `tooluniverse.tool.EVA_get_variants_by_region`
- `tooluniverse.tool.EVA_list_studies`
- `tooluniverse.tool.EnsemblArchive_batch_lookup`
- `tooluniverse.tool.EnsemblArchive_get_id_history`
- `tooluniverse.tool.EnsemblLD_get_ld_pairwise`
- `tooluniverse.tool.EnsemblLD_get_ld_region`
- `tooluniverse.tool.EnsemblLD_get_ld_variants`
- `tooluniverse.tool.EnsemblMap_convert_coordinates`
- `tooluniverse.tool.EnsemblMap_translate_coordinates`
- `tooluniverse.tool.EnsemblPheno_get_by_gene`
- `tooluniverse.tool.EnsemblPheno_get_by_region`
- `tooluniverse.tool.EnsemblPheno_get_by_term`
- `tooluniverse.tool.EnsemblPheno_get_by_variant`
- `tooluniverse.tool.EnsemblVEP_annotate_rsid`
- `tooluniverse.tool.Ensembl_get_assembly_info`
- `tooluniverse.tool.Ensembl_get_cross_references`
- `tooluniverse.tool.Ensembl_get_gene_overlapping_features`
- `tooluniverse.tool.Ensembl_get_region_features`
- `tooluniverse.tool.Ensembl_get_species_info`
- `tooluniverse.tool.Ensembl_lookup_gene_by_symbol`
- `tooluniverse.tool.GeneBe_classify_variant`
- `tooluniverse.tool.GeneBe_classify_variants_batch`
- `tooluniverse.tool.LOVD_get_gene`
- `tooluniverse.tool.LOVD_get_variants`
- `tooluniverse.tool.LOVD_search_variants`
- `tooluniverse.tool.Mutalyzer_back_translate`
- `tooluniverse.tool.Mutalyzer_normalize_variant`
- `tooluniverse.tool.Mutalyzer_parse_hgvs`
- `tooluniverse.tool.MyVariant_query_variants`
- `tooluniverse.tool.NCBIVariation_alfa_frequencies_by_rsid`
- `tooluniverse.tool.NCBIVariation_hgvs_to_spdi`
- `tooluniverse.tool.NCBIVariation_rsid_lookup`
- `tooluniverse.tool.NCBIVariation_spdi_canonical`
- `tooluniverse.tool.NCBIVariation_spdi_equivalents`
- `tooluniverse.tool.NCBIVariation_spdi_to_hgvs`
- `tooluniverse.tool.NCBIVariation_spdi_to_rsids`
- `tooluniverse.tool.NCBIVariation_vcf_to_spdi`
- `tooluniverse.tool.VCF_count_variants`
- `tooluniverse.tool.VCF_normalize`
- `tooluniverse.tool.VCF_summary_stats`
- `tooluniverse.tool.coding_variant_fraction`
- `tooluniverse.tool.dbsnp_get_variant_by_rsid`
- `tooluniverse.tool.ensembl_get_structural_variants`
- `tooluniverse.tool.gnomad_get_sv_by_gene`
- `tooluniverse.tool.gnomad_get_sv_by_region`
- `tooluniverse.tool.gnomad_get_variant`
- `tooluniverse.tool.read_executed_notebook`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-variant-analysis/SKILL.md)；Apache-2.0；原文 SHA-256：`9581f1f99e8498ec04eda042d4b38728dee8adf1fa16180af659e6116fc8363a`。
