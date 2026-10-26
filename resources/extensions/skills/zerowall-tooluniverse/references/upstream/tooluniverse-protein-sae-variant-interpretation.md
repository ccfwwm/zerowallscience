# protein sae variant interpretation

Interpret a missense variant via ESMC-6B Sparse Autoencoder (SAE) feature activations. For a given protein + variant, computes which interpretable SAE features (catalytic, ligand-binding, PTM, structural motif, domain, etc.) are lost or gained at the mutation site. Use when standard pathogenicity scores (AlphaMissense, ClinVar) say a variant is damaging but you need a MECHANISTIC explanation — e.g. 'why is this variant LoF?' Complements (does not replace) variant-interpretation and variant-to-mechanism skills, which focus on ACMG classification or regulatory mechanism.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- When to use this skill
- Required inputs
- Workflow (5 steps)
- Step 1: Resolve gene → UniProt accession (if needed)
- Quick path (recommended for variant analysis): composite tool
- Step 5: Compute per-feature activation deltas
- Interpretation table
- Honest limitations
- Cross-validation pattern (recommended)
- Reporting format

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.AlphaMissense_get_variant_score`
- `tooluniverse.tool.ClinVar_get_variant_details`
- `tooluniverse.tool.ClinVar_search_variants`
- `tooluniverse.tool.ESM_API_KEY`
- `tooluniverse.tool.ESM_describe_sae_feature`
- `tooluniverse.tool.ESM_explain_variant_mechanism`
- `tooluniverse.tool.ESM_get_sae_features`
- `tooluniverse.tool.ESM_score_variant_sae_batch`
- `tooluniverse.tool.ESM_score_variant_sae_disruption`
- `tooluniverse.tool.UniProt_get_disease_variants_by_accession`
- `tooluniverse.tool.UniProt_get_function_by_accession`
- `tooluniverse.tool.UniProt_get_sequence_by_accession`
- `tooluniverse.tool.UniProt_search`
- `tooluniverse.tool.alphafold_get_prediction`
- `tooluniverse.tool.gnomad_get_variant`
- `tooluniverse.tool.gnomad_search_variants`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-protein-sae-variant-interpretation/SKILL.md)；Apache-2.0；原文 SHA-256：`308365b4038c7606f23562b5033cc292aa48136acfe6c44e74057c0be20b9b67`。
