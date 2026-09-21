---
name: zerowall-research-orchestrator
description: 管理已建立研究的问题、数据契约、分析方案与恢复；用于连续科研编排，不用于普通文件查看或单次绘图。
---

先发现 `research_study` 并调用 `{"action":"list"}`。Host 以当前真实会话解析项目；不要猜测或借用其他项目 ID。使用 `get` / `documents` 加 `study_id` 读取持久状态，不能仅根据聊天摘要推断是否冻结。

研究尚未建立时，在科研工作台新建或建立肥胖—脱发先导模板。当前工具支持读取以及四类提案记录：observation、question、dataset-contract、analysis-plan；不支持用模型直接登记计算证据、批准主张或代替人工门禁。

调用示例（替换真实 ID）：

```json
{"action":"create_document","study_id":"实际研究ID","kind":"observation","payload":{"status":"unverified","text":"用户报告的现象","source":"user-statement"}}
```

数据契约按 `zerowall-data-contract` 核验。计划使用实际契约 ID 的 inputs 数组，明确 method、stoppingConditions 和 exploratory；完整研究还需要预算、主要终点、候选集、调整集及方法前提。使用 `method_check_evaluate` 检查已知设计，检查无告警不等于获得执行批准。

任务图通过同一个 `research_study` Host 管理。先用 `{"action":"tasks","study_id":"实际研究ID"}` 和 `{"action":"task_budget","study_id":"实际研究ID"}` 读取状态；需要登记执行分支时使用 `create_task` 的 `task` 对象（name、kind、budget、可选 dependencies 和 exploratory）。任务状态只能按 Host 状态机推进，依赖未成功时不能启动。

远程计算可以把现有任务绑定到本地 Run：在 `research_workflow` 的 `run` 顶层传 `research_task_id`，不要把它塞入远程业务参数。绑定会在提交前检查同项目归属和研究预算；随后使用返回的本地 `run_id` 调用 `status`。断线时保留 `remote_id` 和暂停状态，先查询状态或历史；不要更换 `request_id` 重提。任务失败或阻断后的重试必须创建并绑定新的 Run。`task_budget` 的累计项是每次尝试的声明估算，不是实际 token 或费用计量；并发项在终态释放，累计项不会因失败返还。

门禁一由用户在工作台复核问题、数据、计划和预算后冻结；门禁二由用户复核支持、冲突和缺口后认可主张。冻结资料变更通过 amendment，不覆盖旧版本。尚未实现的执行/回传环节必须如实报告。

具体计算复用 `research_workflow` 的实时 describe/run/status，以及 `r_files` 产物链路。保持 request_id；断网先按持久 Run 与远端 ID 对账。数值只能引用实际产物，保留失败和阴性结果；不要为了得到显著结果重复筛选。
