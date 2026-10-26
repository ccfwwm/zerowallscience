# lab protocols

Find and inspect published, peer-reviewed or community lab protocols from protocols.io — search by technique/keyword, pull a protocol's full description and materials list, or get its ordered step-by-step instructions. Use when someone asks to "find a protocol for X", "how do others do [technique]", "get the steps for protocol [ID/DOI]", or "check the materials list for this method" before designing or running a wet-lab experiment. NOT for designing a novel cloning/assembly strategy from scratch (use tooluniverse-molecular-cloning), NOT for primer design (use tooluniverse-primer-design). Honest: protocols.io requires an OAuth Bearer token (PROTOCOLS_IO_API_KEY) for every call, including public reads — without it these tools are blocked, not degraded.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Honesty contract (read first)
- When to Use This Skill
- Workflow
- 1. Search for a protocol by technique/keyword
- 2. Get full detail for one protocol
- 3. Get the ordered steps
- Notes

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.PROTOCOLS_IO_API_KEY`
- `tooluniverse.tool.ProtocolsIO_get_protocol`
- `tooluniverse.tool.ProtocolsIO_get_protocol_steps`
- `tooluniverse.tool.ProtocolsIO_search_protocols`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-lab-protocols/SKILL.md)；Apache-2.0；原文 SHA-256：`ecb8cf488472cf862505e1c7672d04787da57977677d52dcc071cabd3ecd4459`。
