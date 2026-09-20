# 场景与失败恢复

## 本地文件往返

前提：当前工作区有 `input/counts.csv`，本次传输已经在用户授权范围内。下面是交给 `tool_dispatch` 的 Host 包装，路径和确认字段在 Host 顶层。

```json
{"name":"r_files","arguments":{"action":"upload_workspace","project_id":"rmcp-demo","local_path":"input/counts.csv","remote_path":"inputs/counts.csv","confirm":true}}
```

成功返回 `projectId/localPath/remotePath/bytes/sha256`；大文件还返回 `transferId`。保存这些字段，再按返回的远程路径下载：

```json
{"name":"r_files","arguments":{"action":"download_workspace","project_id":"rmcp-demo","remote_path":"inputs/counts.csv","local_path":"output/counts-return.csv"}}
```

比较上传与下载的 `bytes/sha256`，确认内容一致。100 MiB 以上上传自动走分片恢复，当前最多 20 GiB；下载流式写入临时文件并验证校验和。网络中断后复用相同项目、路径和内容；目标文件冲突时选择新路径。

查看服务器文件则使用工作流，不传 local_path：

```json
{"name":"research_workflow","arguments":{"action":"query","workflow_id":"r.files","parameters":{"operation":"r.list.directory","arguments":{"project_id":"rmcp-demo","path":"inputs"}}}}
```

模板源文件使用 `download_figureya_module`，传 `module_id` 和本地相对目录 `local_path`；不把模板的服务器绝对路径作为项目路径。

需要跨本地/远程传输时选择 Host r_files；服务器已有文件查询使用本工作流。FigureYa 模板文件属于服务器安装目录，使用专用下载动作。

Windows 路径不能作为远程 path。本地 local_path 必须在当前工作区内且为相对路径；远程 path 为项目相对路径。复用返回的 project_id、path，不猜绝对路径。

文件写入同步完成，没有远程 job_id；下载必须核对字节数及 SHA-256。

文件传输不会创建计算 Run，直接检查 Host 返回结果。`../`、跨盘符、符号链接和工作区之外路径会被拒绝；将文件放在授权工作区后重试，不扩大根目录。SHA-256 不符时保留远程 Manifest 并重新下载到新路径；不使用未完成的临时文件。重复上传同一文件复用 transferId，内容改变需重新计算校验和，不能沿用旧分片。
