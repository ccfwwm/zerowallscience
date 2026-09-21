---
name: zerowall-brainglobe
description: ZeroWall Science 7.0.0 brainglobe workflow; use only when the corresponding research or viewer task is requested.
---

# brainglobe

Use the persisted ZeroWall research objects and the current Host/Runner schemas. Keep source, version, unit, applicability, and access state explicit; unknown values remain unknown. Register inputs and parameters before execution, use deterministic runners for numeric outputs, and retain manifests, logs, failures, conflicts, and limitations. Do not claim a professional workflow is available unless the executable adapter and validation artifact are present. A frozen question, plan, or candidate set is immutable: propose an amendment and new version. Escalate only the two research gates: freeze the primary question and validation plan, then approve the final claims.


## Domain constraints

BrainGlobe is a separate managed environment. Do not modify the user napari environment. Report atlas, registration, cell-detection and CPU/GPU capability before analysis.

通过 Host 的 `probeScientificEngines` 查看 `brainglobe` 状态；只有显式配置 `ZEROWALL_BRAINGLOBE_PYTHON` 且四个组件版本均可读取时才报告环境可用。环境探测不等同于 Allen 图谱、brainreg、cellfinder 或 brainrender Runner 已完成。

配置 `ZEROWALL_BRAINGLOBE_DIR` 指向包含 `brainglobe-atlasapi` 目录的受管理根目录后，使用 `science_viewer`：

- `brain_open`：登记 Allen 小鼠 CCF 25 µm 图谱 ViewerSession，返回真实分辨率、体积尺寸和结构摘要。
- `brain_analyze`：传 `brain_axis`、`brain_index`、`brain_downsample` 查看真实 annotation 切片，或传 `brain_region` 查询结构并可得到体素体积。
- `brain_cells`：传 `brain_coordinates` 与 `brain_coordinate_units=voxel|micron`，将坐标映射到结构和左右半球。
- `brain_trajectory`：按输入顺序登记坐标轨迹；这是有序脑区标注，不是纤维束追踪。
- `brain_export`：将切片、脑区或坐标分析写入带 Runner、atlas 版本、Viewer 修订和 `scientificReview: pending` 的 Artifact。

图谱元数据和 annotation 来自实际 BrainGlobe atlasapi。传输的结构列表、坐标行和切片标签有界；任何超出 atlas、未知单位或缺失受管理目录的情况都必须报告并停止。brainreg/cellfinder/brainrender 的完整配准、细胞检测与三维渲染仍需单独 Runner，不可由上述查询结果推断。

