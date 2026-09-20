---
name: zerowall-omicverse-multiomics
description: 通过现有 rmcp 使用远程 OmicVerse 完成多组学整合、轨迹和高级 API。
allowed-tools: tool_search tool_dispatch read
---

# 多组学整合、轨迹和高级 API

先搜索实时覆盖矩阵，确认方法的输入模态、样本配对和依赖。未验证 API 只作候选；缺 GPU/模型时报告不可用，不能承诺自动支持。

使用同一物理 rmcp 连接、同一工作流 omicverse。先 tool_search 发现 research_workflow，再 tool_dispatch：

```json
{"name":"research_workflow","arguments":{"action":"describe","workflow_id":"omicverse","operation":"omicverse.run.python"}}
```

按返回的 schema 填充 run 的 parameters.operation 和 parameters.arguments，parameters.request_id 同一提交重试固定。status 使用返回的本地 run_id；只有 succeeded 且检查必要 Manifest 后报告完成。远程输入使用项目相对路径或已完成的 data:OmicVerse/ 引用，上传/下载使用 Host r_files。

专项之外的入口、真实数据示例、完整目录和会话恢复约定见 zerowall-omicverse。加载该 Skill 后，用它返回的 resourceBase 读取 references/operations.md 和 references/scenarios.md，不能把本 Skill 的 resourceBase 当成主 Skill 目录。

## 先检查配对输入，再选择整合方法

将真实配对 RNA 和 ATAC H5AD 上传至 inputs/rna.h5ad、inputs/atac.h5ad。下面只完成配对输入检查，不能当成多组学整合结果。对非配对设计不使用此断言，应先明确独立样本关系和适用算法。search 查询所需算法，describe 核对 runtime 状态、依赖和精确参数后再另行提交 Python/native 任务。当前没有宣称已实算验证多组学整合算法；缺 GPU、模型或依赖时报告目录中的原因。

```json
{
  "name": "research_workflow",
  "arguments": {
    "action": "run",
    "workflow_id": "omicverse",
    "parameters": {
      "operation": "omicverse.run.python",
      "arguments": {
        "project_id": "rmcp-demo",
        "request_id": "multiomics-example-1",
        "code": "import json\nfrom pathlib import Path\nimport scanpy as sc\nrna = sc.read_h5ad(Path(PROJECT_DIR) / 'inputs/rna.h5ad')\natac = sc.read_h5ad(Path(PROJECT_DIR) / 'inputs/atac.h5ad')\nassert rna.obs_names.is_unique and atac.obs_names.is_unique, 'DUPLICATE_CELL_IDS'\nassert rna.obs_names.equals(atac.obs_names), 'PAIRED_CELL_ORDER_MISMATCH'\nPath('input-audit.json').write_text(json.dumps({'paired_cells': rna.n_obs, 'rna_features': rna.n_vars, 'atac_features': atac.n_vars, 'integration_completed': False}))",
        "confirm": true
      },
      "request_id": "multiomics-example-1"
    }
  }
}
```

首次运行使用新的 request_id，同一提交重试保持参数及 request_id 不变。保留提交返回的本地 run_id 和远程 remote_id，查询本地任务：

```json
{"name":"research_workflow","arguments":{"action":"status","run_id":"<提交返回的本地 run_id>"}}
```

queued/running 表示尚未完成；failed/timed_out 时保留原任务并读取错误及日志。succeeded 后检查 artifacts 中的 input-audit.json，使用 Manifest 的完整项目相对路径取回文件，不拼接本地 run_id：

```json
{"name":"r_files","arguments":{"action":"download_workspace","project_id":"rmcp-demo","remote_path":"<Manifest 中的完整项目相对路径>","local_path":"results/input-audit.json"}}
```
