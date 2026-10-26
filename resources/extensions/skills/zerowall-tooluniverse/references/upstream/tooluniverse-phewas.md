# phewas

Cross-ancestry / cross-biobank phenome-wide association (PheWAS) and replication. Given ONE variant (rsID) or ONE gene, look up every phenotype it associates with across European/UK (UKB-TOPMed), Finnish (FinnGen), Japanese (BioBank Japan), and Taiwanese (TPMI) biobanks, plus exome-wide gene-burden PheWAS (Genebass), then judge whether an association replicates across ancestries or is population-specific. Use whenever the user asks "what else is this variant/gene associated with", "does this association replicate in other ancestries / biobanks", "is this effect East-Asian-specific", "pleiotropy of rsXXX", "phenome scan", or wants to compare effect sizes/allele frequencies of a variant across populations. NOT for the forward direction (trait → which SNPs: use the gwas-* skills), NOT for fine-mapping a locus (use tooluniverse-gwas-finemapping), and NOT for single-SNP mechanism tracing in one population (use tooluniverse-gwas-snp-interpretation).

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- The biobank panel
- Workflow
- Step 1 — Decide variant-level vs gene-level
- Step 2 — Query the panel in parallel
- Step 3 — Align phenotypes across biobanks
- Step 4 — Judge replication (see interpretation table)
- Step 5 — Report
- Interpretation
- Report structure
- Worked example (rs7903146, TCF7L2)
- Limitations

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.BioBankJapan_phewas_by_variant`
- `tooluniverse.tool.FinnGen_get_variant_finemapping`
- `tooluniverse.tool.Genebass_gene_burden_phewas`
- `tooluniverse.tool.TPMI_phewas_by_variant`
- `tooluniverse.tool.UKBTOPMed_phewas_by_variant`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-phewas/SKILL.md)；Apache-2.0；原文 SHA-256：`55b8479835f8b7a7eeff08a898440006d3f9d95d404137ce8a0c4fc9f0a45afc`。
