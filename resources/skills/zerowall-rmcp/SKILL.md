---
name: zerowall-rmcp
description: 远程科研总导航：选择 R、文件、包、GEO、NHANES、Biomni、FigureYa、scTenifold 或 OmicVerse，明确发现、参数、任务和结果规范。
allowed-tools: tool_search tool_dispatch read
---

# 远程科研入口

所有模块共享一个物理连接 `rmcp`。默认业务工具为 Host `research_workflow`，本地文件传输为 Host `r_files`。先用 `tool_search` 搜索并发现精确工具，再由 `tool_dispatch` 调用。`mcp__rmcp__*` 是底层转发工具，不是独立连接。

| 用户任务 | Skill | workflow_id |
|---|---|---|
| R 脚本、项目、报告、论文复现 | zerowall-rplatform | r.compute |
| 上传、下载、目录、Manifest | zerowall-r-files | r.files |
| R 包查询、管理员包变更 | zerowall-r-packages | r.packages |
| GEO 数据、bulk、R 单细胞 | zerowall-geo | r.geo |
| NHANES 周期、复杂抽样分析 | zerowall-nhanes | r.nhanes |
| 生物精确工具、数据湖、Agent | zerowall-rbioagent | biomni |
| 已安装绘图模板、计划、图表 | zerowall-rplotfigure | figureya |
| 单细胞虚拟敲除科学编排 | sc-tenifold-knockout | sc.knockout |
| AnnData、单细胞、空间、多组学 | zerowall-omicverse | omicverse |

## 首次调用

`tool_search` 输入 `{"query":"research_workflow"}`。然后交给 `tool_dispatch`：

```json
{"name":"research_workflow","arguments":{"action":"search","workflow_id":"r.compute","query":"script","offset":0,"limit":25}}
```

```json
{"name":"research_workflow","arguments":{"action":"describe","workflow_id":"r.compute","operation":"r.submit.script"}}
```

```json
{"name":"research_workflow","arguments":{"action":"run","workflow_id":"r.compute","parameters":{"operation":"r.submit.script","arguments":{"project_id":"rmcp-demo","code":"writeLines(capture.output(sessionInfo()), file.path(Sys.getenv('R_PLATFORM_RESULT_DIR'), 'session-info.txt'))","confirm":true},"request_id":"runtime-demo-1"}}}
```

`tool_dispatch.name` 选 Host 工具；`action` 选流程动作；`workflow_id` 选模块；`parameters.operation` 选业务能力，业务参数放 `parameters.arguments`。`describe.operation` 是顶层字段，不能套用 run 包装。

## 结果与约定

需要区分入口、标识符或断点续传时读取 [共同约定](references/conventions.md)。参考目录相对 Skill 返回的 `resourceBase.path` 定位。

- `query` 仅接受服务端声明的只读能力，不创建计算 Run；副作用与 confirm 是否存在是不同概念。
- `run` 返回本地 `run_id`，用 `status` 跟踪；远端 `job_id`、分析 `run_id`、下载 `download_job_id`、`plan_id` 各有用途。同步操作直接结束，不虚构远程任务。
- 同一提交重试复用 `request_id`。连接中断先查状态/历史；改变参数必须新 ID。
- 项目写操作可创建或复用关联项目；只读操作缺项目会明确报错。复用服务返回的项目和路径。
- `confirm`、GEO 的 `confirm_large`、客户端 `config.confirmRemoteUpload` 分属不同契约。按既有授权范围执行，扩大数据传输范围时重新处理授权。
- 凭据由设置及 Host 管理。仅 Agent 或明确 LLM 能力转发当前模型，不把 key 写进参数、提示词或文件。
- 终态成功还需验证必要产物；默认返回摘要和 Manifest。图片显式读取，大文件由 Host 传输。
- `offline=true` 仅允许浏览快照；注册或导入检查不等于实算验证。GPU、模型、依赖缺失和上游禁用必须如实报告。

按所选模块 Skill 的 `resourceBase` 读取 `references/operations.md`（完整目录）、`examples.json`（结构化调用）、`scenarios.md`（场景）和 `data-formats.md`（数据约定），不硬编码安装目录。
