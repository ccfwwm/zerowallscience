---
name: zerowall-tooluniverse
description: 通过远程 RMCP 发现与精确调用科学资源工具，查询文献、基因蛋白、药物化学、疾病临床及数据计算资源，跟踪任务并下载可核验产物。
allowed-tools: read
---

# ToolUniverse 科学资源

使用 Host `research_workflow`，固定 `workflow_id=tooluniverse`，物理连接为 `rmcp`。连接未知时先发现并调用 `mcp_connect`。ToolUniverse 负责科学资源发现和精确查询；已建立的 Biomni 专项流程、数据湖与 Agent 继续使用 `biomni`；AnnData、单细胞、空间与多组学分析使用 `omicverse`；R 统计分析使用相应 R 模块。

按任务读取一个领域参考：[文献](references/literature.md)、[基因与蛋白](references/genes-proteins.md)、[药物与化学](references/drugs-chemistry.md)、[疾病与临床](references/disease-clinical.md)、[数据与计算](references/data-computing.md)。静态操作及生命周期来自 [服务端注册](references/operations.md)，不能把离线目录当成在线验证结果。

1. 用 `action=search`、关键词及 `offset/limit` 发现目录；缺密钥和缺依赖的工具仍可发现。状态查询用 `action=query`、`workflow_id=tooluniverse`、`operation=tooluniverse.status`，`parameters` 留空；旧客户端的 `status` 别名也受支持。不要把 `status` 当成能力 ID，也不要把项目 ID 传给状态操作。需要精确底层 schema 时用 `action=describe` 和完整原始 ID，例如 `tooluniverse.tool.UniProt_get_entry_by_accession`。保留大小写和下划线。
2. 检查 `availability`、`available`、`conditionally_available`、`verification`、`blockers`、`required_credentials` 和 `input_schema`。`requires_credentials` 表示只缺本次请求的可信凭据；配置凭据后可执行。`requires_runtime_check` 表示依赖条件满足但尚未逐项实测，不等于已验证。`blocked` 和 `upstream_broken` 才表示当前不能执行，并会列出前置条件或上游原因。管理员关闭模块、缺依赖、GPU、模型、执行审查或失效 API 时按具体原因处理，不替代为虚构结果。首期没有 ToolUniverse 自治 Agent。
3. 资源查询属于探索性工作：先用 `research_study` 的 `action=create_task` 创建 `exploratory=true` 的资源检索任务，再将返回的 `task.id` 填入 `parameters.research_task_id`。确认性统计分析仍需完整方案和研究门禁，不得通过探索性标记规避。用 `research_workflow` 的 `action=run` 提交；业务参数放在 `parameters.arguments.tool_arguments`。Host 创建项目并注入远程 `request_id`；顶层 `parameters.request_id` 为提交幂等键，同一提交重试复用，参数改变使用新键。凭据只在设置中保存引用，由可信 Host 按任务发送；不得写入参数、聊天或文件。
4. 保存本地 `run_id`，用 `action=status` 刷新状态并取得成功任务的 Manifest，必要时用 `action=cancel`。需要远端短等待时，通过 `action=query` 调用 `tooluniverse.wait.job`，传入项目及远程 job_id。取消及超时为终态；服务重启中断的任务不自动重放。连接中断先按原提交查询任务历史。
5. 成功后核对实际记录身份、来源、查询时间和版本。读取 Manifest，用 Host `r_files`、`source=project` 和 `project_artifact_path` 下载至工作区并核对 SHA-256。大结果在文件中，摘要不能代替完整记录。

```json
{"action":"search","workflow_id":"tooluniverse","query":"UniProt accession","offset":0,"limit":25}
```

```json
{"action":"query","workflow_id":"tooluniverse","operation":"tooluniverse.status","parameters":{}}
```

```json
{"action":"describe","workflow_id":"tooluniverse","operation":"tooluniverse.tool.UniProt_get_entry_by_accession"}
```

检查实时 schema 后的提交示例：

```json
{"action":"create_task","target":"检索 UniProt P05067 的原始蛋白记录并核对来源","task":{"name":"UniProt 来源查询","kind":"resource-retrieval","exploratory":true,"budget":{"remoteThreads":1}}}
```

上一步使用 `research_study`；下一步使用 `research_workflow`，把 `<task.id>` 替换为实际返回的任务 ID：

```json
{"action":"run","workflow_id":"tooluniverse","parameters":{"operation":"tooluniverse.run.tool","research_task_id":"<task.id>","arguments":{"tool_name":"UniProt_get_entry_by_accession","tool_arguments":{"accession":"P05067","compact":true},"confirm":true},"request_id":"uniprot-p05067-1"}}
```

领域参考改写自固定上游科学工作流，并统一转为远程 RMCP 调用；不在科研流程安装软件、发布工具或配置共享电脑。来源及许可证见 [UPSTREAM.json](UPSTREAM.json) 和 [LICENSE](LICENSE)。
