---
name: zerowall-rmcp
description: 远程科研总导航：相关 R、生信、GEO、NHANES、FAERS 药物警戒与 OmicVerse 请求默认主动路由到远程 RMCP，并明确发现、参数、任务和结果规范。
allowed-tools: read
---

# 远程科研入口

所有模块共享一个物理连接 `rmcp`。涉及 R、统计、生信、GEO、NHANES、FAERS 药物警戒、遗传或 OmicVerse 的请求应主动加载本导航和匹配的专项 Skill，发现 Host `research_workflow` / `r_files` 并按实时 schema 调用；R 计算默认远程运行。连接状态未知时调用 `mcp_connect`，再使用实际发现的工具 schema。`mcp__rmcp__*` 是底层转发工具，不是独立连接。远程连接失败时不得静默改成本地 R；可继续独立检索与准备，说明阻断步骤和恢复方法。

| 用户任务 | Skill | workflow_id |
|---|---|---|
| R 脚本、项目、报告、论文复现 | zerowall-rplatform | r.compute |
| 上传、下载、目录、Manifest | zerowall-r-files | r.files |
| R 包查询、管理员包变更 | zerowall-r-packages | r.packages |
| GEO 数据、bulk、R 单细胞 | zerowall-geo | r.geo |
| NHANES 周期、复杂抽样分析 | zerowall-nhanes | r.nhanes |
| FAERS 药物警戒、比例失衡、联合用药 | zerowall-faerskit | r.faerskit |
| 科学资源发现、文献、基因蛋白、药物与临床精确查询 | zerowall-tooluniverse | tooluniverse |
| Biomni 专项工具、数据湖、Agent | zerowall-rbioagent | biomni |
| 已安装绘图模板、计划、图表 | zerowall-rplotfigure | figureya |
| 单细胞虚拟敲除科学编排 | sc-tenifold-knockout | sc.knockout |
| AnnData、单细胞、空间、多组学 | zerowall-omicverse | omicverse |

## 首次调用

`research_workflow` 自动处理远程项目绑定。每个对话绑定独立项目，只在同一对话内复用，不按用户或工作区跨对话共用。调用时省略 `project_id`，由 Host 在 RMCP 后端自动获取项目；不要要求用户查找、填写或确认项目 ID。后续操作和下载沿用该对话绑定，重连不新建分析任务。

Host tool registry 输入 `{"query":"research_workflow"}`。然后交给 the native tool：

```json
{
  "action": "search",
  "workflow_id": "r.compute",
  "query": "script",
  "offset": 0,
  "limit": 25
}
```

```json
{
  "action": "describe",
  "workflow_id": "r.compute",
  "operation": "r.submit.script"
}
```

```json
{
  "action": "run",
  "workflow_id": "r.compute",
  "parameters": {
    "operation": "r.submit.script",
    "arguments": {
      "code": "writeLines(capture.output(sessionInfo()), file.path(Sys.getenv('R_PLATFORM_RESULT_DIR'), 'session-info.txt'))",
      "confirm": true
    },
    "request_id": "runtime-demo-1"
  }
}
```

`research_workflow` 选 Host 工具；`action` 选流程动作；`workflow_id` 选模块；`parameters.operation` 选业务能力，业务参数放 `parameters.arguments`。`describe.operation` 是顶层字段，不能套用 run 包装。

## 结果与约定

需要区分入口、标识符或断点续传时读取 [共同约定](references/conventions.md)。参考目录相对 Skill 返回的 `resourceBase.path` 定位。

- `query` 仅接受服务端声明的只读能力，不创建计算 Run；副作用与 confirm 是否存在是不同概念。
- `run` 返回本地 `run_id`，用 `status` 跟踪；远端 `job_id`、分析 `run_id`、下载 `download_job_id`、`plan_id` 各有用途。同步操作直接结束，不虚构远程任务。
- 同一提交重试复用 `request_id`。连接中断先查状态/历史；改变参数必须新 ID。
- Host 按当前工作区自动创建或复用并关联 Project/Study，复用服务返回的项目和路径；公共目录查询及授权范围内的检索、下载不因缺项目或分析门禁而中断。
- `confirm`、GEO 的 `confirm_large`、客户端 `config.confirmRemoteUpload` 分属不同契约。按既有授权范围执行，扩大数据传输范围时重新处理授权；主动路由不代表扩大上传、受限数据访问或管理权限。
- 凭据由设置及 Host 管理。仅 Agent 或明确 LLM 能力转发当前模型，不把 key 写进参数、提示词或文件。
- 终态成功还需验证必要产物；默认返回摘要和 Manifest。图片显式读取，大文件由 Host 传输。
- `offline=true` 仅允许浏览快照；注册或导入检查不等于实算验证。GPU、模型、依赖缺失和上游禁用必须如实报告。

按所选模块 Skill 的 `resourceBase` 读取 `references/operations.md`（完整目录）、`examples.json`（结构化调用）、`scenarios.md`（场景）和 `data-formats.md`（数据约定），不硬编码安装目录。
