# protein lof mechanism

Propose the mechanism by which a missense variant causes loss-of-function (LoF), synthesizing evidence from 5 independent layers: AlphaMissense pathogenicity, AlphaFold structural context, ESMC sequence likelihood, SAE feature disruption, and DynaMut2 stability ΔΔG. Distinguishes 'structural stability LoF' (mis-folding) from 'direct functional disruption' (catalytic / binding / PTM site damage). Use for coding missense variants where you need a mechanistic causal model, not just a pathogenicity score.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- When to use this skill
- Required inputs
- Workflow
- Step 0: Resolve accession + fetch canonical sequence
- Step 1: AlphaMissense pathogenicity
- Step 2: AlphaFold structural context
- Step 3: ESMC sequence likelihood
- Step 4: SAE feature disruption (the unique signal)
- Step 5: DynaMut2 stability (ΔΔG)
- Step 6: Synthesis — decide the LoF mechanism category
- Step 7: Honest evidence grading
- Reporting format
- Honest limitations
- Optional: ThermoMPNN instead of DynaMut2 (advanced users with GPU)
- Hosted SaaS (no GPU, but registration + API key required)
- When ThermoMPNN actually matters over DynaMut2

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.AlphaMissense_get_variant_score`
- `tooluniverse.tool.DynaMut2_predict_stability`
- `tooluniverse.tool.ESM_API_KEY`
- `tooluniverse.tool.ESM_describe_sae_feature`
- `tooluniverse.tool.ESM_explain_variant_mechanism`
- `tooluniverse.tool.ESM_score_sequence`
- `tooluniverse.tool.ESM_score_variant_sae_disruption`
- `tooluniverse.tool.UniProt_get_entry_by_accession`
- `tooluniverse.tool.UniProt_get_sequence_by_accession`
- `tooluniverse.tool.UniProt_search`
- `tooluniverse.tool.alphafold_get_prediction`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-protein-lof-mechanism/SKILL.md)；Apache-2.0；原文 SHA-256：`9298619e738b8107c1e10f17589cc22f5eb2d5228395346385f9aa579bfb8721`。
