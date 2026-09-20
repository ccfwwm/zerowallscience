---
name: zerowall-r-files
description: 远程项目文件浏览、预览、读写与本地上传下载。
allowed-tools: tool_search tool_dispatch read
---

# 远程项目文件浏览、预览、读写与本地上传下载。

需要跨本地/远程传输时选择 Host r_files；服务器已有文件查询使用本工作流。FigureYa 模板文件属于服务器安装目录，使用专用下载动作。

## 功能地图

目录与路径解析；文本与数据预览；读写和删除；Manifest 与 SHA-256；图片显式读取；Host 上传、下载、模板源文件下载。

## 入口与准备

先 `tool_search` 搜索 `research_workflow`，使用返回的真实工具名和 schema。下列 JSON 是交给 `tool_dispatch` 的完整包装；不要把工作流 ID 当工具名。只有一条物理连接 `rmcp`，工作流按需连接。

查询 schema：`action=describe`，精确 ID 放顶层 `operation`。业务调用：`action=query/run`，精确 ID 放 `parameters.operation`，业务参数放 `parameters.arguments`。只读 query 不创建 Run、不需要 request_id；run 必须有唯一 request_id，同一提交重试复用，参数变化换新 ID。`offline=true` 的 describe 仅浏览本地快照，不能证明在线能力可用。

工作流 ID：`r.files`。Windows 路径不能作为远程 path。本地 local_path 必须在当前工作区内且为相对路径；远程 path 为项目相对路径。复用返回的 project_id、path，不猜绝对路径。

## 首次调用

```json
{
  "name": "research_workflow",
  "arguments": {
    "action": "describe",
    "workflow_id": "r.files",
    "operation": "r.list.directory"
  }
}
```
```json
{
  "name": "research_workflow",
  "arguments": {
    "action": "query",
    "workflow_id": "r.files",
    "parameters": {
      "operation": "r.list.directory",
      "arguments": {
        "project_id": "rmcp-demo"
      }
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
    "workflow_id": "r.files",
    "parameters": {
      "operation": "r.write.file",
      "arguments": {
        "project_id": "rmcp-demo",
        "path": "input.csv",
        "content": "x,y\n1,2\n2,4\n",
        "confirm": true
      },
      "request_id": "demo-r-files-1"
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

文件写入同步完成，没有远程 job_id；下载必须核对字节数及 SHA-256。

异步任务的 queued/running 不是成功。只有终态 succeeded 且所需产物存在才报告完成；使用结果内 Manifest 的 project_id/path/bytes/sha256 下载。连接中断先查 status/历史，不换 request_id 重算。参数错回 describe；数据错核对路径、物种和矩阵；缺依赖查环境；权限错返回明确原因；计算错查看日志。

## 按需参考

Skill 加载结果的 `resourceBase` 是资源根目录；以它解析下列相对路径，兼容安装包，不能硬编码源码路径。

- [操作目录](references/operations.md)：按功能族查看全部精确操作、schema 和生命周期。
- [可执行示例](references/examples.json)：结构化调用与预期结果，用于验证和复用。
- [场景与失败恢复](references/scenarios.md)：提交后如何跟踪、取回产物及处理模块特有错误。
- [数据约定](references/data-formats.md)：输入/输出、ID 和路径边界。
