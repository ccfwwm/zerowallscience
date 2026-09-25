---
name: zerowall-brainglobe
description: 在 ZeroWall 查看 BrainGlobe 图谱切片，并通过 Host 调用脑区、配准和细胞定位操作。
---

# BrainGlobe 脑图谱

## 7.0.5 查看入口

使用托管图谱或已登记的 TIFF/NPY 等项目数据。进入或返回脑图谱查看器时不启动引擎、不恢复旧图谱/切片；安装托管图谱也不自动登记项目资产。只有用户明确点击“打开脑图谱”后才调用 `brain_open`（路由别名 `brainglobe_open`），点击“读取切片”后才调用 `brain_analyze`。`science_workbench(tool=brainglobe, action=analyze)` 必须显式传入 `operation`，不能默认执行 `brain_open`。托管 Python/图谱未安装时显示“引擎未配置”；没有输入时显示“请先选择资产”；启动原生进程时仅报告“进程已启动，窗口状态待确认”。配准、区域统计、cellfinder、brainrender 和导出不放入默认查看器。通过 `science_workbench(tool=brainglobe, skill_id=zerowall-brainglobe, action_id=brain_analyze, operation=brain_analyze, viewer_id=..., request_id=...)` 或对应真实 action 执行，核对 Run、坐标系、产物 URI 与 SHA-256。外部 TIFF 文件导入上限 20 GiB；托管图谱按实际引擎资源限制。

Use the persisted ZeroWall research objects and the current Host/Runner schemas. Keep source, version, unit, applicability, and access state explicit; unknown values remain unknown. Register inputs and parameters before execution, use deterministic runners for numeric outputs, and retain manifests, logs, failures, conflicts, and limitations. Do not claim a professional workflow is available unless the executable adapter and validation artifact are present. A frozen question, plan, or candidate set is immutable: propose an amendment and new version. Escalate only the two research gates: freeze the primary question and validation plan, then approve the final claims.


## Domain constraints

BrainGlobe 与 napari 使用同一套 ZeroWall 稳定 Python；图谱数据由 Host 托管。分析前报告图谱、配准、细胞检测和 CPU/GPU 能力，不修改系统 Python 或用户自己的 napari 安装。

通过 Host 的 `getScientificEngineConfigs` 和 `probeScientificEngine` 读取 `brain-globe` 配置与状态；默认使用 `%APPDATA%\zerowall-science\Python\python.exe`，也接受显式的 `ZEROWALL_BRAINGLOBE_PYTHON`。只有四个组件版本均可读取时才报告环境可用；环境探测不等同于 Allen 图谱、brainreg、cellfinder 或 brainrender Runner 已完成。图谱操作须等前一个 Host action 完成，避免并发占用单个 BrainGlobe runner。

配置 `ZEROWALL_BRAINGLOBE_DIR` 指向包含 `brainglobe-atlasapi` 目录的受管理根目录后，使用 `science_viewer`：

- `brain_open`：登记 Allen 小鼠 CCF 25 µm 图谱 ViewerSession，返回真实分辨率、体积尺寸和结构摘要。
- `brain_analyze`：传 `brain_axis`、`brain_index`、`brain_downsample` 查看真实 annotation 切片，或传 `brain_region` 查询结构并可得到体素体积。
- `brain_cells`：传 `brain_coordinates` 与 `brain_coordinate_units=voxel|micron`，将坐标映射到结构和左右半球。坐标必须为 Allen 图谱数组 AP、SI、RL 轴序、ASR 原点，从零开始；micron 同样从该原点量取。禁止直接传 cellfinder 的 x,y,z 或样本坐标，必须有独立核验的配准变换。Host/Runner 拒绝非有限值，负数和达到/超过轴长度的坐标记为图谱外，绝不利用负索引回绕。
- `brain_trajectory`：按输入顺序登记坐标轨迹；这是有序脑区标注，不是纤维束追踪。
- `brain_export`：将切片、脑区或坐标分析写入带 Runner、atlas 版本、Viewer 修订和 `scientificReview: pending` 的 Artifact。
- `brain_register`：对项目内本地图像堆栈执行受限 brainreg CLI；必须通过 `brainreg.json`、注册图谱文件、非空输出和 SHA-256 审计后才登记 Artifact。
- `brain_transform`：通过 `brain_transform` JSON 参数传 `action=inspect|map`、`registrationArtifactId`；map 还需要 `coordinateSpace=brainreg-downsampled-asr-voxel` 和 `coordinates`。仅支持经核验的 brainreg 1.0.16 契约：源为产物内 downsampled.tiff 零起点 ASR 数组网格，三线性插值绝对 atlas-mm 场，导出 atlas-ASR-micron。Host 检查当前图谱版本/几何和执行前后文件哈希。原始相机坐标或 cellfinder XYZ 仍不可直接转换；不能猜测轴交换或缩放。
- `brain_cellfinder`：对项目内 `.npy`/TIFF 三维信号体执行真实 cellfinder；支持零背景或同尺寸背景、平面范围和检测模式，输出保留原始像素坐标与源哈希，不自动映射脑区。
- `brain_render`：用真实 brainrender 生成 PNG 和 HTML 三维场景；脑区使用 atlas 名称/缩写，坐标必须明确为 micron，场景是可追踪可视化产物，不是解剖或机制证据。

图谱元数据和 annotation 来自实际 BrainGlobe atlasapi。传输的结构列表、坐标行和切片标签有界；图谱外坐标明确单列计数，未知单位/方向、损坏的 ontology 或缺失受管理目录必须报告并停止。cellfinder 检测、brainreg 配准和 brainrender 场景仍需人工科学复核，不能由 Runner 成功退出或图像存在推断为已验证结论。

brainreg/cellfinder 使用 CPU，最多 8 个工作线程/CPU，监测本任务进程树 24 GiB RSS 预算（0.5 秒采样，超限中断），启动至少需 2 GiB 可用内存；cellfinder 首版仅接受 ≤256³ 体素，detection batch=4。预算不是操作系统级硬内存隔离。固定三点合成样例的默认检测只检出 2/3，已记录漏检，禁止声称生物灵敏度或完整阳性基准通过；完整解剖配准质量、分类模型和原始样本坐标变换仍未验收。
