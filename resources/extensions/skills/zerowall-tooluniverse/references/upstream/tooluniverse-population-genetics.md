# population genetics

Population genetics analysis — allele frequencies (gnomAD, 1000 Genomes), Hardy-Weinberg equilibrium testing, Fst between populations, GWAS associations, evolutionary constraint scores. Use for cross-population variant comparison, ancestry-aware allele frequency lookups, and population-level evolutionary analysis.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- When to Use
- LOOK UP, DON'T GUESS
- Critical Gotchas
- Workflow Patterns
- Theoretical Reasoning (CRITICAL for computation problems)
- Allele Frequency Change Under Selection (delta-q)
- Genetic Drift in Small Populations
- Linkage Disequilibrium (LD) Decay
- Hardy-Weinberg Equilibrium
- Heritability
- Path Analysis (Causal Diagrams)
- Genetic Combinatorics (F2 crosses, haplotype counting)
- Mutation-Selection Balance
- F-statistics and Population Structure
- Mendelian Genetics Reasoning Framework
- Step 1: Identify genes, locations, and allele relationships
- Step 2: Write parental genotypes explicitly
- Step 3: Draw Punnett square(s) for each gene
- Step 4: Calculate expected phenotypic ratios
- Step 5: Verify ratios sum to 1.0
- Step 6: Apply phenotype modification rules AFTER computing genotypic ratios
- E. coli Hfr Mapping Framework
- Core Principles
- Interrupted Mating Experiments

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.ClinVar_search_variants`
- `tooluniverse.tool.EnsemblVEP_annotate_rsid`
- `tooluniverse.tool.EnsemblVEP_variant_recoder`
- `tooluniverse.tool.EuropePMC_search_articles`
- `tooluniverse.tool.MyVariant_query_variants`
- `tooluniverse.tool.PopGen_fst`
- `tooluniverse.tool.PopGen_haplotype_count`
- `tooluniverse.tool.PopGen_hwe_test`
- `tooluniverse.tool.PopGen_inbreeding`
- `tooluniverse.tool.PubMed_search_articles`
- `tooluniverse.tool.RegulomeDB_query_variant`
- `tooluniverse.tool.gnomad_get_gene_constraints`
- `tooluniverse.tool.gnomad_get_variant`
- `tooluniverse.tool.gnomad_search_variants`
- `tooluniverse.tool.gwas_get_snps_for_gene`
- `tooluniverse.tool.gwas_get_variants_for_trait`
- `tooluniverse.tool.gwas_search_associations`
- `tooluniverse.tool.gwas_search_snps`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-population-genetics/SKILL.md)；Apache-2.0；原文 SHA-256：`c4eca3d5f349f13bdf95ba6a64e62e0b488c1e700ad09af7badc9b1a6c8413bc`。
