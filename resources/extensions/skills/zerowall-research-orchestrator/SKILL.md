---
name: zerowall-research-orchestrator
description: 在对话中自动管理 Study、问题、数据契约、分析方案、研究运行与恢复；用于连续科研编排，不用于普通文件查看或单次绘图。
metadata:
  zerowall:
    schema_version: 1
    version: 7.0.0-4
    source: bundled
---

科研任务开始时主动加载 zerowall-rmcp 及匹配的领域 Skill，并发现 `research_study` 与 `research_workflow` 的实时 schema。研究规划、执行、状态、证据和报告均在对话中通过 Host 工具完成；专用查看器仅在用户需要查看文件或可视化结果时由 `science_viewer_panel` 打开。Host 应按当前工作区和会话自动确保 Project、Study 并关联；不得要求用户进入独立界面登记或手动创建对象。优先复用当前会话已选 Study；不匹配的新目标由 Host 新建 Study。使用 `list` / `get` / `documents` 读取真实持久状态，不能仅根据聊天摘要推断研究对象。

Study 不存在时由 Host 静默幂等创建并关联当前会话。根据用户任务自动准备问题、数据契约及分析计划草稿；数据来源、变量或方法信息未知时明确标记 pending/unknown，不推造 usable 契约或可执行结果。Gate 1/2 只提供可继续执行的诊断和 warnings，不审批、不冻结、不要求补交材料，也不阻止 FAERS、NHANES、遗传、Fiji、远程 RMCP 运行、任务完成或报告生成。具体 Runner 仍校验必需 schema、参数、实际数据契约、权限和服务可用性。只有具体分析目标和参数已知才创建分析任务。

调用示例（替换真实 ID）：

```json
{
  "action": "create_document",
  "study_id": "实际研究ID",
  "kind": "observation",
  "payload": {
    "status": "unverified",
    "text": "用户报告的现象",
    "source": "user-statement"
  }
}
```

数据契约按 `zerowall-data-contract` 核验。计划使用实际契约 ID 的 inputs 数组，明确 method、stoppingConditions 和 exploratory；完整研究还需要预算、主要终点、候选集、调整集及方法前提。使用 `method_check_evaluate` 检查已知设计，检查无告警不等于获得执行批准。

任务图通过同一个 `research_study` Host 管理。先用 `{"action":"tasks","study_id":"实际研究ID"}` 和 `{"action":"task_budget","study_id":"实际研究ID"}` 读取状态；需要登记执行分支时使用 `create_task` 的 `task` 对象（name、kind、budget、可选 dependencies 和 exploratory）。任务状态只能按 Host 状态机推进，依赖未成功时不能启动。

远程计算可以把现有任务绑定到本地 Run：在 `research_workflow` 的 `run` 顶层传 `research_task_id`，不要把它塞入远程业务参数。绑定会在提交前检查同项目归属和研究预算；随后使用返回的本地 `run_id` 调用 `status`。断线时保留 `remote_id` 和暂停状态，先查询状态或历史；不要更换 `request_id` 重提。任务失败或阻断后的重试必须创建并绑定新的 Run。`task_budget` 的累计项是每次尝试的声明估算，不是实际 token 或费用计量；并发项在终态释放，累计项不会因失败返还。

兼容入口 `auto_gate1` / `auto_gate2` 只返回 `proceedable=true` 与 warnings，不修改 Gate 状态、不冻结计划。每次通用 Run、NHANES 或遗传请求会保存当时 Study 文档版本及 SHA-256；输入在运行期间变化时保留历史产物，但不把旧结果挂接到新的输入版本。报告请求的 `final` 模式可以直接生成；若有未审计主张或待复核证据，在正文和 Manifest 标记“未核验”及 warnings，不伪称 Gate 通过，也不降级为被门禁阻止的草稿。参数、权限、数据契约和服务错误仍明确失败。

具体计算复用 `research_workflow` 的实时 describe/run/status，以及 `r_files` 产物链路。保持 request_id；断网先按持久 Run 与远端 ID 对账。数值只能引用实际产物，保留失败和阴性结果；不要为了得到显著结果重复筛选。
