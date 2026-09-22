# 7.0.0 Vina 分子对接实施与验收

本模块复用持久化 `research_workflow`、固定 Biomni 目录工具 `biomni.tool.pharmacology.docking_autodock_vina` 与现有 `r_files` 文件链路。工作台不提供任意 Python/R/shell 执行框。GUI `moleculeDocking` 和 Agent `science_viewer` 的 `dock_list/dock_submit/dock_status/dock_cancel` 均进入同一 Host 服务。

## 输入与操作

1. 将已准备的刚性受体 PDBQT 和配体 JSON 登记为当前项目的本地资产。
2. 配体 JSON 格式为 `[{"id":"ethanol","smiles":"CCO","source":"输入来源"}]`。最多 32 个配体，ID 必须唯一，每个配体保留来源。
3. 在分子结构页展开“Vina 分子对接 · 远程 CPU”，选择资产，填写准备记录、以 Å 为单位的盒中心/尺寸和线程数。
4. 准备记录应说明来源结构、软件/版本、质子化与保留的水/离子/辅因子。本版不自动推测缺失信息。
5. 明确点击“上传受体并提交 Vina”，上传固定受体快照和配体参数。切换视图或关闭面板不会取消任务；历史任务可刷新取回，取消为单独操作。
6. 结果完成后查看首个 SDF 构象；全套 PDBQT 构象、运行请求、结果和受体快照登记为产物。分数仅用于给定准备与搜索条件下的计算比较。

搜索参数限定线程 1–8、每轴盒尺寸 1–60 Å、体积不超过 125000 Å³。固定 seed 42、exhaustiveness 8、最多 9 个构象、30 分钟工具超时；项目内最多一个活跃对接任务。受体上限 16 MiB，配体列表上限 1 MiB。服务器依赖及受体哈希契约未就绪时，预检拒绝提交。

## 恢复与证据检查

- 请求 ID 对应不可变快照和参数指纹。相同 ID 不重复计算；输入变化必须使用新 ID。断线后按持久 Run 对账，包含远程提交后、本地确认事件写入前的中断窗口。
- 快照保存资产 ID/版本、输入 SHA-256、准备来源、配体来源、盒、线程、固定算法参数和 Runner 版本 `zerowall-vina/7.0.0-1`。
- 同一结果分别记录计算终态、产物验收和科学复核。`succeeded` 不代表 `analysisComplete`，也不赋予人工批准。
- 从 Manifest 取回产物并检查长度/哈希；逐项核对 `worker-request.json` 实际执行参数、结果中的受体哈希和盒、配体索引和 SMILES、有限分数。
- 受体快照必须与上传输入哈希一致；首个 SDF 和 PDBQT 构象的所有重原子数量/元素/一一对应坐标必须一致，容差 0.002 Å；PDBQT 第一构象分数与结构化结果容差 0.0011 kcal/mol。
- 全部产物验收通过后才登记本地 SDF 资产。重复刷新复用同一校验和产物；输入后来变化或不可读会标记 `inputsCurrent=false`，历史结果仍保留原始快照，关联主张须重新检查。
- 对接评分不能登记为实测亲和力、人体机制、疗效或自动成为核心医学主张。

## 验收状态

2026-09-22：9 项 Host/验证测试及 2 项界面测试通过，research Host/client TypeScript 检查通过。覆盖幂等恢复、参数冲突、跨项目取消拒绝、产物篡改、实际执行参数错配、构象坐标错配、输入变更和提交确认丢失。

真实验收入口：

```powershell
node tools/integration/run-molecule-docking-live.mjs --run
```

该显式命令通过现有 SSH 读取 rmcp 配置，仅在子进程内存传递凭据；执行公共 AutoDock-Vina 示例准备受体与乙醇的单线程任务，并通过真实 React → Host → rmcp → Vina → r_files → Mol* 完成取回和显示。数据来自固定 Git blob `aa63f0da2ab4ca2772dc011241e451ded256d2d2`，实验输入不包含用户科研数据。产物和截图写入 `.build/molecule-docking-live/<timestamp>`。

2026-09-22 真实链路通过，完整测试耗时 29.09 秒，报告与实际显示截图位于 `.build/molecule-docking-live/2026-09-22T04-41-31.237Z`。Host Run `714b27c3-99d1-486c-bfae-372d09f495a7`，远程 job `3dd80b4f-2a97-49ff-8a6c-372dde5e6d70`，乙醇 Vina score 为 -2.581 kcal/mol；实际生成并核验 5 份产物，9 原子/8 键 SDF 在 Mol* 显示，页面重新打开恢复历史任务成功。受体 SHA-256 为 `f13cf3b36f61d87c3b58983e0b8ecf1c3456a685eb86dfe9ccfb139c7bdc2586`。运行中发现并修正 R Gateway 单元素 catalog 数组简化的兼容问题，并保留回归测试。此样例只证明软件链路，不验证对已知配体的重对接精度、生物学效应、一般对接成功率或 packaged Electron 交互。

## 尚存边界

本版入口要求受体已准备为刚性 PDBQT；不包含交互式修复缺失残基、质子化方案比较或柔性受体准备。当前可复核每个配体的第一个构象，其余构象保留为 PDBQT 产物；未提供多构象切换/受体叠合的专用分析面板。SMILES 的嵌入及氢/电荷策略受固定 RDKit/Meeko 环境控制，必须保留其版本。来源结构、pH 和原始准备合理性仍需研究者复核。
