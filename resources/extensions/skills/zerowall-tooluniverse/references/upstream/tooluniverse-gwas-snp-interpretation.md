# gwas snp interpretation

Interpret a single GWAS SNP across multiple databases — GWAS Catalog hits, LD/haplotype context, eQTL evidence, regulatory annotation, ClinVar pathogenicity, gnomAD frequency. Use for 'what does this SNP do', SNP-to-mechanism tracing, and resolving lead-SNP-vs-causal-variant ambiguity. Always considers LD structure before claiming a SNP is mechanistically responsible.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Overview
- What It Does
- Workflow
- Data Sources
- GWAS Catalog (EMBL-EBI)
- Open Targets Genetics
- Input Parameters
- Required
- Optional
- Output Format
- 1. SNP Basic Info
- 2. Trait Associations
- 3. Credible Sets (Fine-Mapping)
- 4. Clinical Significance
- Example Usage
- Tools Used
- GWAS Catalog Tools
- Open Targets Tools
- Interpretation Guide
- P-value Significance Levels
- L2G Score Interpretation
- Clinical Actionability
- Limitations
- Best Practices

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.LDLINK_TOKEN`
- `tooluniverse.tool.LDlink_get_proxies`
- `tooluniverse.tool.OpenTargets_get_variant_credible_sets`
- `tooluniverse.tool.OpenTargets_get_variant_info`
- `tooluniverse.tool.gwas_get_associations_for_snp`
- `tooluniverse.tool.gwas_get_snp_by_id`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-gwas-snp-interpretation/SKILL.md)；Apache-2.0；原文 SHA-256：`77731a712ce3838d03853298acaae0859f19986ee4f2998e6b0a6dfa480dd74b`。
