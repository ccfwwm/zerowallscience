# 调用、任务与产物约定

## 三层参数与两种文件入口

`tool_dispatch.name` 是发现到的 Host 工具名。`research_workflow.action` 是流程动作。`parameters.operation` 是精确业务 ID，业务参数仅放在 `parameters.arguments`。`describe` 的 `operation` 放在顶层。

| 入口 | 作用 | 示例参数 |
|---|---|---|
| Host research_workflow | 目录和业务任务 | action、workflow_id、parameters |
| Host r_files | 工作区与服务器之间传输 | action=upload_workspace/download_workspace、local_path、remote_path、project_id |
| MCP mcp__rmcp__r_files | 服务器项目内文件操作 | action=r.list.directory、arguments={project_id,path} |

发现入口后，查询 R 环境的完整包装：

```json
{"name":"research_workflow","arguments":{"action":"query","workflow_id":"r.compute","parameters":{"operation":"r.runtime.capabilities","arguments":{}}}}
```

`query` 由服务端按副作用限制；下载数据、写文件、执行分析和管理操作走 `run`。旧调用通过 `run` 执行查询仍受支持。模型不能从名称猜测只读属性。

## 项目和路径

本地 `local_path` 是当前工作区相对路径。远程 `path`/`remote_path` 是项目相对路径。`data:OmicVerse/pbmc3k_raw.h5ad` 是 OmicVerse 的共享数据引用。FigureYa `module_id/source_path` 指向服务器安装的模板文件。四种路径不可互换。

写入或执行时可关联项目；只读操作不会创建项目。后续步骤复用返回的项目 ID。会话的本地 Run 不允许跨工作区读取。远程共享数据只读，产物写入所属项目；不直接向服务器传入 Windows 盘符。

## 标识符与重试

| ID | 生命周期 |
|---|---|
| Host run_id | research_workflow status/cancel；关联 Run Manager |
| R job_id | r.get.job/log/manifest |
| GEO download_job_id | r.geo.wait.download/get.download.log/cancel.download |
| GEO/NHANES analysis run_id | 对应 get.analysis.run/manifest |
| FigureYa plan_id | 保存的计划，不等于执行成功 |
| FigureYa run_id | figureya.get.job/get.manifest |
| OmicVerse job_id | 持久队列任务，可跨连接查询 |
| OmicVerse session_id、adata/class handle | 同一项目会话内有效；服务重启后按检查点恢复，类实例重建 |

同一提交的重试保持 `request_id` 不变；改变参数必须新 ID。提交结果未知时先查历史。不能将网络超时解释为远端取消，不能通过换 ID 自动重算。

`queued/running/paused/cancelling` 均不是成功。`succeeded` 后检查 Manifest 和必要输出；`failed/timed_out` 查看对应任务日志；取消与自然完成竞争时接受服务端实际终态。包查询、包管理、计划创建、文件操作可能同步结束，不要求不存在的远程 job_id。

## 文件传输与结果

小文件兼容原有 100 MiB 上传接口；大文件使用 Host 自动选择的分片通道，当前上限 20 GiB，4 MiB 分片，SHA-256 校验。相同内容、项目和目标路径可恢复同一上传。目标已有不同文件时换路径，不自动覆盖。下载分片写临时文件，完整校验后提交。

Manifest 的字节数、SHA-256 和项目路径是下载依据。R 脚本必须把正式结果写到 `Sys.getenv("R_PLATFORM_RESULT_DIR")`；OmicVerse Python 写 `OUTPUT_DIR`/当前输出目录。默认只返回摘要和引用，显式读取图片才返回图像内容。

## 确认与模型

`confirm`、大 GEO 下载的 `confirm_large`、客户端上传授权 `config.confirmRemoteUpload` 各自对应操作契约。沿用用户已有授权；扩大输入范围、目的地或管理动作时重新确认。模型不能填写凭据。Agent 使用当前 provider/model/API/endpoint；路由不匹配或缺凭据应报错，不静默切换模型。

## 动态能力与离线状态

`search` 用 offset/limit 翻页，`describe` 获得实时 schema、副作用、生命周期和可用条件。1,096 个 OmicVerse 公共 API 候选仅是覆盖盘点，不能当作实算通过数量。GPU、模型、输入、依赖缺失或上游禁用分别标明原因；离线目录仅供浏览。
