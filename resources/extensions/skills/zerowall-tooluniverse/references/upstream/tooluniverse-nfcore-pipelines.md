# nfcore pipelines

Run real end-to-end bioinformatics pipelines (nf-core rnaseq, sarek, atacseq) via Nextflow + Docker/Singularity, for raw FASTQ/BAM data — either local files or public GEO/SRA datasets. Use when someone asks to "run RNA-seq alignment", "quantify gene expression from FASTQs", "call germline or somatic variants from my WGS/WES data", "run an nf-core pipeline", "analyze ATAC-seq chromatin accessibility data", "reanalyze a GEO/SRA dataset (GSE/GSM/SRR accession)", "generate a samplesheet for nf-core", or "set up Nextflow to process my sequencing data". Orchestrates the full pipeline (alignment/quantification, or variant calling, or peak calling) rather than a single step. Honest: shells out to real Nextflow/Docker; checks the environment first and stops with install instructions rather than fabricating pipeline output; always runs the pipeline's small test profile before real data.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Honesty contract (read first)
- When to use vs. not
- Requirements (be upfront about these)
- Workflow Checklist
- Step 0: Acquire Data (GEO/SRA only)
- Step 1: Environment Check
- Step 2: Select Pipeline
- Step 3: Run Test Profile
- Step 4: Generate Samplesheet
- Step 5: Configure & Run
- Step 6: Verify Outputs
- Optional: benchmark a sarek run against Genome in a Bottle (GIAB)
- Disclaimer

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.GIAB_list_directory`
- `tooluniverse.tool.NCBI_SRA_get_download_urls`
- `tooluniverse.tool.NCBI_SRA_get_run_info`
- `tooluniverse.tool.NCBI_SRA_locate_run_files`
- `tooluniverse.tool.NCBI_SRA_search_runs`
- `tooluniverse.tool.SRA_get_experiment`
- `tooluniverse.tool.SRA_search_experiments`
- `tooluniverse.tool.geo_get_dataset_info`
- `tooluniverse.tool.geo_list_supplementary_files`
- `tooluniverse.tool.geo_search_datasets`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-nfcore-pipelines/SKILL.md)；Apache-2.0；原文 SHA-256：`66fc29d080b038a51b6edb0d712df3773f3f1416411e6aa0f7a84fefc0f6e494`。
