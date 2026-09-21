# ZeroWall Science 7.0.0 实施与验收记录

更新：2026-09-22。目标仍为用户确认的完整 P0–P5 方案；本文不是发布完成声明。安装包、九类专业流程、远程计算、先导比较必须分别通过验收，不能由局部测试替代。

## 本轮落地

- 新增 `plugins/research/src/host/native-engines.ts`。同一服务供工作台 RPC 和 `science_viewer` Agent 工具使用；根据真实会话解析项目，拒绝外项目资产、远程未落地资产、目录联接越界和脚本文件。当前原生打开格式为 TIFF/PNG/JPEG/BMP；更广格式仍需适配。
- 固定 argv、`shell: false`，监听真实 spawn/error/close；记录启动、失败、退出和 Host 重启后的未知状态。`guiReady` 保持 `unverified`，不会把创建进程登记为分析完成。
- 引擎生命周期记录到项目审计事件，使用独立递增序号，避免同毫秒事件按随机 ID 排序造成状态倒退。保留最多 8,000 字符的进程输出尾部。不会用历史 PID 杀进程。
- 新增 `native-engine-panel.tsx`：图像资产选择、Fiji/napari 启动、状态刷新和启动日志；切换工作台页面保留原生窗口。Host 退出也保留原生编辑，进程清理与未保存编辑的完整生命周期仍需后续完善。
- 修复实际 ToolRuntime 调用研究服务时的 Cordis 注入错误，新增真实工具注册/执行测试。Agent 不可批准科研门禁，不可用提案工具写入计算证据或主张。
- Fiji/napari Skills 改为真实 `science_viewer` schema 示例，并绑定工具发现；序列工具的真实链路覆盖打开、选择、保存、计算、导出和源文件/版本检查。
- 将工作台严格 TypeScript 检查加入研究插件日常 `typecheck`；基础客户端配置原来使用 `noCheck`，不能把该步骤单独当作严格类型验收。

## 本机引擎实测与修复

执行入口：`pnpm exec tsx tools/integration/native-engine-smoke.ts --run`。脚本创建独立 SQLite 项目和合成 64×64 PNG，使用产品服务启动两个原生引擎；不读取用户科研数据、不修改现有引擎安装。测试报告写入 `.build/science-native-smoke/<时间>/report.json`。

1. 初次 napari 实际退出码 `3228369023`（`0xc06d007f`）。`-X faulthandler` 定位到 NumPy `linalg.inv`；单独矩阵求逆也能复现，不能当作 OpenGL 故障。
2. 检查本机 Conda 的 `cwp.py` 启动包装后，仅为子进程补入环境根目录、`Library/mingw-w64/bin`、`Library/usr/bin`、`Library/bin`、`Scripts` 和 `CONDA_PREFIX`。随后矩阵求逆、原生 Viewer 创建以及产品服务打开测试图像均成功。没有 pip/conda 安装、降级或用户环境修改。
3. Fiji 的 Jaunch `--allow-multiple` 仍会进入 ImageJ Legacy 单实例连接逻辑，实测出现 RMI 连接失败。检查已安装 `imagej-legacy-2.0.3.jar` 的 `SingleInstanceArgument` 后增加 `--forbid-single-instance`，避开该逻辑，不删除用户临时 stub 文件。
4. 最终进程报告目录：`.build/science-native-smoke/2026-09-21T08-49-16.483Z/`。运行观察期间两个进程存活；Fiji 有指定图像窗口，napari 的真实窗口树有 `ZeroWall-native-smoke-64x64` 图层和 Ready 状态。
5. 本轮 Windows 截图工具返回桌面背景，激活/点击存在超时；因此画布像素显示、通道/Z/T 操作、2D/3D、ROI 编辑均不记为视觉验收通过。上述测试只证明进程、窗口与图层加载链路。关闭本次合成数据进程后的非零退出是测试清理，不是自然运行失败；须结合清理前报告判断。

## 自动验证

截至 2026-09-22 最新相关回归（下方追加章节保留各轮历史结果）：

| 命令 | 结果 | 证明范围 |
|---|---|---|
| `pnpm --filter @zerowallscience/plugin-research test` | 90 项通过 | 研究上下文、方法检查、H5AD 细胞查看、序列/Sanger/Flow/HE/Canvas 服务/UI、原生启动/UI、真实 ToolRuntime；不代表九类工具完成 |
| `pnpm --filter @zerowallscience/research-store test` | 31 项通过 | 包含 schema 15、任务图非拓扑快照导入、预算阻断、失败传播、ViewerSession 版本/隔离/快照和注释分支 |
| `pnpm --filter @zerowallscience/plugin-base exec vitest run --config ../../vitest.plugins.config.ts test/research-skill-bindings.spec.ts` | 17 项通过 | 技能加载后的工具绑定；该测试使用 fixture tool，不能替代领域实算 |
| `pnpm plugins:typert` | 13 个远程插件生成成功 | 包含新原生启动 RPC 与 `science_viewer` 类型 |
| `pnpm --filter @zerowallscience/plugin-research run typecheck` | 通过 | Host、Sanger 面板和新增工作台严格检查 |
| `pnpm --filter @zerowallscience/plugin-research run bundle` | 通过 | 研究插件 Host/client 构建；不是 Electron 安装包 |

## 全方案剩余验收范围

| 方案范围 | 当前证据 | 尚须实现/验收 |
|---|---|---|
| P0：全软件与双仓能力审计 | 本地 Store、研究插件、引擎局部验证 | 全量能力矩阵、raiagentai 对应提交/依赖、全领域适用性审计 |
| P1：研究底座与编排 | 研究对象、冻结/修订/门禁、会话上下文已有基础 | 完整任务图/预算/重启恢复、角色权限、下游失效传播、报告、成功与合理停止端到端 |
| 六页工作台与共同资产 | 页面骨架、序列会话、原生打开 | 各类工具资产/产物直达、完整多标签恢复、聊天选区引用、坐标契约、画布联通 |
| 细胞 | H5AD/AnnData backed 元数据、obs/var、UMAP/PCA 预览、基因表达预览、QC/分组统计和带哈希 Artifact 已通过真实 h5py 测试；ViewerSession 已接入工作台和 `science_viewer`；新增全量多边形圈选及 CSV 集合导出 | 标签、WebGL、聚类、marker、供者级 pseudobulk/差异表达和 10 万细胞完整交互性能 |
| ImageJ/多维图像 | 原生启动及序列之外的图像文件传递 | 内置 TIFF/OME-TIFF/OME-Zarr、轴/尺度/ROI、五类实验宏和参考数据、原生修订回传/冲突、10 GiB 性能 |
| HE | SVS/NDPI/TIFF 受限首层解码、原图坐标 ROI、颜色/亮度统计、核样本启发式比例和 JSON 产物已接入工作台与 `science_viewer` | OpenSlide 瓦片流、物理标定、StarDist CPU 分块、组织区域模型、批处理和诊断边界仍未验收 |
| 分子结构 | 既有能力待复核 | Mol* PDB/mmCIF/SDF 交互、准备、搜索盒、RDKit/Meeko/Vina 与构象复核 |
| 序列 | FASTA 核酸查看、反向互补、翻译、五种线性精确酶位点 | GenBank/图谱/注释、引物/PCR、Gibson/Golden Gate、固定参考 SpCas9/NGG 三错配检索 |
| Sanger | SCF 1/2/3 与 ABIF/AB1 常见 DATA9–12/PBAS/PLOC/PCON 解析、四色峰图、PCON→Phred 存储置信度、移动窗口端点裁剪、全局参考比对、双向反向互补核对、JSON/FASTA 产物导出和源哈希/版本校验已实现；内置工作台面板与 `science_viewer` 的 `sanger_open/analyze/export/review` 已接入 | 峰图人工修订、混合峰/IUPAC 证据和真实仪器回归仍未验收 |
| 流式 | FCS 3.0 有界解析、整数/32 位浮点事件、显式 spillover 补偿、none/arcsinh 变换、顺序矩形与多边形门控、散点预览和 Polygon GatingML 子集导出已接入工作台与 `science_viewer` | FlowJo 子集兼容、补偿独立参考、批处理和 100 万事件性能仍未验收 |
| 科研画布 | 既有产物入口待复核 | 可编辑多面板、轴/图例/比例尺、数据溯源、PNG/SVG/PDF |
| 脑图谱 | Allen CCF 25 µm atlasapi 查看、切片/脑区/坐标查询；brainreg 输出审计；真实 cellfinder 检测与 brainrender PNG/HTML 场景已接入 | brainreg 解剖配准质量基准、cellfinder 真实阳性参考、跨坐标变换/脑区统计、CPU 性能门仍需扩展 |
| P2：临床/遗传/组学 | 确定性 metadata 方法检查，不等于执行 Runner | NHANES 通用契约/权重/domain；MR/共定位/MVMR 隔离环境与数值参考；bulk 配对/协变量、单细胞 pseudobulk、干预重复测量 |
| 肥胖—脱发案例 | 模板，表型待核验 | 真实数据侦察、人工门禁一、可用分支/合理停止、证据与冲突、IMRAD 和人工门禁二 |
| 系统提示词与 Skills | 核心提示词、动态研究上下文与部分 Skills | 全量技能审计、角色规则/规范哈希、覆盖来源展示、学术写作主张审计、所有领域真实工具链 |
| P4：先导与对照 | 未运行 | 12 项冻结基准、四条件 48 次、预算/评分/失败/成本、独立复核状态 |
| rdatalinux | 本轮未部署或修改生产环境 | raiagentai 独立服务/队列、限额、隔离依赖、Gateway/r_files、幂等/断网/排空/回滚 |
| P5：打包和发布候选 | 源码版本标为 7.0.0，研究插件可构建 | 全软件回归、迁移/旧快照/跨项目、packaged Host/Electron、Windows x64 安装包实际安装启动、引擎包/许可证/哈希/离线导入/回滚 |

下一实施链路：先补齐 Sanger 的 AB1 独立解析评估、双向核对和人工修订记录，再补齐图像多维/分块契约、Fiji 另外四类 Runner 及样例；同时继续 P1 编排和 P2 方法层，不将专业工具卡片或技能目录当作交付。只有完整方案逐项具备代码、运行产物和适当验收证据，才能将总目标标记完成。

## 2026-09-21 continuation: native ROI bridge and Western blot Runner

- `annotation-adapters.ts` now contains bundled Fiji Jython and napari adapters. The bridge passes a validated JSON request, verifies the source SHA-256 and geometry, preserves the workbench pixel-edge coordinate contract, and writes an exclusive return file. It supports single-page rectangles, polygons, and points. Fiji and napari layer readiness was exercised with installed local engines; the test did not claim pixel-level GUI acceptance.
- `annotation_launch` and `annotation_collect` are available in `science_viewer`. Collection checks the launch ID, source hash, base revision, engine origin, immutable request and geometry. `ResearchStore.collectNativeAnnotation` makes registration idempotent across SQLite connections. Stale returns become conflict revisions; accepted ROI changes invalidate dependent artifacts, evidence and claims.
- Added the first deterministic Fiji analysis Runner: `fiji.western-blot.v1`. It requires saved band/background/loading ROIs, explicit dark/bright polarity, acquisition saturation limits and a normalization policy. The runner uses ImageJ raw-pixel rasterized ROIs, rejects RGB/hyperstack inputs, emits measurements, ROI files, CSV, a headless QC overlay and a result manifest. It keeps clipped and non-positive values visible and does not infer biological significance.
- `FijiWorkflowService` persists request fingerprints, uses `fiji-workflow` runs, limits local heavy computation to one active job, harvests only a matching completion manifest, registers checksummed artifacts and marks outputs for review when the source/ROI head changes. `research_workflow` exposes the local `fiji` catalog alongside the remote modules.

### New verification evidence

| Command | Result | Scope |
|---|---|---|
| `pnpm --filter @zerowallscience/research-store test` | 28 passed | schema 13, annotation branches, atomic native collection, snapshots and invalidation |
| `pnpm --filter @zerowallscience/plugin-research test` | 53 passed | image/native/sequence/workbench UI, ToolRuntime, native bridge tests and Western blot UI integration boundaries |
| `pnpm --filter @zerowallscience/plugin-research run typecheck` | passed | Host, client and strict workbench TypeScript |
| `pnpm exec tsx tools/integration/annotation-adapter-smoke.ts --run` | napari and Fiji numeric adapter checks passed | installed local APIs, coordinate conversion, transform rejection and exclusive return files |
| `pnpm exec tsx tools/integration/annotation-adapter-smoke.ts --run --gui` | napari and Fiji adapter readiness passed | real Host launch and adapter readiness marker; GUI pixel inspection remains separate |
| `pnpm exec tsx tools/integration/western-blot-smoke.ts --run` | independent reference passed | installed Fiji 1.54p, ImageJ Java 21; expected control ratio 1, treatment ratio 1.5, clipped lane blocked, 16 artifacts, idempotency/recovery/invalidation |

The overall 7.0.0 plan remains incomplete. Canvas, BrainGlobe, OpenSlide/StarDist HE depth, multidimensional/tiled image adapters, complex/FlowJo flow review, AB1/bidirectional Sanger review, full image-backed segmentation for the four non-blot Fiji protocols, NHANES/MR/omics Runner environments, the obesity–alopecia end-to-end evidence case, full pilot comparison, rdatalinux deployment and packaged Windows installer gates still require implementation and verification.

## 2026-09-21 continuation: SCF Sanger trace workflow

- `shared/sanger.ts` validates the 128-byte SCF header, supports documented SCF 1/2 interleaved samples and SCF 3 channel planes/second-difference reconstruction, reads peak indexes/probability planes/called bases, and rejects unsupported versions, offsets and sample widths.
- `SangerService` keeps the source inside the active project, reads with a bounded complete-read loop, verifies registered checksums and file stability, creates a versioned ViewerSession, and exports a manifest plus trimmed FASTA under the project workspace. Export paths are checked before registration; the result records the stored-call probability semantics and reference-alignment limitations.
- The workbench has a Sanger panel with a four-channel SVG trace, endpoint threshold/window controls, optional bounded reference comparison, and traceable export. The Agent tool schema exposes the same actions and parameters. AB1 remains an explicit validation error rather than a silent fallback.

### New Sanger verification evidence

| Command | Result | Scope |
|---|---|---|
| `pnpm --filter @zerowallscience/plugin-research test` | 70 passed | 21 files; SCF parser, Sanger service/UI, FCS parser/Flow service/UI, HE service/UI and previous research-plugin regression |
| `pnpm --filter @zerowallscience/plugin-research run typecheck` | passed | Host, client and workbench strict TypeScript |
| `pnpm plugins:typert` | 13 remote plugins regenerated | Includes Sanger action enum and viewer request fields |

These checks establish a deterministic SCF baseline. They do not establish AB1 compatibility, bidirectional confirmation, instrument-specific peak quality calibration, or full Sanger mutation-review workflow.

## 2026-09-21 continuation: FCS flow workflow

- Added `shared/flow.ts` with bounded FCS 3.0 header/TEXT/DATA parsing, F/I datatype checks, byte-order handling, parameter metadata, spillover matrix parsing, explicit compensation, arcsinh transformation, ordered parent-aware rectangular gates, event counts and a rectangular GatingML subset exporter.
- Added `FlowService` with active-project/source-hash/version checks and traceable JSON/GatingML artifacts, plus a workbench scatter preview and explicit transform/compensation/gate controls.
- Schema 13 extends `ViewerSession.tool` with `flow`; the migration rebuilds the viewer table while preserving existing sequence/image sessions. Store backup tests now cover the v13 upgrade path.

### New flow verification evidence

| Command | Result | Scope |
|---|---|---|
| `pnpm --filter @zerowallscience/plugin-research exec vitest run --config ../../vitest.plugins.config.ts test/flow.spec.ts` | 3 passed | FCS parser, compensation, parent-aware gates, singular-matrix rejection and service export/source-change checks |
| `pnpm --filter @zerowallscience/research-store test` | 28 passed | Schema 13 migration, viewer compatibility, annotations and snapshots |

This is a deterministic FCS baseline. It does not establish FlowJo compatibility, polygon gates, instrument-specific compensation validation or the planned 1,000,000-event performance gate.

## 2026-09-21 continuation: HE slide baseline

- Added `shared/he.ts` and `HeService` for bounded SVS/NDPI/TIFF decoding, first-page metadata, original-pixel ROI validation, deterministic mean RGB and nuclei-like colour/brightness screening, source stability checks and traceable JSON export.
- Added an HE workbench panel with slide selection, ROI coordinates, analysis and export. The UI and Skill explicitly state that the current path is a screening heuristic and does not provide OpenSlide tile streaming, StarDist segmentation or diagnosis.

### New HE verification evidence

| Command | Result | Scope |
|---|---|---|
| `pnpm --filter @zerowallscience/plugin-research exec vitest run --config ../../vitest.plugins.config.ts test/he.spec.ts` | 2 passed | bounded region validation, deterministic RGB/nuclei-like metric and SVS-extension TIFF service export/source-change checks |

This establishes an HE input/ROI baseline only. It is insufficient evidence for whole-slide performance, physical scale, StarDist accuracy, tissue segmentation or clinical use.

## 2026-09-21 continuation: canvas, AB1 and sequence workbench

- 科研画布已完成结构化 CanvasSpec、确定性 SVG、源资产/产物引用、JSON 工程清单导出，并修复客户端嵌套 RPC 类型；验证 72 项研究插件测试、22 个测试文件、严格 TypeScript、Typert 合同和插件构建。
- Sanger 新增受限 ABIF/AB1 解析：校验 ABIF 目录、DATA9–12 16 位通道、PBAS/PLOC/PCON 调用与峰位；缺少必要标签、通道长度不一致或非 16 位原始通道会明确拒绝。SCF 与 AB1 共用版本化查看/分析/导出路径。双向读段、IUPAC 混合峰人工复核和真实仪器回归仍未完成。
- 序列工作台新增 GenBank ORIGIN/基础 feature 坐标读取和 SpCas9/NGG 候选搜索，固定 0–3 错配上限并把限制写入结果；FASTA/GenBank 资产可从工作台打开，Agent schema 同步暴露 CRISPR 参数。该搜索不等于全基因组脱靶或编辑效率评估。

新增验证：`test/sanger.spec.ts` 4 项通过；`test/sequence.spec.ts` 7 项通过；研究插件严格 TypeScript 通过。整体计划仍未完成：多维/金字塔图像、完整 Fiji 四类 Runner、OpenSlide/StarDist、H5AD、Mol*/Vina、BrainGlobe、FlowJo/多边形门、NHANES/MR/组学 Runner、案例先导、rdatalinux 和 Windows 安装包仍需真实实现与验收。

## 2026-09-21 continuation: task graph persistence and recovery rules

- 研究快照导入改为任务 ID 两遍映射：先分配所有新任务 ID，再解析依赖和 `runId`，因此导出顺序不需要是拓扑顺序；任务依赖引用不会因为后续任务尚未插入而失败。
- v14 `research_tasks` 表增加了 DAG 的持久化基础。导入边界现在检查项目/研究归属、重复依赖、自依赖、跨研究依赖、运行归属和循环依赖；循环图被拒绝，不会形成不可恢复的研究状态。
- 任务状态转移收紧为显式状态机。只有 `ready`、失败或阻断任务可以开始新尝试；终态成功和取消不能原地重启；运行绑定的 Run 必须属于同一项目。
- 就绪刷新会传播失败、阻断和取消：下游任务变为 `blocked` 并保留原因；所有依赖成功后才变为 `ready`。任务图 RPC 已接入研究 Host，计划页显示状态、依赖、尝试次数和错误。

新增验证：`pnpm --filter @zerowallscience/research-store test` 29 项通过；`pnpm --filter @zerowallscience/research-store run bundle` 通过；`pnpm --filter @zerowallscience/plugin-research run typecheck` 通过。该功能仍未替代完整编排器：预算累计/超限、远程重启对账、角色权限和 12 项先导尚未完成。

## 2026-09-21 continuation: task budget accounting and Run reconciliation

- 研究任务启动时现在区分两类预算：`maxRemoteThreads`/`maxMemoryGiB` 是并发保留，运行任务结束后释放；其他 `max*` 资源（例如 `maxTokens`）按任务声明额度乘以已开始的 `attempt` 累计。失败、取消、超时不会返还累计估算，因此重试不能绕过研究预算。
- 新增 `getResearchTaskBudget`，返回限制、当前使用量、可用量、活动保留、记账方式和超限资源。接口明确这是“每次尝试的声明估算”，不是实际 token 或费用计量。
- 新增 `reconcileResearchTaskRun`，绑定 Run 进入成功、失败、取消或超时时，研究任务可按 Run 终态收敛；远程连接中断仍保留暂停/不确定状态，不盲目重提交。
- `research_workflow` 现在接受可选的 `research_task_id`：远程提交前绑定同项目任务并占用预算，轮询或同步返回的 Run 终态会回写任务；相同 `request_id` 仍按原有指纹对账，任务绑定也纳入冲突指纹。
- 本地 Western blot Fiji Runner 同样接受 `research_task_id`，在启动 Java 前绑定任务并在成功、失败、取消或超时后对账；确认性任务要求门禁一和冻结方案，探索任务可以在冻结前运行。
- 失败或阻断任务再次运行时必须绑定新的 Run，避免把旧的失败远程任务误当成新尝试。科研工作台计划页已提供预算摘要、任务登记、依赖刷新和 Run 对账入口。

新增验证：`pnpm --filter @zerowallscience/research-store test` 30 项通过；`pnpm --filter @zerowallscience/plugin-research exec vitest run --config ../../vitest.plugins.config.ts test/research-tools.integration.spec.ts` 5 项通过；`research-workflow.spec.ts` 13 项通过；研究插件全量 77 项、Research/MCP 严格 TypeScript 和 Typert 合同通过。

这些规则完成了 P1 任务图的预算与本地 Run 对账底座，但尚未完成 rdatalinux 队列的科学任务恢复、角色权限门禁、真实远程断线重启演练或 12 项先导评估。

## 2026-09-21 continuation: four Fiji experiment metric protocols

- 新增 `FijiExperimentService` 和本地 `fiji` 工作流目录：`fiji.scratch-wound`、`fiji.colony-formation`、`fiji.bacterial-cfu`、`fiji.tube-formation`。所有请求要求稳定 `request_id`，结果写入项目 `.zerowall/fiji-experiments/<runId>/result.json`，登记 SHA-256 Artifact 和 `scientificReview: pending` 元数据；重复请求返回同一个 Run。
- 共享协议保留实验边界：划痕要求同一样本初始面积和时间；克隆将独立菌落数与染色面积分列；CFU 只有同时存在稀释倍数和铺板体积才计算；成管保留长度单位、端点、连接点、分段和网孔。
- 工作台专业工具页新增 Fiji 实验指标 Runner；Agent 本地工作流可发现和执行上述四个操作。结果明确是确定性参数/结果协议，不把它们包装成已完成的 Fiji 图像分割、掩膜或生物学结论。

新增验证：`test/fiji-experiments.spec.ts` 与 `test/research-tools.integration.spec.ts` 共 11 项通过；研究插件全量 22 个测试文件、80 项通过；严格 TypeScript 和 `pnpm plugins:typert` 通过。真实 Fiji 原生分割 Runner、五类实验原始字段回传和跨图像性能门仍待完成。

## 2026-09-22 continuation: backed H5AD cell viewer

- 新增 `CellViewerService`，通过受限 Python+h5py 打开当前项目内 H5AD/HDF5 AnnData 文件。读取过程保持 backed：Node 不把表达矩阵载入内存，Python 分块读取 dense、排序且无重复索引的 CSR/CSC `X`，并限制返回的细胞和嵌入点数量。
- `cell_open` 登记 `cells` ViewerSession，返回 `obs`/`var` 元数据、真实 `obsm` 嵌入键和有限细胞预览；未指定嵌入时优先选择 `X_umap`。
- `cell_read` 支持按 `var` 声明的索引列读取基因表达；`cell_analyze` 计算全量 X 的行总和、非零 feature 数和真实 `obs` 分组均值。X 的尺度未核验，不能将其自动称为原始 counts；基因统计不受预览截断影响。没有自动归一化、插补或统计推断。
- `cell_export` 写入 `zerowall-cell-analysis` JSON Artifact，保留运行器版本、源 SHA-256、ViewerSession 版本和参数；源文件变化、校验和不符、查看器版本冲突或 H5AD 结构不完整均阻断执行。
- 科研工作台增加 H5AD 资产选择、已有嵌入的前两维 SVG 散点、表达/分组着色、视图恢复、QC 和可追踪导出；新增 `zerowall-cells` Skill 与工具路由绑定。

验证：`test/cell-viewer.spec.ts` 5 项通过（真实 h5py dense/CSR/CSC H5AD、命名索引、预览截断与全量统计分离、源变更/版本冲突、畸形文件/未知字段/非有限值/外部链接拒绝）。另有细胞 UI 测试和真实 ToolRuntime 的 cell_open→cell_export→Artifact 链路测试。这建立了细胞查看的真实文件闭环，但不代表圈选、聚类、marker、供者级 pseudobulk 或 10 万细胞性能门已完成。


### 本次额外校验与边界

- schema 15 通过增量迁移加入 cells，保留 v14 序列/图像/流式会话。旧 migration 保持原定义。补齐快照白名单中遗漏的 flow 和 cells，增加迁移后快照重映射测试；迁移前创建元数据备份。
- Host 用流式 SHA-256 与登记算法校验源文件，运行后再次校验文件身份、大小和修改时间。Python 固定脚本通过 stdin 接收 JSON；`-E -P` 排除 PYTHONPATH/工作目录导入，同时复用已安装的用户 site 包。未安装或更改 Fiji/napari。
- 读取器串行执行，子进程限 120 秒、标准输出限 32 MiB、计算库线程数 1。失败不会登记分析 Artifact；科学审核始终为 pending。读取/哈希尚非可恢复持久任务，大文件哈希会增加交互延迟。
- 产物保存脚本 SHA-256 与 Python/h5py/NumPy 版本。本机已运行 Python 3.12.10、h5py 3.16.0、NumPy 2.1.3；使用环境变量 `ZEROWALL_CELL_PYTHON` 可选择独立引擎，目前尚未制作独立引擎包。
- 最新验证：research 24 文件/87 测试，Store 31 测试，技能绑定 17 测试，research_workflow 14 测试全部通过；Research/MCP 类型检查、13 个 Typert 契约生成、Store/Research bundle 和 diff 检查通过。
- UI 测试是 DOM/SVG 交互回归，不是 packaged Electron 的原生截图验收。预览限前 N 个细胞；没有以全量载入浏览器冒充 WebGL 分块渲染。10 万细胞完整性能、圈选、3D、聚类/marker、供者级差异表达仍未交付。


## 2026-09-22 continuation: cell polygon selection and collection export

- `cell_select` 接收真实 embedding 键、axes [0,1] 与 3–128 个嵌入坐标顶点。Host 校验有限值和面积，Python 每批最多 10,000 个点匹配全部 observation；使用奇偶规则，包含边界，绝对浮点容差 1e-10。
- ViewerSession 保存选区几何并采用现有 expected_revision 校验。恢复视图时重算匹配；切换嵌入清除旧坐标下的选区，源文件变化要求重新打开。
- `cell_export_selection` 流式输出完整 `cells.csv`（0-based observation index + 原始 cell_id）及 `selection.json`。登记的 CSV Artifact 含 manifest URI/哈希、源哈希、查看器版本、数量和 pending 科学审核状态。Agent 只收到最多 100 个选中示例及有界预览高亮索引，不将全量集合填入文本上下文。
- 工作台加入点击顶点绘制/撤销/取消/保存/清除选区、选中高亮、全量匹配计数和 CSV 导出。UI 将 SVG 留白后的屏幕坐标换算为嵌入坐标，选区与源文件绑定。
- 独立合成 H5AD 含 100,005 个细胞，预览只返回前 2 个，矩形圈选仍正确命中 25,000–74,999 共 50,000 行；恢复后 CSV 完整保留 50,000 行并正确引用含逗号的 cell_id。凹多边形、反向顶点顺序、边界点和清空均有独立测试。
- 验证：研究插件全量 24 文件/90 项通过，随后新增凹多边形测试，细胞服务专项 8 项通过；Research 严格类型检查、Typert 生成和 Host/client bundle 通过。ToolRuntime 真实调用和 UI 留白坐标转换/版本化导出均通过。
- 该测试验证 10 万级源数据的选择/导出正确性，不是计划要求的全量 WebGL 渲染、首屏/交互/峰值内存性能报告。3D、标签、聚类/marker、供者级推断和完整性能验收仍需推进。

## 2026-09-22 continuation: 100k embedding GPU path and camera persistence

- 新增 `CellCamera` 合同和 CAS 保存：`zoom` 1–100、`panX/panY` ±200；滚轮缩放保持光标下 embedding 坐标不变，拖动仅更新相机，切换 embedding 时重置。`cell_view` 只修改 ViewerSession，不读取 H5AD；普通查看/分析/导出可以携带当前相机并在相同 embedding 下保留它。
- 新增 `CellWebGlRenderer` 和 React `CellGpuCanvas`。embedding 位置和 RGBA 颜色各自上传为 Float32 GPU buffer；相机交互不重复上传；点大小、裁剪、透明度和 WebGL context lost/restored 有明确路径。分组值来自 embedding 分块返回的真实 obs 值，表达值可覆盖分组颜色；表达与选区高亮仍只使用有界返回数据。
- UI 默认读取 100,000 个二维 embedding 点，可选择 2,000/100,000/200,000。WebGL 不可用时 ≤10,000 点才使用 SVG 回退，大点集明确提示不可用，不伪装成完整显示。Agent 输出仍只采样最多 100 行，同时报告原始返回点数。
- 新增 100,000 点 Float32 缓冲、分组/表达着色、相机逆变换/锚定缩放、空/常量嵌入、相机 CAS 与持久化测试。定向 cell/UI/ToolRuntime 套件 21 项通过，Typert 重新生成通过。工作区仍有一个以 Vite loopback 提供的合成 100,000-cell 浏览器 fixture；Codex computer-use 当前因认证令牌不可用，尚未完成真实浏览器截图验收，因此不能称为 packaged Electron 视觉验收。
- 当前实现边界：二维 embedding 前 N 显示与全量文件圈选/导出已具备；3D、标签/掩膜、聚类、marker、供者级 pseudobulk/差异表达和正式性能门仍未完成。WebGL 仍是源码路径，独立引擎包及安装包资源尚未交付。

## 2026-09-22 continuation: project-local CFU image segmentation

- 扩展 `fiji.bacterial-cfu`：除结构化测量外，可读取当前项目已登记的本地 PNG/JPEG/TIFF 等图像，按声明的 plate ROI、亮/暗阈值和 min/max component area 做灰度 4-连接组件分割。
- Runner 只在显式提供 dilution factor 与 plated volume 时计算 CFU/mL；返回前景像素、保留组件面积、丢弃组件数、阈值/ROI/极性及源资产 SHA-256。Artifact 保留 `sourceAssetId`、源哈希和 `scientificReview: pending`，幂等键指纹包含图像配置，修改配置不会错误复用旧 Run。
- 增加共享分割测试和真实 ToolRuntime PNG 链路测试：合成 2 个组件（面积 4、6）得到 2 个菌落和 2,000 CFU/mL，过滤分支也有覆盖。定向 Fiji/Research 集成 14 项通过，Research 严格类型检查和 Typert 生成通过。
- 边界：这是确定性灰度组件计数，不等同于菌落物种识别、人工复核或完整 Fiji 宏；划痕、克隆形成和成管仍仅有参数指标协议，Western blot 才有已验证 ImageJ 原生 Runner。

## 2026-09-22 continuation: HE ROI component screening

- HE ROI 分析现在在既有 RGB 统计基础上，对真实解码 tile 的 nuclei-like 像素做 8-连接组件计数并返回每个组件面积；分析和导出仍保留原始坐标、源哈希与参数。
- 该计数是确定性筛查启发式，不伪装成 StarDist、组织诊断或临床结果。OpenSlide 金字塔瓦片、物理标定、StarDist 分块和批处理仍待独立引擎。

## 2026-09-22 continuation: four-layer system prompt tightening

- 核心 `SCIENCE_SYSTEM_PROMPT` 已改为短路由规则：明确区分观察/假设/已验证结果，缺失单位、独立性和来源保持未知；数值只能来自实际 Runner Artifact；保留失败、冲突、阻断和限制；权限、修订、预算与门禁由 Host/Runner 强制。
- 保留动态研究上下文的白名单注入（研究/项目 ID、阶段、版本、冻结 ID、两道门禁和有限预算），不把问题正文、文献正文或任意预算字段提升为系统指令。文档指令隔离、Windows、MinerU、Biomni 凭据规则继续在独立提示层加载。
- 基础提示词测试和 Base Host 类型检查通过。角色专属提示和领域 Skill 仍按工具按需加载，完整提示词哈希登记及打包 Electron 验收尚未完成。

## 2026-09-22 continuation: evidence registration and claim audit

- ResearchStore 新增 `registerResearchEvidence`：要求证据 payload 至少引用 artifact、run、asset、document 或 source，并规范 `needsReview`；通用 Agent `create_document` 仍不能直接伪造 evidence/claim。
- 新增 `auditResearchClaim` 与 `research_study` 的 `register_evidence`/`audit_claim` 操作。审计检查 evidenceIds 非空、唯一、同研究、类型正确且没有待复核标记，并持久化 `auditStatus`、`auditErrors` 与 `needsReview`。Gate 2 继续由 Store 强制检查审计结果和证据引用。
- Store 32 项测试和 Research ToolRuntime 集成 8 项通过；Store bundle、Research 类型检查已通过。证据类型的领域特异性规则、Artifact/Run 存在性深校验、人工 Gate UI 和完整 Claim/Report 页面仍待继续。
- 证据登记与主张审计的 Remote 接口现在要求 `sessionId` 并校验活动项目，避免仅凭项目/文档 ID 跨项目调用；Typert 契约已重新生成，Research 集成和类型检查通过。

## 2026-09-22 continuation: image-backed Fiji wound, colony and tube runners

- `fiji.scratch-wound`、`fiji.colony-formation` 和 `fiji.tube-formation` 现在与 CFU 一样支持当前项目内图像资产、显式 ROI、阈值和极性，并把源 SHA-256、配置、运行和 JSON Artifact 关联起来。旧的结构化 `measurements` 接口继续兼容。
- 划痕 Runner 使用显式初始面积计算剩余面积和闭合率；克隆形成使用 4-连接组件，同时分别保存独立菌落数、染色面积和过滤组件；成管 Runner 使用 Zhang-Suen 细化，登记骨架像素、长度单位、端点、连接点、分段和网孔近似值。
- 共享测试覆盖三类合成图像，ToolRuntime 集成测试覆盖真实 PNG→Host→Run→Artifact 路径；Research 类型检查和目标测试通过。结果仍保持 `scientificReview: pending`，不代表诊断、治疗效果或独立生物学重复推断。
- 当前边界：多页/多通道实验图像、Fiji 原生插件字段、批处理、人工掩膜修订和 ImageJ 视觉对照仍未完成；成管网孔指标在拓扑复核前只能作为可追踪的算法输出。

## 2026-09-22 continuation: NHANES DatasetContract applicability gate

- 新增 `validate_nhanes_contract` 与版本化 `7.0.0-nhanes-contract.1` 检查：周期、组件、数据集、权重、SDMVSTRA/SDMVPSU、多周期策略、官方合并权重来源、domain/subset、孤立 PSU 处理、预览截断和 2013–2014 DXX_H 年龄范围。
- 检查结果分为 `usable`、`pending`、`not-applicable`，其中 `usable` 只说明声明的契约字段齐全，不证明实际变量值、下载内容、调查设计或模型结果正确。多周期不会触发通用“除以周期数”规则，预览截断和组件/权重冲突会阻断分析。
- 新增三项确定性契约测试并通过 Research Host 类型检查。它已接入 `research_study`，可在肥胖—脱发方案冻结前形成可追踪的适用性证据；真实远程 R survey 运行、独立参考数值和官方代码本核对仍待完成。

## 2026-09-22 continuation: managed BrainGlobe capability probe

- `probeScientificEngines` 不再静态返回 BrainGlobe 能力；当配置 `ZEROWALL_BRAINGLOBE_PYTHON` 时，会在独立 Python 中探测 `brainglobe-atlasapi`、`brainreg`、`cellfinder`、`brainrender` 的版本，并明确缺失组件、退出码、超时和不可解析输出。
- 未配置时保持 unavailable，且不会修改现有 napari 0.9.1 环境。该探测只证明环境可用性，不代表 Allen 图谱下载、配准、细胞检测、三维渲染或脑区统计已经完成；相应 Runner 和 CPU 基准仍待实现。

## 2026-09-22 continuation: packaged directory regression

- `pnpm package:dir` 已重新完成，Windows x64 `dist/win-unpacked` 的 packaged Desktop 启动、Settings 中英文切换、About 7.0.0 版本显示和 ASAR/runtime 策略校验通过。
- 额外从 `app.asar` 读取 packaged research bundle，确认包含 NHANES 契约、遗传分析契约、BrainGlobe 受管理环境探测和三类 Fiji 图像 Runner 代码。该结果是目录版和 Desktop smoke，不是正式安装器发布或远程部署。

## 2026-09-22 continuation: MR/colocalization applicability gate

- 新增 `validate_genetic_contract`（`7.0.0-genetic-contract.1`）并接入 `research_study`，检查暴露/结局定义、祖源、基因组版本、效应单位、样本重叠、协调、工具数、F 统计量、区域完整性、lead SNP、匹配 LD、MVMR 条件强度和两步 MR 的中介估计目标。
- 单工具不自动运行 MR-Egger，多工具不按 Wald ratio 处理；只有 lead SNP 的共定位、缺失匹配 LD 的 SuSiE-coloc 和未登记条件强度的 MVMR 会保持未完成或阻断状态。测试覆盖纯函数和项目隔离的真实 Host 工具调用。
- 该门控仍不是 TwoSampleMR/coloc/MVMR 数值 Runner，也没有宣称肥胖—脱发已经得到遗传因果结果；独立 R 环境、公开汇总统计、LD 参考和结果 Manifest 仍待完成。

## 2026-09-22 continuation: real BrainGlobe atlas viewer and coordinate Runner

- 使用本机 Python 3.12.10 的独立 BrainGlobe 组件成功获取 Allen adult mouse CCF `allen_mouse_25um` 图谱元数据和 annotation/template 文件：25 µm 各向同性、体积 `(528, 320, 456)`、840 个结构区。下载根目录为项目内受管理 `.zerowall/brainglobe-managed`，没有改写 napari 环境。
- 新增 `BrainAtlasService` 和 `science_viewer` 的 `brain_open/read/analyze/export/brain_cells/brain_trajectory` 路径。真实 Runner 使用 BrainGlobe atlasapi 完成摘要、边界切片、结构名称/缩写/ID 查询、体素体积、voxel/micron 坐标映射、半球标记及有序轨迹标注。
- Brain ViewerSession 使用 schema 16 的 `tool='brain'`，升级前自动保留 SQLite 备份；导出 Artifact 记录 atlas、版本、Runner、Viewer 修订和 `scientificReview: pending`。
- 实际集成烟测已通过：12 项 Research ToolRuntime 测试，包含真实图谱打开、读取、切片、Cerebrum 查询、两点坐标映射和 Artifact 导出；受管理环境探测返回 `brainglobe-atlasapi=3.0.1`、`brainreg=1.0.16`、`cellfinder=1.10.1`、`brainrender=2.2.1`。
- 边界：当前实现是图谱查看/查询/坐标 Runner，不冒充 brainreg 配准、cellfinder 细胞检测、brainrender 三维场景或神经轨迹推断；这些仍需独立版本化 Runner 和 CPU 性能验收。

## 2026-09-22 continuation: BrainGlobe workbench and brainreg contract

- 新增 `brain-viewer.tsx` 并接入科研工作台专业工具页。界面显示真实 atlas 元数据、切片 PNG、轴/索引/降采样控制、脑区查询、voxel/micron 坐标映射、轨迹结果和 Artifact 导出；缺失配置、版本冲突和 Runner 错误会显示在当前面板。
- `brain_register` 现在是显式的真实 brainreg CLI 路径：要求当前项目已登记的本地输入资产、三维体素尺寸、三字母方向和受限空闲 CPU 数；输出目录、命令参数、输入资产和科学复核状态写入 JSON Artifact。注册前的契约校验已有 ToolRuntime 集成测试，避免错误参数启动长任务。
- BrainGlobe 能力卡片改为“基础能力可用”，不会把 brainreg/cellfinder/brainrender 环境探测误报为完成的配准、细胞检测或三维分析。当前仍未完成实际配准质量基准、cellfinder 真实检测、brainrender 场景导出和性能门。
- `pnpm package:dir` 在 Brain Viewer 接入后已通过 Windows x64 目录打包、启动、设置中英文切换、About 7.0.0 和 ASAR/runtime 校验；受管理 Allen 图谱仍位于项目外部资源目录，不打入主安装包。

## 2026-09-22 continuation: obesity—alopecia NHANES catalog reconnaissance

- 新增版本化只读侦察 Runner `7.0.0-obesity-alopecia-recon.1`。它固定检索雄激素性脱发、斑秃、未分型脱发、baldness、BMI、腰围和体脂候选词，通过现有 `research_workflow` 调用 rdatalinux `r.nhanes.search.variables`，每个查询最多保留 100 条结构化变量元数据。
- 每个候选明确记录 `matched`、`no-match`、`unavailable` 或 `invalid-response`。无命中只表示当前目录检索未命中，不能推断所有官方周期没有该表型；服务不可用也不会被写成阴性发现。
- `research_study` 新增 `obesity_alopecia_recon`，并提供工作台“运行目录侦察”入口。执行后登记 observation 和 `applicability: pending` 的 DatasetContract，保留远程 Run ID、侦察版本、查询词、候选状态和冻结前必须核验的周期/组件/代码本/权重字段。
- 该 Runner 不选择主脱发表型、不启动回归/MR、不创建 EvidenceRecord，也不预设阳性结果。只有后续确认数据契约并通过门禁一，才允许绑定分析计划。

验证：Research 插件定向集成测试 15 项通过，覆盖 7 个固定查询、命中/未命中/不可用分类和研究记录写入；Research Host/client 严格 TypeScript 检查通过。当前测试使用受控工作流响应，尚未把远程生产 NHANES 结果写成科学结论；真实 rdatalinux 侦察仍需在连接可用时执行并保存其 Run/Manifest。

最新目录包回归证据：`C:\Users\ccf\AppData\Local\Temp\zerowall-packaged-desktop-Wl9f1W`。最终 `desktop/dist/win-unpacked/resources/app.asar` 已检索到侦察入口、`7.0.0-obesity-alopecia-recon.1`、brainreg 输出审计、`brainreg-inputs.txt` 输入清单和远程 Manifest 引用逻辑；这证明代码进入目录包，不等于远程 NHANES 真实数据已经运行。

## 2026-09-22 continuation: brainreg output audit and remote recon traceability

- brainreg 注册现在先审计输出目录：`brainreg.json` 必须是 JSON 对象，`registered_atlas.tiff` 或 `registered_atlas.nii` 必须存在且所有登记文件非空；每个文件保存字节数和 SHA-256。审计失败不会创建注册 Artifact。
- 对文件型输入，Runner 会在输出目录写入受保护的 `brainreg-inputs.txt`，再按 brainreg CLI 支持的“文本文件列出切片”形式提交，避免把单个 TIFF 误当作目录。目录型输入仍直接传递。
- 注册 Manifest 增加 `outputAudit.status=ready-for-review` 和必需输出清单；该状态只表示工程输出可供人工审阅，不表示配准质量或解剖对齐已经认可。
- 肥胖—脱发目录侦察的观察记录保存每个查询对应的本地 Run、远程任务 ID、状态和最多 20 个 Manifest 文件名，并汇总远程引用数量；不会把不可用、未运行或仅目录命中写成科学结论。

新增验证：`engine-probe.spec.ts` 8 项通过（包含非空输出与哈希审计）；`research-tools.integration.spec.ts` 与引擎测试合计 24 项通过；Research Host 严格 TypeScript 通过。该增量仍未完成 brainreg 实际配准质量基准、跨坐标变换/脑区统计、远程生产 NHANES 执行或 7.0.0 发布门禁。

## 2026-09-22 continuation: managed cellfinder and brainrender scene runners

- `brain_cellfinder` 使用受管理 Python 的 `cellfinder.core.main`，限制为项目内 `.npy`/TIFF 三维信号体，可选同尺寸背景、平面范围、体素尺寸和 CPU 空闲数。结果保存原始 `x,y,z` 像素坐标、输入 SHA-256、运行参数和 `scientificReview: pending` Artifact；默认跳过分类，避免把检测候选误称为细胞类型。
- `brain_render` 使用真实 `brainrender.Scene` 与 Allen mouse 25 µm atlas，生成可打开的 PNG 和 HTML 场景，再登记三维场景 Manifest 及两个输出 Artifact。脑区名称不能解析、坐标不是 micron 或输出为空时阻断。
- BrainGlobe 工作台已加入 cellfinder 和 brainrender 操作入口；Agent `science_viewer` 同步暴露 `brain_cellfinder`、`brain_render`、背景资产、平面范围、脑区和场景标题参数。

真实验证：在本机受管理 Allen 图谱目录和 Python 环境下，brainrender 集成测试生成 PNG/HTML 并检查 HTML 内容；cellfinder 集成测试对 4×8×8 合成三维体真实运行并检查源哈希 Manifest。两项测试均通过。结果只证明计算和产物链路，不证明配准质量、细胞检测灵敏度或脑区机制。

目录包回归证据：`C:\Users\ccf\AppData\Local\Temp\zerowall-packaged-desktop-gDZNPa`。本次 `pnpm package:dir` 已完成 Windows x64 `win-unpacked` 构建；从 `desktop/dist/win-unpacked/resources/app.asar` 解包检查到 `brain_cellfinder`、`brain_render`、`cellfinder.core.main`、`brainrender-scene.png`、`brainrender-scene.html`、`zerowall-science-imrad-report/7.0.0-1` 和 `generateResearchReport`，以及 `scientificReview: pending`。这只是目录版构建和启动/设置烟测证据，不是正式安装器发布。

## 2026-09-22 continuation: traceable IMRAD report generation

- 新增 `zerowall-science-imrad-report/7.0.0-1`。`research_study` 支持 `generate_report`，工作台“报告与评估”页面可生成草稿；报告读取研究问题、数据契约、分析计划、观察、证据、主张、冻结快照和任务图，不从模型推测补写结果。
- 草稿生成 Markdown 报告和 JSON Manifest 两个 Artifact，记录文档/证据/主张/任务/冻结版本和阻断原因。`final` 模式要求 Gate 2 已批准、存在主张且全部通过审计，并拒绝待人工复核证据。
- 定向集成验证新增 1 项：真实项目目录写入 IMRAD Markdown/Manifest，草稿可读；未审计的正式报告被阻断。该能力是报告产物链路，不等于 12 项先导评估或正式医学结论。
- 研究插件全量回归：27 个测试文件、119 项通过；H5AD 真实 Python 夹具测试单独提高到 30 秒超时上限，避免并行运行时被默认 5 秒测试门限误判。

## 2026-09-22 continuation: canvas multi-format export

- 科研画布导出从单一 SVG 扩展为 SVG、PNG、PDF 三个 Artifact，三者共享同一结构化规格、源资产/产物引用和 Manifest。PNG 由 SVG 在 Host 中确定性栅格化；PDF 使用单页图像 XObject 封装，并明确标记 `rasterized: true`，保留 SVG 作为可编辑工程源文件。
- 画布面板现在显示三个输出的 URI、媒体类型和 SHA-256；导出测试检查 PNG 文件头、PDF 文件头、Manifest 源引用以及 Artifact 数量。
- 这完成了科研画布的基础多格式交付，不等于多面板拼版、统计误差标注或出版级人工审阅已经完成。
