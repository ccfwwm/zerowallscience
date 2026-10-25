---
name: zerowall-r-files
description: 远程项目文件浏览、预览、读写与本地上传下载。
allowed-tools: read
---

# 远程项目文件浏览、预览、读写与本地上传下载。

需要跨本地/远程传输时选择 Host `r_files`；服务器已有文件查询使用本工作流。R、OmicVerse、FigureYa 绘图、GEO、NHANES、遗传分析和 scTenifoldKnk 等 RMCP 结果，只要 Manifest 给出项目 `project_id/path`，都用同一个 `download_workspace` 下载。Biomni 独立任务结果使用 `source=biomni`、`job_id` 和 Manifest 文件路径。FigureYa 安装目录里的模板源文件也走 `download_workspace`，传 `module_id/source_path`；批量取回整个模板才使用 `download_figureya_module`。

## 功能地图

目录与路径解析；文本与数据预览；读写和删除；Manifest 与 SHA-256；图片显式读取；Host 上传、下载、模板源文件下载。

## 入口与准备

有远程文件检索或传输需求时主动加载 zerowall-rmcp 与本 Skill，使用 Host `r_files` 或发现的 `research_workflow`，以当前 schema 为准。Host `r_files` 的 `action=catalog` 会合并远端文件操作和本地传输动作；`research_workflow` 的远端 catalog 不包含 Host 本地动作。连接状态未知时先调用 `mcp_connect`；不要把工作流 ID 当工具名。只在既有授权范围内传输数据，不能因远程默认而扩大上传范围。

查询 schema：`action=describe`，精确 ID 放顶层 `operation`。业务调用：`action=query/run`，精确 ID 放 `parameters.operation`，业务参数放 `parameters.arguments`。只读 query 不创建 Run、不需要 request_id；run 必须有唯一 request_id，同一提交重试复用，参数变化换新 ID。`offline=true` 的 describe 仅浏览本地快照，不能证明在线能力可用。

工作流 ID：`r.files`。Windows 路径不能作为远程 path。本地 `local_path` 必须在当前工作区内且为相对路径；省略时自动保存到 `downloads/<文件名>`。远程 path 为项目相对路径。复用 Manifest 返回的 `project_id/path`，不猜绝对路径。

## 首次调用

```json
{
  "action": "describe",
  "workflow_id": "r.files",
  "operation": "r.list.directory"
}
```
```json
{
  "action": "query",
  "workflow_id": "r.files",
  "parameters": {
    "operation": "r.list.directory",
    "arguments": {
      "project_id": "rmcp-demo"
    }
  }
}
```

确认实际输入和范围后，以下执行示例可提交至专用演示项目。

```json
{
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
```

返回本地 `run_id` 后替换下面的 `<run_id>`：

```json
{
  "action": "status",
  "run_id": "<run_id>"
}
```

## 返回与恢复

文件写入同步完成，没有远程 job_id；下载必须核对字节数及 SHA-256。`download_workspace` 在 Host 内分块传输并写入本地文件，不把 base64 内容发送到对话，也不要求用户手工解码。项目文件默认使用 `source=project`；独立 Biomni 结果使用 `source=biomni` 和 `job_id`。省略 `local_path` 时默认写入当前项目工作区的 `downloads/`。

异步任务的 queued/running 不是成功。只有终态 succeeded 且所需产物存在才报告完成；使用结果内 Manifest 的 project_id/path/bytes/sha256 下载。连接中断先查 status/历史，不换 request_id 重算。参数错回 describe；数据错核对路径、物种和矩阵；缺依赖查环境；权限错返回明确原因；计算错查看日志。

## 按需参考

Skill 加载结果的 `resourceBase` 是资源根目录；以它解析下列相对路径，兼容安装包，不能硬编码源码路径。

- [操作目录](references/operations.md)：按功能族查看全部精确操作、schema 和生命周期。
- [可执行示例](references/examples.json)：结构化调用与预期结果，用于验证和复用。
- [场景与失败恢复](references/scenarios.md)：提交后如何跟踪、取回产物及处理模块特有错误。
- [数据约定](references/data-formats.md)：输入/输出、ID 和路径边界。
