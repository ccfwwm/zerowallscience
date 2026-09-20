---
name: zerowall-r-packages
description: 远程 R 包版本、依赖检查及批准的包管理。
allowed-tools: tool_search tool_dispatch read
---

# 远程 R 包版本、依赖检查及批准的包管理。

适用于服务器 R/Bioconductor 包。OmicVerse 的 Python 环境由独立服务维护，不使用本地 pip 或本模块变更。

## 功能地图

包列表与版本；分析依赖状态；批准包补齐；管理员安装与卸载。

## 入口与准备

先 `tool_search` 搜索 `research_workflow`，使用返回的真实工具名和 schema。下列 JSON 是交给 `tool_dispatch` 的完整包装；不要把工作流 ID 当工具名。只有一条物理连接 `rmcp`，工作流按需连接。

查询 schema：`action=describe`，精确 ID 放顶层 `operation`。业务调用：`action=query/run`，精确 ID 放 `parameters.operation`，业务参数放 `parameters.arguments`。只读 query 不创建 Run、不需要 request_id；run 必须有唯一 request_id，同一提交重试复用，参数变化换新 ID。`offline=true` 的 describe 仅浏览本地快照，不能证明在线能力可用。

工作流 ID：`r.packages`。查询不改变环境。安装/卸载需要实际管理员权限和 confirm=true，说明具体包及影响；权限不足不能用任意 R 代码绕过。

## 首次调用

```json
{
  "name": "research_workflow",
  "arguments": {
    "action": "describe",
    "workflow_id": "r.packages",
    "operation": "r.get.package.status"
  }
}
```
```json
{
  "name": "research_workflow",
  "arguments": {
    "action": "query",
    "workflow_id": "r.packages",
    "parameters": {
      "operation": "r.get.package.status",
      "arguments": {
        "packages": [
          "Matrix",
          "Seurat"
        ]
      }
    }
  }
}
```

## 返回与恢复

包安装、卸载和补齐均为同步接口：直接检查返回版本和错误。没有 job_id 时不得虚构安装任务。

异步任务的 queued/running 不是成功。只有终态 succeeded 且所需产物存在才报告完成；使用结果内 Manifest 的 project_id/path/bytes/sha256 下载。连接中断先查 status/历史，不换 request_id 重算。参数错回 describe；数据错核对路径、物种和矩阵；缺依赖查环境；权限错返回明确原因；计算错查看日志。

## 按需参考

Skill 加载结果的 `resourceBase` 是资源根目录；以它解析下列相对路径，兼容安装包，不能硬编码源码路径。

- [操作目录](references/operations.md)：按功能族查看全部精确操作、schema 和生命周期。
- [可执行示例](references/examples.json)：结构化调用与预期结果，用于验证和复用。
- [场景与失败恢复](references/scenarios.md)：提交后如何跟踪、取回产物及处理模块特有错误。
- [数据约定](references/data-formats.md)：输入/输出、ID 和路径边界。
