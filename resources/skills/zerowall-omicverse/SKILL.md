---
name: zerowall-omicverse
description: 远程 OmicVerse 单细胞、bulk、空间、多组学和可选 Agent。
allowed-tools: tool_search tool_dispatch read
---

# 远程 OmicVerse 单细胞、bulk、空间、多组学和可选 Agent。

单细胞和空间转录组优先本模块。NHANES 调查统计仍由 R 执行；通用生物数据库工具优先 Biomni；绘图模板优先 FigureYa。

## 功能地图

独立 CPU 环境；官方 P0+P0.5+P2 原生工具；显式单细胞/bulk/空间适配；公共 API 覆盖参考；远程 Python；持久会话、检查点、任务和产物。

## 入口与准备

先 `tool_search` 搜索 `research_workflow`，使用返回的真实工具名和 schema。下列 JSON 是交给 `tool_dispatch` 的完整包装；不要把工作流 ID 当工具名。只有一条物理连接 `rmcp`，工作流按需连接。

查询 schema：`action=describe`，精确 ID 放顶层 `operation`。业务调用：`action=query/run`，精确 ID 放 `parameters.operation`，业务参数放 `parameters.arguments`。只读 query 不创建 Run、不需要 request_id；run 必须有唯一 request_id，同一提交重试复用，参数变化换新 ID。`offline=true` 的 describe 仅浏览本地快照，不能证明在线能力可用。

工作流 ID：`omicverse`。独立 rdatalinux CPU 环境，当前没有 NVIDIA GPU。公开 API 候选不等于可执行工具。availability/verification 显示缺 GPU、模型、依赖、未验证或上游禁用时据实解释。

## 首次调用

```json
{
  "name": "research_workflow",
  "arguments": {
    "action": "describe",
    "workflow_id": "omicverse",
    "operation": "omicverse.status"
  }
}
```
```json
{
  "name": "research_workflow",
  "arguments": {
    "action": "query",
    "workflow_id": "omicverse",
    "parameters": {
      "operation": "omicverse.status",
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

原生工具共享同一 project_id + session_id；修改串行执行，AnnData 关键步骤持久化。会话关闭/重启后类实例必须重建，H5AD 通过 restore 恢复；不能跨会话复用句柄。

异步任务的 queued/running 不是成功。只有终态 succeeded 且所需产物存在才报告完成；使用结果内 Manifest 的 project_id/path/bytes/sha256 下载。连接中断先查 status/历史，不换 request_id 重算。参数错回 describe；数据错核对路径、物种和矩阵；缺依赖查环境；权限错返回明确原因；计算错查看日志。

## 按需参考

Skill 加载结果的 `resourceBase` 是资源根目录；以它解析下列相对路径，兼容安装包，不能硬编码源码路径。

- [操作目录](references/operations.md)：按功能族查看全部精确操作、schema 和生命周期。
- [可执行示例](references/examples.json)：结构化调用与预期结果，用于验证和复用。
- [场景与失败恢复](references/scenarios.md)：提交后如何跟踪、取回产物及处理模块特有错误。
- [数据约定](references/data-formats.md)：输入/输出、ID 和路径边界。
- [R 与 H5AD 转换](references/conversion.md)：复用 R Worker 导入 Seurat/SCE，检查矩阵与字段保留情况。
