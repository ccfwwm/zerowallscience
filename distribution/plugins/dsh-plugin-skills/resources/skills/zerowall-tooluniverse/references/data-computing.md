# 数据与计算资源

检索词：dataset、Zenodo、GEO、statistics、calculator。先检索数据资源、许可证、版本、样本与文件摘要，再决定是否进入专项分析。GEO 下载与分析使用 r.geo，NHANES 复杂抽样使用 r.nhanes，AnnData 与组学分析使用 omicverse，通用 R 使用 r.compute。

ToolUniverse 统计或计算工具只在依赖和参数检查通过后执行。首期为独立 CPU 的 base,stats 配置；任意文件、URL、代码、远程服务管理或自治 Agent 工具需要专用适配，不在通用入口直接执行。缺包不在任务中临时安装。结果记录参数、版本、来源和查询时间，通过项目 Manifest 下载；不要把工具目录的包介绍当成已安装软件。

固定上游的相关研究任务可按需从[工作流导航](upstream/data-computing.md)选择。每个摘要保留原文链接、摘要 SHA-256、阶段结构和固定 SDK 工具候选，执行仍以实时 schema 为准。
