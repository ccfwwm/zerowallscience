# BrainGlobe 配准坐标变换与检测验收（7.0.0）

2026-09-22。实现版本 `zerowall-brainglobe/7.0.0-3`。此报告区分坐标软件正确性、检测功能和解剖质量；不将合成测试当作真实脑配准验证。

## 已实现链路

科研工作台脑图谱页增加配准产物选择、契约核验、坐标转换、可追踪 JSON 导出及填回图谱坐标框。客户端与 Agent 共用 `BrainTransformService`；RPC 为 `brainTransform`，工具为 `science_viewer action=brain_transform`，嵌套 JSON 放在 `brain_transform`。

源坐标严格为选定 `downsampled.tiff` 的零起点 ASR 数组轴序。brainreg 1.0.16 将原始输入重采样并重定向为图谱轴序；NiftyReg 参考图为降采样样本、浮动图为 atlas。三个 `deformation_field_*.tiff` 的值是 atlas 绝对毫米坐标，不是位移、voxel 或原始相机 XYZ。三线性插值后乘 1000 得到 atlas-ASR-micron。样本插值域为闭区间 `[0, shape-1]`，图谱查询域为 `[0, shape)`。

契约记录 producer、图谱版本与几何、方向、单位、插值方法、四个原始体数据的大小和 SHA-256。Host 核验项目归属、manifest checksum、固定文件名、项目路径、实际当前图谱版本/形状/分辨率、执行前后文件哈希；不接受旧的无契约配准产物。导出保持 `scientificReview=pending`。

## 实际验证

| 验证 | 结果 | 产物目录 |
|---|---|---|
| 实际 NiftyReg 生成恒等、平移、轴置换、反射场，与独立矩阵乘法比较整数/分数/边界点 | 4 组通过；最大误差 0.000143051 µm，小于预设 0.001 µm | `.build/brain-transform-smoke/2026-09-22T06-10-50.184Z` |
| React → Host → 当前受管理 atlas 核验 → 转换 → Artifact 导出，Chromium 实际操作和截图 | 通过，1 点转换与 2 点源网格外；导出哈希通过、浏览器错误 0 | `.build/brain-transform-ui-smoke/2026-09-22T06-21-47.949Z` |
| 固定 64×128×128 三个高斯 soma，真实 cellfinder CPU 默认阈值 | **部分通过**：2/3 检出、漏检 1、额外检测 0，匹配点最大距离 1.414214 µm；未按漏检调整阈值或样例 | `.build/brain-cellfinder-positive/2026-09-22T06-26-40.706Z` |
| 同一 cellfinder 输入分别经直接 engine 和实际 Host | 数量和所有原始 XYZ 坐标相同，Host 登记 source/hash/参数/候选产物 | 同上 |

工具脚本：`tools/integration/brain-transform-reference.py`、`brain-transform-smoke.ts`、`brain-transform-ui-smoke.ts`、`brain-cellfinder-positive-smoke.ts`。脚本须显式 `--run`；独立测试目录和数据库不写用户研究。

## 资源与可复现性

- brainreg/cellfinder 最多 8 个 CPU 工作线程/CPU，cellfinder batch=4；不启用 GPU。cellfinder 限制 ≤256³ 体素并按平面检查非有限值，先验证尺寸再分配背景。
- 重任务启动至少需要 2 GiB 可用内存；守护线程每 0.5 秒采样本任务进程树 RSS，超过 24 GiB 杀掉自己的子进程后退出。此为应用层采样预算，会重复计算共享 RSS 且短时峰值可能超过限额，不能宣称操作系统级硬隔离。
- Host 超时仅终止自己的进程树，避免 NiftyReg/检测子进程成为孤儿。现有 brainreg 30 分钟、cellfinder 300 秒限制保留。
- Host 关闭时两个 Brain 服务立即拒绝新任务、终止自有进程树，并等待当前任务和进程 close 后才允许关闭 ResearchStore；迟到的计算结果不能登记 Viewer/Artifact。Windows 实际父/孙进程停止、延迟结果抑制和关闭后请求拒绝已有回归测试。
- brainreg 仅接收项目内 TIFF 堆栈或 TIFF 切片目录，生成显式文件清单；不执行用户提供的任意文本路径列表。输入文件执行前后核对哈希。cellfinder 同样核对信号与背景前后哈希。
- brainreg 配置显式绑定受管理 atlas 目录，不更改全局配置、不覆盖 Fiji/napari。

## 尚未完成，不能计为发布通过

原始样本/相机/cellfinder XYZ → downsampled-ASR 的重采样坐标转换；真实解剖脑体的配准质量和独立地标参考；cellfinder 分类模型、真实细胞检测灵敏度/特异度；全脑重任务量级性能。合成检测存在漏检，应保持候选和复核状态。上述几何通过不能消除这些发布缺口。
