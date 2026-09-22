---
name: zerowall-molecule-docking
description: 在 ZeroWall 项目内查看分子结构，使用已准备的刚性 PDBQT 受体、带来源的 SMILES 配体清单和明确搜索盒运行固定 Vina 任务，并核验取回构象。适用于科研对接，不用于推断临床疗效。
metadata:
  version: 7.0.0-1
---

# 分子查看与 Vina 对接

先发现 `science_viewer` 并读取真实 schema。分子查看使用 `molecule_open/read/save/measure/export`；计算使用 `dock_list/submit/status/cancel`。两条路径均由 Host 处理项目隔离、版本与文件校验，不能用任意 Python/shell 替代固定方法入口。

## 输入准备

- 受体必须是当前项目已登记的本地刚性 `.pdbqt`，包含原子；不接受 ligand ROOT/BRANCH 或多模型受体。必须记录来源结构、准备方法/软件版本、质子化及保留水/离子/辅因子。Host 的格式检查不能证明准备在科学上正确。
- 配体是当前项目已登记的本地 JSON 数组：`[{"id":"ethanol","smiles":"CCO","source":"具体来源"}]`。1–32 项、唯一 ID。服务器按固定 ETKDG/Meeko 方法生成构象，用户原始 SDF 不会被静默当作相同质子化状态。
- 搜索盒中心和尺寸均为 Å；尺寸每轴 1–60，体积不超过 125000 Å³。线程 1–8，默认 1，seed 42，exhaustiveness 8，最多 9 构象，超时 30 分钟。
- 用户认可具体输入与搜索范围后提交；本地受体将经 `r_files` 上传，配体与参数传到 rdatalinux。已有授权范围不逐阶段重复确认。

## 确定性任务链

`science_viewer` 的 `dock_submit` 使用 `docking` JSON，字段以实际 schema 为准：sessionId/action、requestId、receptorAssetId、ligandAssetId、expectedReceptorVersion、expectedLigandVersion、preparationSource、box `{center:[x,y,z],size:[x,y,z]}`、threads。外层 sessionId 必须是当前任务。

外层动作带 `dock_` 前缀，内层 `docking.action` 使用 `list/submit/status/cancel`，例如状态查询为 `{"sessionId":"当前会话 ID","action":"dock_status","docking":{"sessionId":"当前会话 ID","action":"status","runId":"已返回的 Run ID"}}`。资产 ID、版本和 Run ID 必须取自工具实际返回；示例字符串不能直接提交。

保留同一个 requestId 查询或重试相同提交；结构哈希、输入版本、准备记录、搜索盒、seed 或其他参数改变时使用新配置。Host 持久化快照与 fingerprint，经现有 `research_workflow` 调用唯一允许的 `biomni.tool.pharmacology.docking_autodock_vina`，记录本地 Run 和远程 job ID。断线先 `dock_status` 对账，不能换 ID 盲目重算。取消只操作属于当前项目且绑定本请求的任务。

`inputsCurrent=false` 表示原始输入已变化或不可读：保留历史快照结果，并将关联解释/主张标记为需要重新检查。`analysisComplete=true` 只表示计算产物校验完成，不能替代科学复核或人工认可。

## 产物与允许主张

计算 succeeded 和产物核验通过是两个状态。Host 必须取回并核验 Manifest SHA-256、实际 worker invocation、受体快照、配体 SMILES、搜索盒、seed、分数和 SDF/PDBQT 构象；拒绝不匹配或被修改的文件。首个 SDF 构象登记为本地资产，可用 `molecule_open` 查看；完整 PDBQT 与结果登记 Artifact，并保留 Run/输入来源及待复核标记。

仅报告“在所记录受体准备、搜索盒和模型下得到的计算构象/评分”。Vina score 不是实测亲和力、致病机制、人体有效性或疗效；不自动将负分数写成结合已被证实。正式研究中的主张仍遵循研究冻结、证据登记与人工审阅。

若后端尚未部署所需 hash/SDF 产物合同，保留明确错误与原 Run，不能用缺失的结果伪造成功。
