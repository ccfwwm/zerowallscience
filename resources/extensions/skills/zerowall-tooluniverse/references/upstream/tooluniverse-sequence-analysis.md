# sequence analysis

Biological sequence analysis — gene/protein sequence retrieval (NCBI, Ensembl, UniProt), nucleotide/protein search, ortholog discovery, and FASTQ QC + alignment workflows (Trimmomatic, BWA, samtools, coverage depth). Use for sequence retrieval, sequence comparison, FASTQ QC analysis, and read alignment pre-processing.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- ⚠️ TOP-OF-MIND RULE: Trimmomatic "reads completely discarded" = `F + R + 2*D`, summed across samples
- RULE ZERO — Check for pre-computed results FIRST
- FASTQ QC, Trimmomatic, and read alignment (when raw reads are present)
- Trimmomatic PE — counting "completely discarded" reads
- Coverage depth (samtools depth / mosdepth)
- When to Use
- Workflow
- Phase 1: Gene Identification and Summary
- Phase 2: Nucleotide Sequence Search and Retrieval
- Recipe: Get mRNA for a human gene
- Phase 3: Protein Sequence Retrieval
- Phase 4: Ortholog and Comparative Analysis
- Recipe: Compare orthologs
- Phase 5: Domain Architecture and Homology
- Phase 6: Variant and Clinical Context
- Fallbacks
- Sequence Analysis Reasoning (CRITICAL)
- When to Use Which Tool
- Reading Frame Selection Strategy
- Protein Domain Interpretation
- Reasoning for Protein Feature Questions
- Bundled Computation Scripts
- amino_acids.py — Codon table, amino acid properties, wobble pairing
- Codon-Anticodon Matching Reasoning (CRITICAL for tRNA problems)

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.BLAST_protein_search`
- `tooluniverse.tool.ClinVar_search_variants`
- `tooluniverse.tool.CodonUsage_get_optimal_codons`
- `tooluniverse.tool.CodonUsage_get_table`
- `tooluniverse.tool.DNA_translate_reading_frames`
- `tooluniverse.tool.EBI_pairwise_align`
- `tooluniverse.tool.EBI_predict_membrane_topology`
- `tooluniverse.tool.EBI_profile_search`
- `tooluniverse.tool.EBI_scan_pfam_domains`
- `tooluniverse.tool.EBI_translate_sequence`
- `tooluniverse.tool.EnsemblCompara_get_orthologues`
- `tooluniverse.tool.EnsemblSeq_get_id_sequence`
- `tooluniverse.tool.EnsemblSeq_get_region_sequence`
- `tooluniverse.tool.EnsemblVEP_annotate_hgvs`
- `tooluniverse.tool.InterPro_get_entries_for_protein`
- `tooluniverse.tool.NCBIDatasets_get_gene`
- `tooluniverse.tool.NCBIDatasets_get_gene_by_symbol`
- `tooluniverse.tool.NCBIDatasets_get_orthologs`
- `tooluniverse.tool.NCBIGene_get_summary`
- `tooluniverse.tool.NCBIGene_search`
- `tooluniverse.tool.NCBIProtein_get_summary`
- `tooluniverse.tool.NCBI_fetch_accessions`
- `tooluniverse.tool.NCBI_get_sequence`
- `tooluniverse.tool.NCBI_search_nucleotide`
- `tooluniverse.tool.Pfam_get_protein_annotations`
- `tooluniverse.tool.PubMed_search_articles`
- `tooluniverse.tool.Sequence_count_residues`
- `tooluniverse.tool.Sequence_gc_content`
- `tooluniverse.tool.Sequence_reverse_complement`
- `tooluniverse.tool.Sequence_stats`
- `tooluniverse.tool.UniProt_get_entry_by_accession`
- `tooluniverse.tool.UniProt_get_sequence_by_accession`
- `tooluniverse.tool.UniProt_search`
- `tooluniverse.tool.ensembl_get_sequence`
- `tooluniverse.tool.proteins_api_get_features`
- `tooluniverse.tool.proteins_api_search`
- `tooluniverse.tool.read_executed_notebook`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-sequence-analysis/SKILL.md)；Apache-2.0；原文 SHA-256：`f7a04b056d6f96f17f5f6495a2ea63d005c6f9f22204bc9e70d80327b827f52b`。
