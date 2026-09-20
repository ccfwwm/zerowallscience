---
name: zerowall-omicverse-spatial
description: 通过现有 rmcp 使用远程 OmicVerse 完成空间转录组邻接、Moran I 与可视化。
allowed-tools: tool_search tool_dispatch read
---

# 空间转录组邻接、Moran I 与可视化

H5AD 必须含 obsm[spatial]，说明坐标单位、切片和分辨率。空间相关不等同于因果作用。

使用同一物理 rmcp 连接、同一工作流 omicverse。先 tool_search 发现 research_workflow，再 tool_dispatch：

```json
{"name":"research_workflow","arguments":{"action":"describe","workflow_id":"omicverse","operation":"omicverse.run.spatial"}}
```

按返回的 schema 填充 run 的 parameters.operation 和 parameters.arguments，parameters.request_id 同一提交重试固定。status 使用返回的本地 run_id；只有 succeeded 且检查必要 Manifest 后报告完成。远程输入使用项目相对路径或已完成的 data:OmicVerse/ 引用，上传/下载使用 Host r_files。

专项之外的入口、真实数据示例、完整目录和会话恢复约定见 zerowall-omicverse。加载该 Skill 后，用它返回的 resourceBase 读取 references/operations.md 和 references/scenarios.md，不能把本 Skill 的 resourceBase 当成主 Skill 目录。

## 真实 seqFISH 空间相关分析

缓存 seqFISH 已含空间坐标。此适配执行 Squidpy generic 邻接与 Moran I（100 次置换，seed=123），输出 spatial-moran.csv 和 spatial.h5ad。MISSING_SPATIAL 表示缺 obsm[spatial]，应核对原始坐标与细胞对应关系后重新提交，不能随机生成坐标代替。可视化通过单独 Python/native 工具读取完成后的 H5AD。

```json
{
  "name": "research_workflow",
  "arguments": {
    "action": "run",
    "workflow_id": "omicverse",
    "parameters": {
      "operation": "omicverse.run.spatial",
      "arguments": {
        "project_id": "rmcp-demo",
        "request_id": "spatial-example-1",
        "input_path": "data:OmicVerse/seqfish.h5ad",
        "confirm": true
      },
      "request_id": "spatial-example-1"
    }
  }
}
```

首次运行使用新的 request_id，同一提交重试保持参数及 request_id 不变。保留提交返回的本地 run_id 和远程 remote_id，查询本地任务：

```json
{"name":"research_workflow","arguments":{"action":"status","run_id":"<提交返回的本地 run_id>"}}
```

queued/running 表示尚未完成；failed/timed_out 时保留原任务并读取错误及日志。succeeded 后检查 artifacts 中的 spatial-moran.csv，使用 Manifest 的完整项目相对路径取回文件，不拼接本地 run_id：

```json
{"name":"r_files","arguments":{"action":"download_workspace","project_id":"rmcp-demo","remote_path":"<Manifest 中的完整项目相对路径>","local_path":"results/spatial-moran.csv"}}
```
