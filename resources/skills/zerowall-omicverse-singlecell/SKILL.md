---
name: zerowall-omicverse-singlecell
description: 通过现有 rmcp 使用远程 OmicVerse 完成单细胞 QC、归一化、降维、聚类、marker 和注释。
allowed-tools: tool_search tool_dispatch read
---

# 单细胞 QC、归一化、降维、聚类、marker 和注释

输入必须说明 counts/layers/raw，记录细胞与基因顺序、物种、线粒体比例和批次。不得将 log-normalized X 冒充 counts。

使用同一物理 rmcp 连接、同一工作流 omicverse。先 tool_search 发现 research_workflow，再 tool_dispatch：

```json
{"name":"research_workflow","arguments":{"action":"describe","workflow_id":"omicverse","operation":"omicverse.run.singlecell"}}
```

按返回的 schema 填充 run 的 parameters.operation 和 parameters.arguments，parameters.request_id 同一提交重试固定。status 使用返回的本地 run_id；只有 succeeded 且检查必要 Manifest 后报告完成。远程输入使用项目相对路径或已完成的 data:OmicVerse/ 引用，上传/下载使用 Host r_files。

专项之外的入口、真实数据示例、完整目录和会话恢复约定见 zerowall-omicverse。加载该 Skill 后，用它返回的 resourceBase 读取 references/operations.md 和 references/scenarios.md，不能把本 Skill 的 resourceBase 当成主 Skill 目录。

## 真实 PBMC3k CPU 全流程

先 query omicverse.status 并确认缓存可用。此固定流程要求 X 是原始 counts；已归一化 X 应先通过 Python 选择正确 counts 层并导出新输入。输出还包括 cell-qc.csv、markers.csv、umap.png；读取 QC 表后解释过滤规模，不把自动聚类当成已确认细胞类型。

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
        "request_id": "singlecell-example-1",
        "input_path": "data:OmicVerse/pbmc3k_raw.h5ad",
        "min_genes": 200,
        "max_percent_mt": 20,
        "confirm": true
      },
      "request_id": "singlecell-example-1"
    }
  }
}
```

首次运行使用新的 request_id，同一提交重试保持参数及 request_id 不变。保留提交返回的本地 run_id 和远程 remote_id，查询本地任务：

```json
{"name":"research_workflow","arguments":{"action":"status","run_id":"<提交返回的本地 run_id>"}}
```

queued/running 表示尚未完成；failed/timed_out 时保留原任务并读取错误及日志。succeeded 后检查 artifacts 中的 analysis.h5ad，使用 Manifest 的完整项目相对路径取回文件，不拼接本地 run_id：

```json
{"name":"r_files","arguments":{"action":"download_workspace","project_id":"rmcp-demo","remote_path":"<Manifest 中的完整项目相对路径>","local_path":"results/analysis.h5ad"}}
```
