---
name: zerowall-omicverse
description: 远程 OmicVerse 单细胞、bulk、空间、多组学和可选 Agent。
allowed-tools: read
---

# 远程 OmicVerse 单细胞、bulk、空间、多组学和可选 Agent。

AnnData、单细胞、空间和多组学请求时主动加载 zerowall-rmcp、本 Skill 及匹配的专项 Skill，并默认通过 `rmcp` 远程执行。NHANES 调查统计仍使用远程 R；通用生物数据库工具优先 Biomni；绘图模板优先 FigureYa。连接状态未知时先调用 `mcp_connect`，远程失败不得静默转为本地 R/Python 分析。

## 功能地图

独立 CPU 环境；官方 P0+P0.5+P2 原生工具；显式单细胞/bulk/空间适配；公共 API 覆盖参考；远程 Python；持久会话、检查点、任务和产物。

## 入口与准备

使用 Host `research_workflow` 的实时 schema。不要把工作流 ID 当工具名。OmicVerse 任务默认远程运行；连接未知时先调用 `mcp_connect`，再检查工具目录、环境和精确操作。数据上传遵守现有确认及授权范围。

查询 schema：`action=describe`，精确 ID 放顶层 `operation`。业务调用：`action=query/run`，精确 ID 放 `parameters.operation`，业务参数放 `parameters.arguments`。只读 query 不创建 Run、不需要 request_id；run 必须有唯一 request_id，同一提交重试复用，参数变化换新 ID。`offline=true` 的 describe 仅浏览本地快照，不能证明在线能力可用。

工作流 ID：`omicverse`。独立 rdatalinux CPU 环境，当前没有 NVIDIA GPU。公开 API 候选不等于可执行工具。availability/verification 显示缺 GPU、模型、依赖、未验证或上游禁用时据实解释。

## 首次调用

```json
{
  "action": "describe",
  "workflow_id": "omicverse",
  "operation": "omicverse.status"
}
```
```json
{
  "action": "query",
  "workflow_id": "omicverse",
  "parameters": {
    "operation": "omicverse.status",
    "arguments": {}
  }
}
```

确认实际输入和范围后，以下执行示例可提交至专用演示项目。

```json
{
  "action": "run",
  "workflow_id": "omicverse",
  "parameters": {
    "operation": "omicverse.run.singlecell",
    "arguments": {
      "project_id": "rmcp-demo",
      "request_id": "singlecell-demo",
      "input_path": "data:OmicVerse/pbmc3k_raw.h5ad",
      "confirm": true
    },
    "request_id": "demo-omicverse-1"
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

原生工具共享同一 project_id + session_id；修改串行执行，AnnData 关键步骤持久化。会话关闭/重启后类实例必须重建，H5AD 通过 restore 恢复；不能跨会话复用句柄。

异步任务的 queued/running 不是成功。只有终态 succeeded 且所需产物存在才报告完成；使用结果内 Manifest 的 project_id/path/bytes/sha256 下载。连接中断先查 status/历史，不换 request_id 重算。参数错回 describe；数据错核对路径、物种和矩阵；缺依赖查环境；权限错返回明确原因；计算错查看日志。

## 按需参考

Skill 加载结果的 `resourceBase` 是资源根目录；以它解析下列相对路径，兼容安装包，不能硬编码源码路径。

- [操作目录](references/operations.md)：按功能族查看全部精确操作、schema 和生命周期。
- [可执行示例](references/examples.json)：结构化调用与预期结果，用于验证和复用。
- [场景与失败恢复](references/scenarios.md)：提交后如何跟踪、取回产物及处理模块特有错误。
- [数据约定](references/data-formats.md)：输入/输出、ID 和路径边界。
- [R 与 H5AD 转换](references/conversion.md)：复用 R Worker 导入 Seurat/SCE，检查矩阵与字段保留情况。

科学资源发现、文献、基因蛋白、药物化学及临床数据库的精确查询可转交 `zerowall-tooluniverse`，`workflow_id=tooluniverse`。既有专项分析继续使用本模块；先发现、describe 实时 schema，再提交并跟踪任务与 Manifest。
