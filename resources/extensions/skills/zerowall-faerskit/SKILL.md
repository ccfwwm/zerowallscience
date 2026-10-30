---
name: zerowall-faerskit
description: 通过远程 RMCP faerskit 分析 FAERS 药物不良事件报告，执行比例失衡信号筛查、人群描述、联合用药及多药对比，跟踪异步任务并核验结果。适用于 FAERS 药物警戒研究。
allowed-tools: read
---

# FAERS 药物警戒分析

加载 `zerowall-rmcp`，使用同一物理连接 `rmcp` 和 Host `research_workflow`，工作流 ID 为 `r.faerskit`。连接未知时先发现 `mcp_connect`。按实时 describe 的 schema 执行；连接失败时报告实际服务错误，不静默改用本地 R 或其他数据源。FAERS 输入是去标识报告的汇总统计分析，用于群体信号筛查，不是个体诊断或治疗建议。

## 检查与提交

远程项目绑定由 Host 在 RMCP 调用时自动处理。每个对话拥有独立项目，只在同一对话内复用；不同对话不共享研究项目。调用时省略 `project_id`，不得要求用户查找、填写或确认 ID，也不要把“已有ID”等占位文字作为 ID 发送。Host 会自动把任务、结果和文件操作绑定到该对话的项目。

1. 可用 `action=query` 查询 `r.faerskit.status`，查看服务端实际表结构、必需列和数据库覆盖期；它不返回病例级明细或连接凭据。
2. 当数据库名称候选未知或需核对覆盖时，用 `action=query` 调用只读 `r.faerskit.lookup`，检索实际药名/PT、角色汇总计数和匹配报告数。精确匹配优先；无精确项时唯一候选自动采用，多候选或零命中作为预检提示。读取 `r.faerskit.analyze` 的实时 schema 并按用户明确的 规范工作流、角色、计数口径和筛选条件构造参数。
3. 收到用户明确的运行/继续请求后，直接调用 `action=run` 提交；该请求就是本次任务授权，不要再次询问确认，也不要要求用户另交数据库审计、覆盖证明或研究记录。按工具 schema 设置 `confirm=true`，业务参数放在 `parameters.arguments`，精确操作放在 `parameters.operation`，同一提交重试复用 `parameters.request_id`。服务端自动预检并异步执行。数据库连接、权限、必需表列或参数错误仍应如实报告。

```json
{
  "action": "run",
  "workflow_id": "r.faerskit",
  "parameters": {
    "operation": "r.faerskit.analyze",
    "arguments": {
      "fun": "faers_analyze_drug_target_pt",
      "drug": "Citalopram",
      "ptname": "Torsade de pointes",
      "drugEffect": "PS",
      "year": "2026Q1",
      "unit": "pair",
      "path": "faerskit/citalopram",
      "confirm": true
    },
    "request_id": "faers-citalopram-torsade-2026q1-1"
  }
}
```

`year` 支持季度字符串，例如 `2026Q1`，服务端会转换为 FAERS `getdatayear` 编码并从所选数据库查询实际覆盖范围；旧格式整数编码仍可用。覆盖不完整、零匹配或多候选是预检警告，不改变用户条件，也不阻止提交。保留用户原始的 `case`/`pair` 计数单位及 `PS`/`SS`/`C`/`I` 角色，不要静默替换。

## 任务和交付

返回的本地 `run_id` 用 `research_workflow action=status` 查询。远端 `job_id` 用于 `r.get.job`、`r.get.job.log`、`r.get.job.manifest` 等共享 R 作业操作，不要混用两种 ID。Host 会持久化异步生命周期，并在成功后收集 Manifest。重连先查已有 run，避免重新提交。

终态成功后 Host 自动按完整 Manifest 下载全部产物，默认保存到当前工作区 `downloads/faerskit/<job_id>/`，保留远端子目录。检查 `result.local_delivery`：只有 `status=complete` 且已验证文件数等于 Manifest 文件数才可报告全量交付完成；`partial` 时说明具体失败文件，用 Host `r_files action=download_job_manifest` 和同一 `job_id/local_path` 重试，复用已校验文件与下载进度，不重新分析。可按用户要求指定工作区内的相对目录。

下载使用 1 MiB 分块、流式写盘及大小/SHA-256 校验，没有结果文件总数、总量或单文件产品上限。不要把 Base64 或完整文件内容放入对话。交付应包含 HTML、`analysis_summary.md`、Excel、全部适用 PNG/SVG、图表 CSV 和统计产物；从本地打开报告并核对相对资源链接。Manifest 路径相对作业结果目录，交给传输工具时复用其项目文件引用。分析失败或超时先读日志；只有修正分析参数后才用新 request_id 重算。取消按实时工具合同执行。

## 分析边界

- 远程接口当前开放 14 个 规范工作流 入口，后端为 ClickHouse。`faers_signal` / `faers_describe` 等 DuckDB 专用函数不是该接口的分析动作；`action=describe` 是查看接口定义。
- 结果目录包含 `faerskit_preflight.json`，记录实际药名/PT 解析、报告期覆盖、角色与匹配计数；连同日志、CSV、summary、Manifest 和 SHA-256 一并核对。
- 药名匹配、PS/SS/C/I 角色、pair/case 计数口径及人群筛选会改变分析对象和分母。保留所选 规范工作流、参数、数据版本/覆盖范围及限制；未知值明确记录。
- 去标识自发报告的比例失衡结果是群体层面的研究线索，不能直接解释为发生率、相对风险或因果结论，也不用于个体诊断或治疗建议。保留混杂、报告偏倚、药名与重复报告处理范围等限制。
- 不把数据库密码、连接凭据写入提示词、参数或结果文件；连接由服务端管理。数据库导入、安装和切换服务不属于普通分析调用。

按研究目的读取[分析场景](references/scenarios.md)和[数据约定](references/data-formats.md)。结构化调用示例见 [examples.json](references/examples.json)；完整输入和生命周期见[生成操作目录](references/operations.md)，该目录由实际服务端注册生成，实时 describe 优先。

## 查询、图表与报告

`r.faerskit.query` 通过 action=query 返回按角色、人群、PT、期间筛选的聚合分布，默认100、最多1000行，禁止任意SQL。`analyze` 默认交付 HTML、Excel、适用图表 PNG/SVG、图表CSV、预检和统计快照。`plot` 与 `report` 用 action=run 和 source_job_id 从成功分析重绘/生成独立任务，不重新查库、不改变原统计。明确PS+SS对比时以 role_comparisons=[["PS","SS"]] 启用独立敏感性分析，主PS参数保留。

所有14个旧名已删除，无转接别名；旧名错误提供新名映射，需使用明确规范名称重新提交。任务在当前对话跟踪，图表与HTML由现有viewer展示，不引入工作台。报告未核验状态、缺字典、缺季或零结果只作说明，不要求用户先交审计。
