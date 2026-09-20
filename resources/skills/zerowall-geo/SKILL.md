---
name: zerowall-geo
description: GEO 数据检索、可用性检查、表达分析计划和结果导出。
allowed-tools: tool_search tool_dispatch
---

检索 accession 并检查矩阵、样本设计和数据可用性；下载公共数据后创建分析计划。读取计划参数再运行；单细胞优先异步服务端任务，保存 QC、归一化和批次信息。

通过 tool_search 发现 research_workflow，再用 tool_dispatch 调用该工具。workflow_id 为 r.geo。先 action=describe 获取操作列表；再指定 operation 查看参数，实际执行由服务端目录校验。

```json
{"action":"describe","workflow_id":"r.geo","operation":"r.geo.catalog"}
```

执行格式：action=run，workflow_id=r.geo，parameters={"operation":"精确操作 ID","arguments":{},"request_id":"唯一请求标识"}。按 describe 的参数要求填写 arguments，不猜测工具名。变更操作仅在已确认范围内传 confirm=true。Skill 是说明，research_workflow 的注册执行器负责编排。

返回 run_id 后仅使用 action=status 查询；取消使用 action=cancel、run_id 和 confirm=true。同一提交重试复用 request_id；不因超时重新提交。返回失败时检查远程任务历史。结果以产物引用和 manifest 为准，不把排队或启动说成成功。rmcp 是唯一物理连接，不建立模块专属连接。
