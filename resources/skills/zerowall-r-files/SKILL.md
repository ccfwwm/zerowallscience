---
name: zerowall-r-files
description: 远程 R 项目文件上传、浏览、预览、下载与 SHA-256 校验。
allowed-tools: tool_search tool_dispatch
---

本地文件传输发现 r_files，通过 tool_dispatch 调用 upload_workspace/download_workspace。首次上传前确认文件与目的项目；下载核对 manifest 的大小和 SHA-256。不要把本地路径传给服务器文件读取。

通过 tool_search 发现 research_workflow，再用 tool_dispatch 调用该工具。workflow_id 为 r.files。先 action=describe 获取操作列表；再指定 operation 查看参数，实际执行由服务端目录校验。

```json
{"action":"describe","workflow_id":"r.files","operation":"r.list.directory"}
```

执行格式：action=run，workflow_id=r.files，parameters={"operation":"精确操作 ID","arguments":{},"request_id":"唯一请求标识"}。按 describe 的参数要求填写 arguments，不猜测工具名。变更操作仅在已确认范围内传 confirm=true。Skill 是说明，research_workflow 的注册执行器负责编排。

返回 run_id 后仅使用 action=status 查询；取消使用 action=cancel、run_id 和 confirm=true。同一提交重试复用 request_id；不因超时重新提交。返回失败时检查远程任务历史。结果以产物引用和 manifest 为准，不把排队或启动说成成功。rmcp 是唯一物理连接，不建立模块专属连接。
