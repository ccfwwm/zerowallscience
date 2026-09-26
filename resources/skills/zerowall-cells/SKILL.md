---
name: zerowall-cells
description: 在 ZeroWall 中打开本地 AnnData/H5AD，查看已有嵌入和基因表达，导出全量 X 描述统计；不执行聚类或供者级推断。
---

# AnnData 细胞查看器

## 7.0.5 查看入口

选择 H5AD 并导入项目；导入上限 20 GiB，h5py/NumPy 与数据预览还有自身限制。工作台调用 `cell_open`（路由别名 `cells_open`）展示嵌入图，默认只允许选择嵌入、缩放、平移和刷新。未选择资产提示“请先选择资产”；Python 依赖缺失提示“引擎未配置”；解析失败提示“打开失败”。QC、细胞筛选与导出由本 skill 调用 `science_workbench(tool=cells, skill_id=zerowall-cells, action_id=cell_analyze, viewer_id=..., request_id=...)` 或相应 action。核对返回 Run/Artifact、源数据哈希和输出校验和。

先发现 `science_viewer`，再使用 `cell_open`、`cell_read`、`cell_analyze` 或 `cell_export`。资产必须是当前项目内已登记的本地 `.h5ad`/`.h5` 文件；远程文件先经 `r_files` 物化并校验哈希。矩阵保持 backed 分块读取，不把全量表达矩阵写入 Agent 上下文或浏览器。运行依赖 Python 3.12.10、h5py 和 NumPy；Host 只使用 ZeroWall Science 唯一共享 Python 和 site-packages。缺依赖时通过 Python 环境设置安装，不切换到 PATH 上的 Python，也不创建环境。

- `cell_open` 返回 AnnData 维度、obs/var 字段、嵌入键和有界细胞/嵌入预览，并创建可恢复的 ViewerSession。预览固定为前 N 个细胞，不代表随机样本；`cell_limit` 限 1–10,000，`embedding_limit` 独立限 1–200,000，实际嵌入数量不超过 observation 数量。
- `embedding` 使用真实 `obsm` 键（常见为 `X_umap` 或 `X_pca`）；未指定时优先选择 UMAP，再选择第一个二维以上嵌入。
- `gene` 必须唯一匹配 `var` 属性 `_index` 指定的索引列（无属性时接受 `_index` 列），表达值直接来自存储的 `X`。未知、重复基因名或非有限表达值会拒绝，不能替换成零。基因名预览超过 10,000 条时截断，但基因查询检查完整索引。
- `group_by` 只能使用真实 `obs` 列；QC 与基因汇总覆盖全量 X，不受预览截断影响。X 尺度未知时，行总和不能称为原始 counts，非零 feature 数也不是 marker。描述统计不等于差异表达、聚类或供者级推断。
- `cell_export` 登记含源资产哈希、ViewerSession 版本、参数、运行器版本和 QC 的 JSON Artifact。源文件变化或查看器版本冲突必须重新打开/刷新，不能覆盖旧结果。

读/分析/导出传入返回的 `viewer_id`、`expected_revision`。示例：`{"action":"cell_export","viewer_id":"实际ID","expected_revision":1,"gene":"实际基因名","group_by":"实际obs列"}`。传空字符串可清除 gene/group_by；embedding 空字符串恢复自动选择。导出记录脚本哈希、Python/h5py/NumPy 版本和 `scientificReview: pending`。

当前接受 dense、排序且无重复索引的 CSR/CSC；外部/虚拟 HDF5 数据集会拒绝。单文件最大 20 GiB、局部维度上限 200 万细胞 × 20 万 feature；这些是拒绝边界，不是性能承诺。读取串行，计算子进程限 120 秒，返回最多 32 MiB，超出时明确失败。

默认界面只显示已有嵌入的前两维散点和查看动作；更换文件立即清空旧图，打开失败不能保留旧资产画面。索引支持普通一维 Dataset、categorical 和 nullable 字符串 Group；nullable 索引存在缺失值时拒绝。超过 10,000 个嵌入点时使用 WebGL GPU 缓冲，缩放和平移只更新相机 uniform，不重复上传点数据；WebGL 不可用时有界抽稀到 4,000 点显示并标明抽稀数量。默认上限 100,000 点。表达/分组着色、视图恢复、分析与多边形选区从 skill action 进入。视角由 `{zoom:1..100,panX:-200..200,panY:-200..200}` 保存，切换 embedding 重置。`cell_select` 将 `cell_selection` 的 `{embedding, axes:[0,1], polygon:[[x,y],...]}` 保存到当前 ViewerSession；坐标是 H5AD 嵌入坐标，不是屏幕像素。传 null 清除选区。多边形需要 3–128 个顶点、有限且非零面积；匹配使用奇偶规则，包含边界，浮点绝对容差 1e-10。

选区分块匹配全部 observation，不能将 previewIndices 的长度当作全量选中数量。`cell_export_selection` 使用保存的几何，输出完整 CSV（0-based 行号与 cell_id）和 manifest；同名细胞仍由行号区分。CSV 保留原始标识，不自动重命名或合并。切换嵌入清除旧选区；源文件变化要求重新打开，历史产物保留源哈希。已用 100,005 个合成细胞验证跨预览边界选出/导出 50,000 个细胞，但这不代表全量渲染性能已通过。

当前 WebGL 路径已覆盖最多 200,000 个二维 embedding 点的前 N 顺序显示、GPU 缓冲、缩放/平移和选区高亮；尚未完成 3D 交互、标签掩膜、聚类、marker、供者级 pseudobulk，也尚未完成 packaged Electron 的首屏、峰值内存和完整交互性能门。没有供者/配对信息时不得升级为组间推断。
