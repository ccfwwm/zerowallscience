---
name: zerowall-nhanes
description: NHANES 变量、周期、复杂抽样统计及可复现报告。
allowed-tools: tool_search tool_dispatch read
---

# NHANES 变量、周期、复杂抽样统计及可复现报告。

调查统计保留 R survey 链路。跨模块共享结果表，不把普通无权回归当成 NHANES 复杂抽样结果。

## 功能地图

周期/数据集/变量/codebook；数据补齐与缓存；SEQN 合并与跨周期；调查加权描述和回归；生存、混合模型、多重插补、倾向评分和 meta 分析；图表报告。

## 入口与准备

先 `tool_search` 搜索 `research_workflow`，使用返回的真实工具名和 schema。下列 JSON 是交给 `tool_dispatch` 的完整包装；不要把工作流 ID 当工具名。只有一条物理连接 `rmcp`，工作流按需连接。

查询 schema：`action=describe`，精确 ID 放顶层 `operation`。业务调用：`action=query/run`，精确 ID 放 `parameters.operation`，业务参数放 `parameters.arguments`。只读 query 不创建 Run、不需要 request_id；run 必须有唯一 request_id，同一提交重试复用，参数变化换新 ID。`offline=true` 的 describe 仅浏览本地快照，不能证明在线能力可用。

工作流 ID：`r.nhanes`。必须选择与研究指标匹配的权重，并记录 PSU=SDMVPSU、strata=SDMVSTRA；多周期权重调整、缺失值与纳排条件需写入分析计划。

## 首次调用

```json
{
  "name": "research_workflow",
  "arguments": {
    "action": "describe",
    "workflow_id": "r.nhanes",
    "operation": "r.nhanes.catalog"
  }
}
```
```json
{
  "name": "research_workflow",
  "arguments": {
    "action": "query",
    "workflow_id": "r.nhanes",
    "parameters": {
      "operation": "r.nhanes.catalog",
      "arguments": {}
    }
  }
}
```

确认实际输入和范围后，以下执行示例可提交至专用演示项目。

```json
{
  "name": "research_workflow",
  "arguments": {
    "action": "run",
    "workflow_id": "r.nhanes",
    "parameters": {
      "operation": "r.nhanes.ensure.available",
      "arguments": {
        "project_id": "rmcp-demo",
        "cycle": "2017-2018",
        "domain": "Demographics",
        "dataset": "DEMO_J"
      },
      "request_id": "demo-r-nhanes-1"
    }
  }
}
```

返回本地 `run_id` 后替换下面的 `<run_id>`：

```json
{
  "name": "research_workflow",
  "arguments": {
    "action": "status",
    "run_id": "<run_id>"
  }
}
```

## 返回与恢复

ensure.available 可启动下载，虽无 confirm 也不是 query。datasets.ensure_available=true 同样可能写缓存；此类分析使用 run。

正式研究分析通过 `research_study` 的 `run_nhanes_survey` 执行。先登记 DatasetContract、研究任务和 AnalysisPlan；工作台“研究计划”页也能选择同一记录并执行。

```json
{"name":"research_study","arguments":{"action":"run_nhanes_survey","study_id":"<study-id>","contract_id":"<saved-contract-id>","plan_id":"<saved-plan-id>","task_id":"<plan-task-id>","expected_revision":1,"request_id":"<stable-request-id>"}}
```

以上 ID 与版本必须替换为真实登记记录。计划的 `inputs` 首版仅引用本次契约，`taskIds` 包含任务 ID，`nhanesSurvey` 为 `{ "kind":"summary", "variable":"RIDAGEYR" }` 或 `{ "kind":"regression", "outcome":"…", "predictors":["…"], "family":"gaussian" }`，并保存 `method`、`stoppingConditions`、`exploratory`。任务的探索身份必须与计划一致。验证任务须经人工门禁一且计划、契约与冻结快照一致。

契约必须记录 `applicability=usable`、`sourceStatus=supported`、真实 `source`、`fullDataset=true`、`previewTruncated=false`。`datasets` 每项含周期、component、dataset、weight、codebook；设计含明确的 key、weight、strata、psu、availableVariables、specialMissingCodes（无特殊码也显式 []）、isolatedPsuHandling、lonelyPsu。多组件说明 `componentWeightRationale`；多周期选 `cycleStrategy`，正式合并还要 `combinedWeightSource` 与逐周期 `cycleWeightMultipliers`。子人群用 `domainDesign=survey-domain`、可读 `domainExpression` 和 `{variable,operator,value}` 数组 `surveyDomain`，只支持 eq/gte/lte；不能预过滤原始样本后伪装完整调查设计。DXX_H 必须在代码本年龄范围内，并显式应用 RIDAGEYR 下限和上限。Unknown 信息不能补写成已验证。

Host 将这些记录编译成 `7.0.0-nhanes-survey.1` 严格契约，通过现有 `r.nhanes` 执行。该操作同步返回统计结果，远程 job ID 可以为空，但本地 Run、manifest Artifact 和待复核 evidence 必须实存。后端未认证严格契约时保留产物、禁止登记为已完成分析。访谈变量使用访谈权重；MEC 指标和子样本实验指标必须选择相应权重。若列缺失，先用 `r.nhanes.describe.dataset` 核对周期和变量；若出现孤立 PSU 或非正权重，检查纳排和设计设置，不自动改成无权分析。同步成功不等于科学批准，允许主张仅为加权描述或观察性关联。

异步任务的 queued/running 不是成功。只有终态 succeeded 且所需产物存在才报告完成；使用结果内 Manifest 的 project_id/path/bytes/sha256 下载。连接中断先查 status/历史，不换 request_id 重算。参数错回 describe；数据错核对路径、物种和矩阵；缺依赖查环境；权限错返回明确原因；计算错查看日志。

## 按需参考

Skill 加载结果的 `resourceBase` 是资源根目录；以它解析下列相对路径，兼容安装包，不能硬编码源码路径。

- [操作目录](references/operations.md)：按功能族查看全部精确操作、schema 和生命周期。
- [可执行示例](references/examples.json)：结构化调用与预期结果，用于验证和复用。
- [场景与失败恢复](references/scenarios.md)：提交后如何跟踪、取回产物及处理模块特有错误。
- [数据约定](references/data-formats.md)：输入/输出、ID 和路径边界。
