# fastq qc

FASTQ quality control and adapter/quality-trimming decisions with local NGS tools — run FastQC on raw reads, summarize a project with MultiQC, interpret per-base sequence quality, per-base N content, adapter content, overrepresented sequences, sequence duplication and GC content, and decide whether (and how) to trim with fastp / Cutadapt before downstream analysis. seqkit for read counts/stats/subsampling. Use when someone asks "run QC on my FASTQs", "are my reads good quality?", "do I need to trim adapters?", "interpret this FastQC report", "what does this WARN/FAIL mean", "why are overrepresented sequences flagged", "should I quality-trim before alignment", "make a MultiQC summary", or "clean up these reads with fastp". NOT for differential expression / DEG analysis (use tooluniverse-rnaseq-deseq2), NOT for read alignment, coverage, or variant calling (use tooluniverse-variant-analysis / tooluniverse-sequence-analysis). Honest: shells out to real local binaries; if a tool is missing it emits an install plan and stops rather than inventing QC numbers, and it never auto-trims or overwrites raw FASTQs.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Honesty contract (read first)
- When to use vs. not
- Essential inputs to confirm
- Preflight (do this first, every time)
- Tool roles
- Bundled orchestration script
- INTERPRETATION — FastQC module -> meaning -> action
- Workflow
- Limitations (honest)
- Completeness checklist

推荐发现词：`fastq qc`。没有静态命中的工具时，通过实时关键词检索；不能推断工作流已实现。

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-fastq-qc/SKILL.md)；Apache-2.0；原文 SHA-256：`7c423d601518cd0cfc3e9ae426fe9094707c3030f5d906e3f270de5f4bdc2d62`。
