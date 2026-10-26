# lab data standardization

Convert lab instrument output files (CSV, TSV, Excel, PDF — plate readers, spectrophotometers like NanoDrop, qPCR instruments, cell counters, chromatography systems) into a standardized Allotrope-Simple-Model-inspired JSON document plus a flattened 2D CSV, for LIMS/ELN upload or downstream analysis. Use when someone asks to "convert this instrument file", "standardize this lab data", "prepare this for LIMS upload", "what format is this plate reader/NanoDrop/qPCR output in", "turn this CSV into ASM/Allotrope format", or "separate the raw and calculated values in this instrument export". NOT for general data wrangling of arbitrary tabular data unrelated to lab instruments (use tooluniverse-data-wrangling), NOT for genomics/proteomics-specific file formats like FASTQ/VCF/mzML (use tooluniverse-fastq-qc, tooluniverse-variant-analysis, or tooluniverse-proteomics-analysis). Honest: never fabricates a measurement value; if a vendor's native parser (allotropy) is unavailable it says so and falls back to a generic tabular parser that clearly flags itself as non-certified.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Honesty contract (read first)
- When to use vs. not
- Two-tier conversion strategy
- Workflow

推荐发现词：`lab data standardization`。没有静态命中的工具时，通过实时关键词检索；不能推断工作流已实现。

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-lab-data-standardization/SKILL.md)；Apache-2.0；原文 SHA-256：`c2be8d971a9aa6c2819c17423e6ca22feb37dbcb250a7fb7459b9f396a2e310f`。
