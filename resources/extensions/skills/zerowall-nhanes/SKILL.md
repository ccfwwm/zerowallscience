---
name: zerowall-nhanes
description: NHANES 变量、周期、复杂抽样统计及可复现报告。
allowed-tools: read
---

# NHANES 变量、周期、复杂抽样统计及可复现报告。

调查统计保留 R survey 链路。跨模块共享结果表，不把普通无权回归当成 NHANES 复杂抽样结果。

## 功能地图

周期/数据集/变量/codebook；数据补齐与缓存；SEQN 合并与跨周期；调查加权描述和回归；生存、混合模型、多重插补、倾向评分和 meta 分析；图表报告。

## 入口与准备

NHANES 周期、变量、复杂抽样或回归请求时主动加载 zerowall-rmcp 与本 Skill，通过唯一物理连接 `rmcp` 使用 Host `research_workflow` 的实时 schema；R 统计默认远程执行。连接状态未知时先调用 `mcp_connect`。Gate 1/2 只返回 warnings，不要求先审计、冻结或补交研究材料。收到明确运行请求即在本轮直接调用 Runner；仍须满足真实调查设计、数据契约、变量、参数、权限和运行时校验。

查询 schema：`action=describe`，精确 ID 放顶层 `operation`。业务调用：`action=query/run`，精确 ID 放 `parameters.operation`，业务参数放 `parameters.arguments`。只读 query 不创建 Run、不需要 request_id；run 必须有唯一 request_id，同一提交重试复用，参数变化换新 ID。`offline=true` 的 describe 仅浏览本地快照，不能证明在线能力可用。

工作流 ID：`r.nhanes`。必须选择与研究指标匹配的权重，并记录 PSU=SDMVPSU、strata=SDMVSTRA；多周期权重调整、缺失值与纳排条件需写入分析计划。

## 首次调用

```json
{
  "action": "describe",
  "workflow_id": "r.nhanes",
  "operation": "r.nhanes.catalog"
}
```
```json
{
  "action": "query",
  "workflow_id": "r.nhanes",
  "parameters": {
    "operation": "r.nhanes.catalog",
    "arguments": {}
  }
}
```

确认实际输入和范围后，按在线 schema 运行。若操作要求 `project_id`，只能使用现有远程项目 ID；在当前 ZeroWall 项目设置中填写“R 平台已有项目 ID”后，Host 会为当前工作目录匹配的项目自动传入该 ID。未配置时停止并提示用户补充；Host 不会创建或注册项目。

```json
{
  "action": "run",
  "workflow_id": "r.nhanes",
  "parameters": {
    "operation": "r.nhanes.ensure.available",
    "arguments": {
      "cycle": "2017-2018",
      "domain": "Demographics",
      "dataset": "DEMO_J"
    },
    "request_id": "demo-r-nhanes-1"
  }
}
```

返回本地 `run_id` 后替换下面的 `<run_id>`：

```json
{
  "action": "status",
  "run_id": "<run_id>"
}
```

## 返回与恢复

ensure.available 可启动下载，虽无 confirm 也不是 query。datasets.ensure_available=true 同样可能写缓存；此类分析使用 run。

正式分析继续使用实时 `r.nhanes` 工作流 schema，通过 `research_workflow` 提交实际存在的分析操作。记录真实数据来源、周期、component、dataset、权重、codebook、特殊缺失码、PSU/strata、纳排、变量定义、domain 设计及多周期合并规则；把这些内容保存在本次分析脚本/工作记录中，不创建 Study、任务或 AnalysisPlan。若操作 schema 缺少必需字段或远端未提供该分析能力，停止并说明缺口，不回退到已退役接口。

访谈变量使用访谈权重；MEC 指标和子样本实验指标使用对应权重。若列缺失，先用在线 describe/query 核对周期和变量；若出现孤立 PSU 或非正权重，检查纳排和设计设置，不自动改成无权分析。同步成功不等于科学批准，结论限定为实际设计支持的加权描述或观察性关联。

异步任务的 queued/running 不是成功。只有终态 succeeded 且所需产物存在才报告完成；使用结果内 Manifest 的 project_id/path/bytes/sha256 下载。连接中断先查 status/历史，不换 request_id 重算。参数错回 describe；数据错核对路径、物种和矩阵；缺依赖查环境；权限错返回明确原因；计算错查看日志。

## 按需参考

Skill 加载结果的 `resourceBase` 是资源根目录；以它解析下列相对路径，兼容安装包，不能硬编码源码路径。

- [操作目录](references/operations.md)：按功能族查看全部精确操作、schema 和生命周期。
- [可执行示例](references/examples.json)：结构化调用与预期结果，用于验证和复用。
- [场景与失败恢复](references/scenarios.md)：提交后如何跟踪、取回产物及处理模块特有错误。
- [数据约定](references/data-formats.md)：输入/输出、ID 和路径边界。
