---
name: zerowall-rplatform
description: 远程 R 计算、统计脚本和可复现项目任务。
allowed-tools: tool_search tool_dispatch
---

先检查运行时。提交脚本时工作流创建项目并记录任务 ID；用 status 跟踪完成后取回 manifest。保留 sessionInfo、代码与参数。

通过 tool_search 发现 research_workflow，再用 tool_dispatch 调用该工具。workflow_id 为 r.compute。先 action=describe 获取操作列表；再指定 operation 查看参数，实际执行由服务端目录校验。

```json
{"action":"describe","workflow_id":"r.compute","operation":"r.runtime.capabilities"}
```

执行格式：action=run，workflow_id=r.compute，parameters={"operation":"精确操作 ID","arguments":{},"request_id":"唯一请求标识"}。按 describe 的参数要求填写 arguments，不猜测工具名。变更操作仅在已确认范围内传 confirm=true。Skill 是说明，research_workflow 的注册执行器负责编排。

返回 run_id 后仅使用 action=status 查询；取消使用 action=cancel、run_id 和 confirm=true。同一提交重试复用 request_id；不因超时重新提交。返回失败时检查远程任务历史。结果以产物引用和 manifest 为准，不把排队或启动说成成功。rmcp 是唯一物理连接，不建立模块专属连接。
