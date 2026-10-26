# scvi tools

Deep learning for single-cell omics using scvi-tools — probabilistic (VAE-based) batch correction and integration with scVI, semi-supervised integration and label transfer with scANVI, CITE-seq RNA+protein joint modeling with totalVI, scATAC-seq analysis with PeakVI, multiome RNA+ATAC joint modeling with MultiVI, spatial transcriptomics cell-type deconvolution with DestVI, and RNA velocity with veloVI. Use when scVI, scANVI, totalVI, PeakVI, MultiVI, DestVI, or veloVI are mentioned by name, or when a request needs deep-learning-based batch correction, reference mapping / scArches-style query-to-reference mapping, denoising single-cell counts, joint modeling of two modalities (RNA+protein, RNA+ATAC, single-cell+spatial), or a variational-autoencoder latent space for single-cell data — as opposed to classic scanpy/Harmony-based integration.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Honesty contract (read first)
- When to Use This Skill
- Model Selection
- Workflow

推荐发现词：`scvi tools`。没有静态命中的工具时，通过实时关键词检索；不能推断工作流已实现。

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-scvi-tools/SKILL.md)；Apache-2.0；原文 SHA-256：`7c48346b4f96ffee222ab15b5907e1be01521c018bf7ac40717334d0768612c8`。
