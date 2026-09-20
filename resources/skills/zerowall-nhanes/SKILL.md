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

下载终态成功后，计算 2017–2018 年龄的访谈权重均值：

```json
{"name":"research_workflow","arguments":{"action":"run","workflow_id":"r.nhanes","parameters":{"operation":"r.nhanes.survey.summary","arguments":{"project_id":"rmcp-demo","datasets":[{"cycle":"2017-2018","domain":"Demographics","dataset":"DEMO_J","ensure_available":false}],"variable":"RIDAGEYR","weight":"WTINT2YR","strata":"SDMVSTRA","psu":"SDMVPSU"},"request_id":"demo-nhanes-age-summary-1"}}}
```

该操作同步返回统计结果，检查 `result` 的样本数、加权估计与标准误，远程 `job_id` 可以为空。访谈变量使用访谈权重；MEC 指标和子样本实验指标必须选择相应权重。若列缺失，先用 `r.nhanes.describe.dataset` 核对周期和变量；若出现孤立 PSU 或非正权重，检查纳排和设计设置，不自动改成无权分析。

异步任务的 queued/running 不是成功。只有终态 succeeded 且所需产物存在才报告完成；使用结果内 Manifest 的 project_id/path/bytes/sha256 下载。连接中断先查 status/历史，不换 request_id 重算。参数错回 describe；数据错核对路径、物种和矩阵；缺依赖查环境；权限错返回明确原因；计算错查看日志。

## 按需参考

Skill 加载结果的 `resourceBase` 是资源根目录；以它解析下列相对路径，兼容安装包，不能硬编码源码路径。

- [操作目录](references/operations.md)：按功能族查看全部精确操作、schema 和生命周期。
- [可执行示例](references/examples.json)：结构化调用与预期结果，用于验证和复用。
- [场景与失败恢复](references/scenarios.md)：提交后如何跟踪、取回产物及处理模块特有错误。
- [数据约定](references/data-formats.md)：输入/输出、ID 和路径边界。
