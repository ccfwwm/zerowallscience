---
name: zerowall-research-orchestrator
description: 自动管理研究工作区、Study、问题、数据契约、分析方案、门禁与恢复；用于连续科研编排，不用于普通文件查看或单次绘图。
metadata:
  zerowall:
    schema_version: 1
    version: 7.0.0-1
    source: bundled
---

科研任务开始时主动加载 zerowall-rmcp 及匹配的领域 Skill，并发现 `research_study` 与 `research_workflow` 的实时 schema。Host 应按当前工作区和会话自动确保 Project、Study 并关联；不得要求用户先去工作台注册或手动创建对象。优先复用当前会话已选择且适用的未冻结 Study；冻结 Study 不改写，不匹配的新目标由 Host 新建草稿 Study。使用 `list` / `get` / `documents` 读取真实持久状态，不能仅根据聊天摘要推断是否冻结。

Study 不存在时由 Host 静默幂等创建并关联当前会话。根据用户任务自动准备问题、数据契约及分析计划草稿；数据来源、变量或方法信息未知时明确标记 pending/unknown，不推造 usable 契约或可执行结果。公共目录查询和授权范围内的数据检索/下载不等待正式分析门禁，数据到达后再更新草稿。只有具体分析目标和参数已知才创建分析任务。

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

当问题、计划、适用数据契约、输入、预算及方法校验均通过时，由 Host 以系统校验者身份自动记录 Gate 1 审批依据并冻结准确版本；记录校验规则版本、文档版本/摘要和冻结快照，明确显示为系统校验而非人工评审。确认性 Runner 只能使用匹配的冻结版本。证据齐全且所有相关 claim 的确定性审计通过时，Host 可自动记录 Gate 2 系统校验通过；证据缺失、冲突或审计失败时只产出草稿并结构化列明阻断项、受影响阶段和恢复条件。冻结后资料变化使用 amendment，不覆盖旧版本。真正的权限或科学阻断只暂停受影响阶段，仍继续可完成的检索、下载和草稿整理。

具体计算复用 `research_workflow` 的实时 describe/run/status，以及 `r_files` 产物链路。保持 request_id；断网先按持久 Run 与远端 ID 对账。数值只能引用实际产物，保留失败和阴性结果；不要为了得到显著结果重复筛选。
