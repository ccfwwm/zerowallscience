---
name: zerowall-faerskit
description: 通过远程 RMCP faerskit 分析 FAERS 药物不良事件报告，执行比例失衡信号筛查、人群描述、联合用药及多药对比，跟踪异步任务并核验结果。适用于 FAERS 药物警戒研究。
allowed-tools: read
---

# FAERS 药物警戒分析

加载 `zerowall-rmcp`，使用同一物理连接 `rmcp` 和 Host `research_workflow`，工作流 ID 为 `r.faerskit`。连接未知时先发现 `mcp_connect`。按实时 describe 的 schema 执行；连接失败时报告阻断步骤，不静默改用本地 R 或其他数据源。

## 检查与提交

1. 用 `action=query` 查询 `r.faerskit.status`，参数放在 `parameters: {operation: "r.faerskit.status", arguments: {}}`；检查 `installed`、`connected` 和 `supported_functions`。该状态查询不要求先创建分析项目，但不证明数据覆盖、完整性或分析已验证。
2. 用 `action=describe`、顶层 `operation=r.faerskit.analyze` 获取实时输入。根据 [函数与数据约定](references/analysis.md) 选择 Fun，明确数据库、药物/PT、报告期、人群、药物角色及计数单位。数据库中真实名称与覆盖范围未知时先列明缺口；不能凭示例假定已覆盖。
3. 按用户已授权的具体分析范围调用 `action=run`，业务参数放在 `parameters.arguments`，精确操作放在 `parameters.operation`，同一提交重试复用 `parameters.request_id`。需要 `confirm=true`；输出 `path` 为作业结果目录内的相对路径，可省略。Host 可为当前工作区补项目 ID；传入时必须是已存在的远程项目。

```json
{
  "action": "run",
  "workflow_id": "r.faerskit",
  "parameters": {
    "operation": "r.faerskit.analyze",
    "arguments": {
      "fun": "AFun",
      "drug": "METFORMIN",
      "drugEffect": "PS",
      "year": [141, 244],
      "unit": "pair",
      "path": "faerskit/metformin",
      "confirm": true
    },
    "request_id": "faers-metformin-2014q1-2024q4-1"
  }
}
```

示例中的名称、期间和计数口径须与研究计划及实际数据一致；不要直接作为用户研究执行。`year` 是 `getdatayear` 报告期编码，`141=2014Q1`、`244=2024Q4`，不能传 `[2014, 2024]`。不适用的可选字段应省略，共用 schema 不代表每个 Fun 都接受全部字段。

## 任务和交付

返回的本地 `run_id` 用 `research_workflow action=status` 查询。远端 `job_id` 用于 `r.get.job`、`r.get.job.log`、`r.get.job.manifest` 等共享 R 作业操作，不要混用两种 ID。Host 会持久化异步生命周期，并在成功后收集 Manifest。重连先查已有 run，避免重新提交。

终态成功后核对 Manifest 中实际生成的 CSV、`summary.json` 和必要结果文件；再用 Host `r_files` 下载，核对大小和 SHA-256。Manifest 的文件名相对作业结果目录，交给传输工具时复用其项目文件引用，不拼接本机路径。失败或超时先读日志，修正参数或数据后使用新 request_id。取消按实时工具合同执行。

## 分析边界

- 远程接口当前开放 14 个 Fun 入口，后端为 ClickHouse。`faers_signal` / `faers_describe` 等 DuckDB 专用函数不是该接口的分析动作；`action=describe` 是查看接口定义。
- 药名匹配、PS/SS/C/I 角色、pair/case 计数口径及人群筛选会改变分析对象和分母。保留所选 Fun、参数、数据版本/覆盖范围及限制；未知值明确记录。
- 自发报告的比例失衡结果是研究线索，不能直接解释为发生率、相对风险或因果结论。保留混杂、报告偏倚、药名与重复报告处理范围等限制。
- 不把数据库密码、连接凭据写入提示词、参数或结果文件；连接由服务端管理。数据库导入、安装和切换服务不属于普通分析调用。

按研究目的读取[分析场景](references/scenarios.md)和[数据约定](references/data-formats.md)。结构化调用示例见 [examples.json](references/examples.json)；完整输入和生命周期见[生成操作目录](references/operations.md)，该目录由实际服务端注册生成，实时 describe 优先。
