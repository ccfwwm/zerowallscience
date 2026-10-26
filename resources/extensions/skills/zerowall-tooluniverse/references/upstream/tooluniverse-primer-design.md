# primer design

PCR / qPCR primer and oligo design — design forward/reverse primers for a target region (SantaLucia nearest-neighbor thermodynamics), compute melting temperature (Tm) and annealing temperature (Ta), check GC content, and screen an oligo for hairpins and primer-dimers. Use when you need primers for a sequence, want to QC an existing primer pair, or need the Tm of an oligo. Covers the primer-design rules (Tm matching, GC clamp, 3'-end, length) and the tools' constraint quirks.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- When to use this
- Step 1 — Design a primer pair
- Step 2 — Get Tm / annealing temperature for specific primers
- Step 3 — Primer design rules (what "good" looks like)
- Step 4 — Specificity (the tools do NOT do this)
- Step 5 — Common gotchas
- Honest limitations

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.DNA_calculate_gc_content`
- `tooluniverse.tool.DNA_primer_design`
- `tooluniverse.tool.IDT_analyze_oligo`
- `tooluniverse.tool.NEB_Tm_calculate`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-primer-design/SKILL.md)；Apache-2.0；原文 SHA-256：`75d22ce2b027609bd1709abc8d5207015f7c7d1a29be490d87304dbb8c559082`。
