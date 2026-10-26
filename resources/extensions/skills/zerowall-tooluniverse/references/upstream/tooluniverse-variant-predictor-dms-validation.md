# variant predictor dms validation

Validate a variant-effect predictor (AlphaMissense, ESM-C SAE, ESM logits, EVE, conservation scores, or any per-variant numeric score) against experimental deep mutational scanning (DMS) data. Computes per-variant predictor scores, splits variants into neutral vs disruptive groups by DMS effect, runs a Mann-Whitney U test on the predictor scores, and sweeps the stratification thresholds for robustness. Use when you need to know whether a predictor's scores track real functional disruption on a specific protein.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- When to use this skill
- Required inputs
- Workflow
- Step 1: Retrieve DMS as an effect matrix
- Step 2: Compute per-variant predictor scores
- Predictor option A — ESM-C 6B SAE (the worked example)
- Predictor option B — AlphaMissense (hegelab proxy: categorical, not per-substitution numeric)
- Predictor option C — ESM logits-based score
- Predictor option C2 — ESM-2 masked-marginal (keyless, no API key)
- Predictor option D — any external score
- Step 3: Stratify DMS into neutral vs disruptive
- Step 3.5 (MANDATORY): Pre-MWU sanity gate — catch silent NaN failures
- Step 4: One-sided Mann-Whitney U test
- Step 5: Robustness sweep
- Step 6: Visualize + interpret
- Interpretation
- Comparing two predictors
- Honest limitations

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.AlphaMissense_get_protein_scores`
- `tooluniverse.tool.AlphaMissense_get_residue_scores`
- `tooluniverse.tool.AlphaMissense_get_variant_score`
- `tooluniverse.tool.ESM2_score_missense_variant`
- `tooluniverse.tool.ESM_API_KEY`
- `tooluniverse.tool.ESM_get_sae_features`
- `tooluniverse.tool.ESM_score_sequence`
- `tooluniverse.tool.ESM_score_variant_sae_batch`
- `tooluniverse.tool.ESM_score_variant_sae_disruption`
- `tooluniverse.tool.MaveDB_get_effect_matrix`
- `tooluniverse.tool.Structure_annotate_per_residue`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-variant-predictor-dms-validation/SKILL.md)；Apache-2.0；原文 SHA-256：`1a33bde1fd2a563750473b40ede4c4aa18696f0ca2613b665ef1026af7acb4db`。
