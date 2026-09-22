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
| research 回归与本轮定向测试 | 最新整合 272 项通过、2 项跳过（52文件，52.90秒） | 具体批次见历史章节；并行改动后全量结果待主任务合并核验，不把这些批次数相加为全量成绩 |
| `pnpm --filter @zerowallscience/research-store test` | 最新整合 36 项通过 | 持久研究对象、冻结、预算、ViewerSession、注释分支与运行策略来源；并行最终整合仍需统一回归 |
| `pnpm --filter @zerowallscience/plugin-base exec vitest run --config ../../vitest.plugins.config.ts test/research-skill-bindings.spec.ts` | 25 项通过 | 含四个学术写作入口研究路由的技能/工具绑定；不能替代领域实算 |
| `pnpm plugins:typert` | 13 个远程插件生成成功 | 包含新原生启动 RPC 与 `science_viewer` 类型 |
| `pnpm --filter @zerowallscience/plugin-research run typecheck` | 通过 | Host、Sanger 面板和新增工作台严格检查 |
| `pnpm --filter @zerowallscience/plugin-research run bundle` | 通过 | 研究插件 Host/client 构建；不是 Electron 安装包 |

## 全方案剩余验收范围

| 方案范围 | 当前证据 | 尚须实现/验收 |
|---|---|---|
| P0：全软件与双仓能力审计 | 本地 Store、研究插件、引擎局部验证 | 全量能力矩阵、raiagentai 对应提交/依赖、全领域适用性审计 |
| P1：研究底座与编排 | 研究对象、冻结/修订/门禁、会话上下文已有基础 | 完整任务图/预算/重启恢复、角色权限、下游失效传播、报告、成功与合理停止端到端 |
| 六页工作台与共同资产 | 页面骨架、序列会话、原生打开 | 各类工具资产/产物直达、完整多标签恢复、聊天选区引用、坐标契约、画布联通 |
| 细胞 | H5AD/AnnData backed 元数据、obs/var、UMAP/PCA 预览、基因表达预览、QC/分组统计和带哈希 Artifact 已通过真实 h5py 测试；ViewerSession 已接入工作台和 `science_viewer`；新增全量多边形圈选及 CSV 集合导出 | 标签、WebGL、聚类、marker 的完整交互链；10 万细胞查看/QC/圈选已有实际性能和独立参考，供者级 pseudobulk/差异表达后端已完成合成参考，尚需生产部署及工作台端到端 |
| ImageJ/多维图像 | 原生启动、ROI 修订回传/冲突、受限 TIFF/OME-TIFF/OME-Zarr 查看与 Z/C/T、原像素 ROI 强度、Western blot Runner 已有运行证据 | OME-Zarr 完整 chunk-aware 分析、五类实验全部数值基准、标签/掩膜、10 GiB 受限平面查看已通过；完整 XY 瓦片和安装包视觉验收 |
| HE | 独立 OpenSlide 环境、真实三层金字塔按层/ROI PNG、缩放平移、物理标定、视图恢复及带 SHA-256 的 PNG/JSON 导出；实际 React→Host→OpenSlide smoke 通过 | StarDist CPU 分块、组织区域、批处理、多边形、瓦片缓存、真实 SVS/NDPI 厂商覆盖、10GiB 性能和安装包验收 |
| 分子结构 | 本地 Mol* 5.11.0 按需加载；PDB/mmCIF 链/残基/表面、距离、视角恢复、PNG/源文件导出真实浏览器验收 | SDF、真实 Vina 远程任务及构象取回已通过；packaged PDB 显示/5Å测距/PNG导出通过；完整结构准备、多构象复核和更多真实样本仍待验收 |
| 序列 | FASTA/GenBank 严格解析、环形/线性图谱、join/complement 注释、区域选择/恢复/导出、反向互补和翻译；实际 Chromium 工作台及 Biopython 独立参考通过 | 引物/PCR、Gibson/Golden Gate、固定参考基因组 SpCas9/NGG 三错配搜索；当前候选枚举不能冒充脱靶检查 |
| Sanger | SCF 1/2/3 与 ABIF/AB1 常见 DATA9–12/PBAS/PLOC/PCON 解析、四色峰图、PCON→Phred 存储置信度、移动窗口端点裁剪、全局参考比对、双向反向互补核对、JSON/FASTA 产物导出和源哈希/版本校验已实现；内置工作台面板与 `science_viewer` 的 `sanger_open/analyze/export/review` 已接入 | 峰图人工修订、混合峰/IUPAC 证据和真实仪器回归仍未验收 |
| 流式 | FCS 3.0 按 8192 事件分块、显式 spillover 补偿、none/arcsinh、层级矩形/多边形门、精确均值/中位数、保存恢复和 GatingML 子集导出；100 万事件独立 NumPy/FlowIO 数值参考及真实 React/Host/Chromium 交互性能已通过 | GatingML 2.0 限定子集导入/导出已通过 FlowKit/XSD 双向参考；FlowJo 子集兼容、批处理与 packaged Electron 验收仍未完成 |
| 科研画布 | 1–9面板、线性轴范围/刻度、图例/配色、折线/散点、源项目隔离、草稿恢复和SVG/PNG/PDF/可编辑JSON原子导出；真实React/Host验收通过；PDF标明rasterized | 图像面板、拖拽排版、比例尺、误差线/更多统计图形、出版级人工复核及安装包验收 |
| 脑图谱 | Allen CCF 25 µm atlasapi 查看、切片/脑区/坐标查询；brainreg 输出审计；真实 cellfinder 检测与 brainrender PNG/HTML 场景已接入 | brainreg 解剖配准质量基准、cellfinder 真实阳性参考、跨坐标变换/脑区统计、CPU 性能门仍需扩展 |
| P2：临床/遗传/组学 | NHANES 真实周期均值/SE/domain 独立参考；bulk 配对/协变量和 donor pseudobulk PyDESeq2 数值参考；固定 MR/coloc Runner、持久队列与 Windows 合成数值参考 | 远程生产部署、真实案例适用性、Linux 固定 genetics 环境、GWAS获取/LD/完整协调、MVMR/SuSiE 路径和多时间点重复测量 |
| 肥胖—脱发案例 | 首轮真实 NHANES 目录侦察 7 个 Run succeeded；4 个脱发检索无匹配，BMI/腰围/体脂候选18/24/3；契约 pending、草稿保留门禁缺口 | 官方代码本与其他数据源侦察、表型/数据契约核验、门禁一、适用分支分析与证据、IMRAD 和门禁二；无匹配不能推断所有 NHANES 无该表型 |
| 系统提示词与 Skills | 核心/研究/角色分层、实际 llm/stream 策略哈希入审计；267 目录/266 Registry 技能审计；四个写作入口统一两门禁/主张审计；来源/版本/哈希可见 | 72 项待适配资源引用、152 项依赖未验证、用户覆盖兼容差异、所有领域真实技能→工具→产物链；审计数字不等于已实算 |
| P4：先导与对照 | 12×4 冻结执行台账、Host/UI 配置导入/冻结/状态、fixture 契约测试已实现；真实 48 次未运行 | 真实输入/参考冻结、实际模型条件适配器、盲评/评分、真实预算/失败/成本和独立复核 |
| rdatalinux | 生产只读健康/队列核验；独立暂存 checkout 构建、25 项 Gateway 测试、8 项部署 fixture；离线 bundle 与影响分类已准备 | 生产已切至36ea1bc；五服务active，MR/coloc/r_files/Vina实算通过；检查时R队列queued=0/running=0，历史失败保持原记录 |
| P5：打包和发布候选 | 7.0.0本地安装包已生成；packaged启动/版本/设置/研究恢复/分子显示导出通过；HE和StarDist按需包通过离线安装/回滚 | 全软件回归、迁移/旧快照/跨项目、packaged Host/Electron、Windows x64 安装包实际安装启动、引擎包/许可证/哈希/离线导入/回滚 |

下一实施链路：并行推进肥胖—脱发真实数据侦察、遗传工作流 Host/远程衔接、独立 Linux 环境和部署排空；补齐专业模块尚缺的科学分析和基准，统一运行整合回归。48 次先导、真实安装包和生产切换各自保留独立验收门禁，不将专业工具卡片或技能目录当作交付。只有完整方案逐项具备代码、运行产物和适当验收证据，才能将总目标标记完成。

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

## 2026-09-22 continuation: traceable image label-mask analysis

- 新增 `zerowall-image-mask/7.0.0-1` 确定性 Runner，并接入 `science_viewer` 的 `image_mask_analyze` 操作。工作台现在可以选择项目内登记的独立掩膜资产，输入可选标签集合，按已接受 ROI 对每个整数标签计算像素数、总和、均值、最小值、最大值和总体标准差。
- Runner 对源图与掩膜进行 SHA-256、宽高、页数、通道和无符号整数深度校验；不允许静默缩放、配准、透明度解释或 RGB 通道不一致的掩膜。结果 Artifact 保存源/掩膜资产、哈希、Viewer 版本、ROI 修订、Runner 版本、参数和 `scientificReview: pending`。
- UI 已展示每个 ROI/标签的统计表、限制说明、Artifact URI 和校验值；未选择掩膜、存在未保存标注或输入非法标签时阻断提交。新增 UI 回归覆盖标签筛选、结果展示和未选择掩膜的阻断。

验证：图像 Host、工作台 UI 和 Skill 绑定定向测试通过。该能力是描述性标签分层统计，不等同于分割质量评估、细胞分类、诊断或治疗效果；OME-Zarr/金字塔分块、大规模掩膜性能和 Fiji 原生标签回传仍待独立适配。

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

## 2026-09-22 continuation: OME page coordinate contract

- 图像查看器现在保留 OME-TIFF `DimensionOrder` 的当前页位置，并按声明的最快到最慢轴序映射 `Z/C/T` 索引；单页图像明确返回仅包含页码的位置对象。
- 页码必须是非负安全整数，轴尺寸必须是正整数，超过声明的 `Z×C×T` 页数会被阻断，避免把越界页伪装成有效的 Z、通道或时间点。
- 新增 `XYZCT`、`XYCZT`、单页、非法页码和非法维度测试；研究插件全量回归为 27 个测试文件、122 项通过，Host/Client 类型检查和 Typert 合同生成通过。
- 这只是 OME 页坐标的基础契约，不等于 OME-TIFF/OME-Zarr 的完整轴选择、分块读取、通道渲染或多维强度分析；这些仍需专用适配器和性能验收。
- 图像工作台会在读取到可信 OME 元数据时显示轴序、各轴尺寸、当前 Z/C/T 位置和物理像素尺寸；普通 TIFF 或缺失元数据仍明确显示为未核验，不会把页码自动当作通道或时间点。

## 2026-09-22 continuation: OME axis selection in the workbench

- 新增 `omePageForPosition` 逆映射契约，将受校验的 Z/C/T 位置按 OME `DimensionOrder` 转回 TIFF 页码；非法轴值和越界值会被阻断，保持与已有页到轴位置映射相互可逆。
- 图像工作台在多维 OME 元数据可用时提供 Z、C、T 数字选择控件；选择后更新当前页，保存视角后恢复该页和轴位置。旧的页码输入与 `ImageViewState` 接口继续兼容。
- 新增逆映射和越界测试，定向 Image Viewer 测试 7 项通过，研究插件客户端 TypeScript 检查通过。
- 该增量仍不代表 OME-TIFF/OME-Zarr 的完整分块读取、通道渲染、强度分析或 10 GiB 性能验收；大文件和标签掩膜仍需专用适配器。

## 2026-09-22 continuation: traceable image ROI intensity Runner

- 内置图像查看器新增受限本地强度分析 Runner `zerowall-image-intensity/7.0.0-1`。它从源文件原始像素解码，而不是从预览 PNG 取值，支持当前受限读取范围内的 PNG/JPEG/TIFF（包括可读取的多页 TIFF），并保留声明的整数/浮点位深；不支持 complex/dpcomplex，也不对不一致的多页几何或通道结构静默修正。
- 分析只接受已保存的 accepted annotation revision，支持 rectangle、polygon 和 point ROI，按 ROI 所在页计算像素数、sum、mean、min、max 和总体标准差。结果绑定源 Asset SHA-256、ViewerSession 版本、标注修订、尺寸/页数、校准元数据和 JSON Artifact，Artifact 的 `scientificReview` 固定为 `pending`。
- 工作台增加“ROI 强度分析”操作和结果区，显示 Runner、修订、每个 ROI 的通道统计、Artifact URI/哈希及限制说明；没有 accepted ROI、存在未保存视角/标注或 Viewer 版本冲突时阻断。
- 验证：Image Viewer Host/UI 定向测试 17 项通过；覆盖 4×4 确定性矩阵的矩形/多边形/点 ROI、多页 TIFF 页选择、Artifact Manifest、无 accepted ROI 和 stale Viewer revision。当前不代表 OME-Zarr、10 GiB 分块图像、OpenSlide 金字塔、Fiji 五类实验宏、标签/掩膜分析、远程图像重计算或大规模性能验收已经完成，也不构成诊断、治疗效果或生物学结论。

- 新增 `zerowall-image-intensity` Skill，绑定真实 `science_viewer.image_analyze` schema，明确 accepted 标注、源像素、页/通道/位深、Artifact 溯源和 `scientificReview: pending` 边界；绑定测试覆盖该 Skill 的发现到工具调用链。

## 2026-09-22 continuation: bounded OME-Zarr viewer adapter

- 新增受限 OME-Zarr v2 查看适配器，读取 `.zattrs` 的 multiscales/axes、首个 `.zarray` 数据集、形状、chunk 布局、dtype、物理尺度和 dimension separator；支持命名 `x/y` 以及 `z/c/t` 轴，并把当前页保存为可恢复的 Z/C/T 位置。
- 当前页按声明的轴序只读取所需 chunk，支持无压缩和 gzip/zlib chunk，缺失 chunk 按零填充；路径解析保持在项目资产目录内，chunk 数超过 4096 或压缩格式不受支持时阻断并要求受管理适配器。适配器支持整数/浮点标量 dtype，保留源位深，不把元数据指纹冒充全量像素哈希。
- OME-Zarr 预览、ViewerSession 和图像工作台会明确标注 `storage: ome-zarr`、轴尺寸、物理像素尺寸、当前位置和 `fingerprintScope: metadata-and-chunk-layout`。当前仅开放查看和视角保存，ROI 强度、标签掩膜、Fiji 原生回传和远程重计算继续阻断，直到实现 chunk-aware Runner。
- 定向 OME-Zarr 测试覆盖无压缩页读取、gzip 解码、页坐标和不支持压缩阻断；研究插件完整回归为 28 个测试文件、134 项通过，Host/Client TypeScript 检查和 bundle 均通过。
- 未完成边界：多尺度金字塔选择、真正瓦片请求、fill value/非 C-order 数据布局的完整兼容、10 GiB 性能验收和 chunk-aware 分析。该能力证明受限查看链路可用，不代表完成大图像科研分析。

## 2026-09-22 continuation: strict NHANES survey contract and remote synthetic reference

- `raiagentai` 增加版本化 NHANES Runner `7.0.0-nhanes-survey.1`。它要求显式周期、组件、数据集、连接键、权重、分层和 PSU；多周期只能按 `per-cycle` 分开运行或提供带规则来源和逐周期乘数的 `official-combined` 方案，不再从列名猜测权重或使用文字触发的通用 `/2`。
- Runner 在完整设计上建立 survey design，再应用结构化 `survey_domain`；显式缺失码、权重有效性、唯一键、输入行上限、预览截断和 lonely PSU 策略均由代码阻断或记录。返回 `analysis_complete=true`、`scientific_review=pending`、输入文件 SHA-256、设计自由度、样本流和周期规则。
- 12 行无患者合成夹具通过独立加权比率/Taylor PSU 公式、domain、加权回归系数、缺失码和周期合并参考；另验证重复键、缺权重替换、无效表型、预览截断、前置过滤、无效二项结局和自由度不足的合理停止。该测试未连接或修改 rdatalinux 生产环境。
- Gateway MCP 契约测试通过：严格字段原样传递到 `/nhanes/survey-summary`、`/survey-regression` 和 `/survey-tabulate`，非法版本、周期乘数、domain 运算符、缺失码和 lonely PSU 在 HTTP 请求前拒绝。`raiagentai` 的 `npm test` 22 项、`npm run build` 和 R 合成验收均通过。
- 当前边界：远程生产尚未部署；真实 NHANES 周期、脱发表型代码本、调查权重适用性和“肥胖—脱发”科学主张尚未由该合成验收证明。ZeroWall 仍需接入生成的工具目录 schema，并完成真实数据侦察、门禁一、参考周期回归及 P2/P4/P5 发布验收。

### rdatalinux 临时目录真实数值参考

- 将 Runner 和测试复制到 `/tmp/zerowall-nhanes-v7-reference.le4qqX`，使用服务器已有 R 4.3.3、survey 4.5、haven 2.5.5 执行合成参考和只读公开数据参考；没有安装包、修改共享库、操作业务队列或重启服务。
- 2017–2018 DEMO_J/BMX_J 的 BMI 查看与加权计算读取真实 XPT；有效设计 8,704 行、BMI 非缺失 8,005 行，加权均值 `27.671223658131773`、SE `0.23634739790008367`。成人 domain（RIDAGEYR ≥ 20）保留原设计 8,704 行，domain 5,265 行、BMI 非缺失 5,175 行，均值 `29.833835234138419`、SE `0.26113954122628091`。
- 两组均值和 SE 与独立 base R 合并、比率估计及按 PSU 的 Taylor 方差公式一致，最大绝对误差 `5.56e-17`，预先指定容差 `1e-9`。没有下载受试者行或输出个体数据。
- 真实运行识别并修复 survey 的跨平台 data.frame 标准误列名差异，严格输出固定 `SE`；参考测试同时断言输出字段的长度与有限性，避免空向量比较误判通过。
- 脱敏报告：`C:\softworks\gpt-tools\raiagentai\output\nhanes-v7-reference\nhanes-public-reference.json`，SHA-256 `b9fae833ad87f2001a70a1566ddd035d95872a9d8e323f6e39024da87ed5554e`；含源码、原始 XPT SHA-256、版本、设计元数据和误差。其结论仅为数值参考通过，不是脱发表型、肥胖—脱发关联或研究门禁批准。

## 2026-09-22 continuation: parallel prompt, evidence, genetic applicability and bulk work

- 核心提示词为 `7.0.0-core.2`，研究上下文为 `7.0.0-context.1`，明确持久研究状态是数据。新增 `zerowall-claim-audit`，证据综合技能绑定 `research_study`；5 个研究 Skill 声明 metadata 版本。Skills 详情显示 registry 实际来源、声明版本和正文 SHA-256，不信任技能自称 bundled。该分支报告 base 聚焦 23 项、研究上下文 2 项、skills 全量 10 项通过；三插件 typecheck 通过。各 Skill 哈希的研究/评估全链路持久化和全量技能审计仍需继续。
- `genetic-contract.2`：MR-Egger 工具数小于 3、IVW 小于 2、generic MR 单工具输入被判不适用；单工具需明确 Wald。MVMR 条件 F 必须为有限正数，两步 MR 的 mediationEstimand 必须为非空字符串。遗传＋侦察聚焦 16 项通过。
- 侦察将后端错误和损坏的行结构记为 `invalid-response`，不再当作 `no-match`。侦察测试 12 项通过。
- 证据引用必须指向同项目的实际 Artifact/Run/Asset/Document，校验 checksum、Artifact 与 Run 一致性；failed Run 不能产生 `needsReview:false` 证据，新证据默认 pending。主张审计与 Gate 2 再核验引用。Store 33 项通过。
- `raiagentai` bulk 结构化设计已实现批次、数值协变量和两条件完整配对供者；检查样本 ID、原始整数计数、重复数、供者独立性、完整配对、混杂秩亏和残差自由度。远程临时目录使用既有 PyDESeq2 0.5.4 对 12 样本×250 基因合成数据进行 legacy、adjusted、paired 三种原生公式参考，19 项通过，最大绝对差 `5.684e-14`；本地 Node 23 项和 build 通过。结果日志在 `raiagentai/output/bulk-v7-reference-20260922.log`，未部署服务。
- bulk 当前不含混合效应或交互项；协变量限定数值，供者独立性仍需来源核验，最低重复数不代表功效充分。该合成验收不是减重手术对脱发的机制证据。

## 2026-09-22 continuation: frozen 12-task by 4-condition pilot execution ledger

- 既有 Store 只有 `benchmark-task`/`evaluation` 文档种类，未找到先导调度实现。新增 `PilotEvaluationService`，固定方案中的 12 个任务和 4 个条件，在完整输入 Artifact、参考 Artifact、评分规则、数值容差、重大错误、实际模型/provider、规范 provenance、运行时哈希和统一预算具备后，生成 48 个 `not-run` 单元并保存不可静默修改的内容哈希。
- 同一单元仅允许从未运行状态提交实际 adapter；先保存 running，再调用执行器。输出必须引用同项目的 succeeded Run 和 checksum/Run 匹配的 Artifact，禁止一个 Run 冒充多个独立试次。中断状态保留为需要对账，不盲目重跑。所有角色合计成本从实际 adapter 返回并保存，超预算单列，失败时未知成本明确计数。
- 参考答案、评分规则和预期结论不传入执行 Agent。已执行和已评分分开：当前没有自动评分、平台优越性结论或虚构的 48 次结果。
- 当前 11 项 Service、真实 ToolRuntime/Host 与 UI 测试通过：48 格待运行矩阵、未注册 adapter 阻断、执行引用和参考答案隔离、超预算、失败/未知成本、冻结修订与中断。Host 入口 `pilotEvaluation` 支持 catalog/list/freeze/summary，Agent 只开放 catalog/summary；报告与评估页支持 JSON 配置导入、冻结和状态刷新，没有虚假的执行按钮。
- 冻结与执行的 policyProvenanceIds 必须引用同研究的实际模型 request 审计事件，model/provider 必须匹配，runtimeHashes 必须匹配事件中的系统/上下文/技能/工具 schema 哈希。参考 Artifact 和执行输入同 ID 或同 SHA-256 时拒绝。每次台账变更写入 append-only audit checkpoint，读取时检查完整 payload 指纹和 48 个单元身份/状态；普通文档更新入口不能修改冻结先导台账。
- 仍需四个实际模型条件适配器、预先冻结的真实 12 任务材料、盲评导出/评分，以及实际 48 次运行；本模块测试使用隔离 fixture，不计入先导成绩。Typert 13 个合同生成通过；整体类型检查与最终回归由并行分支合并后统一执行。

## 2026-09-22 continuation: donor pseudobulk and actual runtime provenance

- `raiagentai` 的单细胞入口增加显式 pseudobulk 参数，按 donor×condition×celltype 从选定的 dense/CSR H5AD 原始整数计数进行分块聚合。保存计数、样本元数据、设计、可执行 bulk 请求、排除记录和 Manifest；prepared/blocked/partial/failed/completed 分开，不把有细胞数当作有独立生物学重复。
- 远程临时目录使用现有 PyDESeq2 0.5.4，72 cells、6 donors、120 genes、T/B 两类的合成基准与独立 pandas 求和及原生公式对照，10 项通过，最大绝对差 `2.842e-14`。日志为 `raiagentai/output/pseudobulk-v7-reference-20260922.log`；Node 全量 24 项、构建、Python 编译通过，未部署生产。
- 限制：CSC 需预转 CSR，配对仅完整两条件，不自动执行上游 QC，不替用户确认 raw-count 来源和生物学独立性；多重校正限各细胞类型内。该测试不是医学结论或 10 万细胞性能验收。
- Host 在实际 `llm/stream` 边界记录系统提示、动态研究上下文、送入模型的 Skill 内容和工具 schema 哈希，以及 provider/model 和观察到的 token counters；只保留哈希与计数，不保存提示正文或凭据。冻结快照和报告引用这些实际事件，缺失费用保持未知。runtime-provenance 独立 5 项与 Store 33 项通过，NHANES 执行中方案改版保护 20 项通过。

## 2026-09-22 continuation: full registry-based Skills audit and research writing route

- 新增可重跑工具 `tools/integration/audit-science-skills.ts`。它实际启动隔离 DSH Skill Registry/文件系统 provider 和 Research ToolRuntime，读取解析后的 Skill、实际 source/provider/resourceBase/版本/正文哈希、Host schema 及生成的远程 catalog schema，并复用 Python AST/安装声明依赖扫描。默认只审计内置目录；`--user-skills=` 可在不修改文件的情况下检查指定用户覆盖来源。
- 本次扫描 267 个目录，实际加载 266 项，未解析/未被选中的 Skill 为 0。分类为：可直接复用 3、需适配 72、依赖未验证 152、仅文档 39。分类数量不是科研计算完成度；“可直接复用”仅表示该项路由、资源及 schema 检查通过，“仅文档”仍可能是有效写作规范。
- 需适配条目的主要依据为待核对的本地资源引用。报告保留 source 和 target；其中可能包含生成输出示例，不能把所有不存在的链接都断言为运行时依赖缺失。依赖候选没有被写成已安装，远程声明 schema 没有被写成已连接。工具本次没有运行科研计算或安装依赖。
- 产物位于 `.build/science-skills-audit/skill-runtime-audit.json`、同名 `.md` 和 `dependency-candidates.json`。仅引用已存在 NHANES 真实周期数值参考及 bulk/pseudobulk 合成参考报告，并附它们的 SHA-256 与适用边界；这些记录不冒充完整 Skill 选择到实算的链路验收。
- 为 academic-pipeline、academic-paper、academic-paper-reviewer、deep-research 新增共同的研究任务路由，权威规范保存为 `zerowall-research-orchestrator/references/research-writing-policy.md`。活跃 ResearchStudy 使用持久状态、两个人工科研门禁和正式报告核心主张审计；研究任务不再采用每个写作阶段确认或 `ARS_CLAIM_AUDIT` 默认关闭。独立写作、普通编辑和文献工作保留原有范围；科学完整性问题仍阻断对应动作，人工确认不能把无证据结果变为已验证。
- 四个写作入口已绑定 `research_study`，真实技能加载/工具分发现有测试扩展为 25 项并通过；工作区插件配置已重新生成。上游许多外部客户端路径和缺失辅助材料仅完成审计记录，不能宣称全部 266 项技能已适配完成。

## 2026-09-22 continuation: GatingML 2.0 standard subset and import/export

- Flow runner updated to `zerowall-flow/7.0.0-4`. Added namespace-aware, bounded XML parsing with DTD/entity rejection, active-project DataAsset lookup, source checksum/mtime checks, viewer revision checks, and persisted GatingML source identity. Import accepts only the verified standard subset: rectangle/polygon gates, forward parent references, FCS or one square spectrum matrix, and the scaled `fasinh` form equivalent to the workbench arcsinh cofactor. Ellipsoid, Boolean, Quadrant, mixed transforms/compensation, unresolved references, malformed ordering and unknown attributes are explicit errors; definitions are never silently discarded.
- Standard gate semantics are explicit: `min <= value < max` for rectangles and nonzero winding for polygons. Existing gates without `boundaryMode` retain the legacy inclusive/tolerant calculation. Export refuses legacy gates instead of silently changing counts; the UI exposes conversion before export and an import action. Standard output includes official Gating-ML 2.0 namespaces, dimension compensation references, parent IDs, optional transformation and spectrum matrix declarations, and a SHA-256-tracked XML Artifact sidecar.
- 14 focused parser/service/UI tests pass, including same-project registered DataAsset import, revision conflict, foreign-project rejection, malformed/unsupported XML, forward parent ordering, standard boundary counts, source persistence and roundtrip. Independent FlowKit 1.2.3 (lxml schema validation), FlowUtils 1.1.0 and NumPy 1.26.4 check passed for rectangle/polygon/parent counts and raw plus square-compensation/arcsinh bidirectional roundtrips. Report: `.build/gating-ml-reference/2026-09-22T03-45-18.942Z/report.json`.
- Real million-event React/Host/Chromium smoke now also exports, registers and re-imports its own standard GatingML asset. Report `.build/flow-viewer-smoke/2026-09-22T03-47-12.097Z/report.json`; import result visible in 2.69 s, source ID persisted, preview remains bounded. Screenshot `gatingml-imported.png` records the UI state. FlowJo workspace compatibility is intentionally not claimed.

## 2026-09-22 continuation: sequence and HE actual viewer integration

- 并行序列分支报告：真实 React → ScienceViewerService → Chromium 操作覆盖环形查看、35–50 区间选择与保存、线性切换、刷新恢复和导出。解析结果与独立 Biopython 1.88 对照，GenBank 严格检查长度、字母表、行序、边界，保留 join/complement 分段与不支持项警告；19 项 service/UI 测试及 typecheck 通过。交互证据为 `.build/sequence-viewer-smoke/2026-09-22T02-18-36.744Z/report.json` 和两张 PNG。该记录不代表引物、酶切、组装或参考基因组脱靶流程已验收。
- 并行 HE 分支报告：新增 OpenSlide 真实三层金字塔按层和 ROI 读取 PNG，支持第 0 层坐标框选、缩放、平移、恢复，以及不同 x/y 像素尺度和 bounds。导出 PNG＋JSON 包含校验和并登记 `needsReview=true` 的 Artifact；使用独立 `he-7.0.0/venv`、openslide-python 1.4.6、openslide-bin 4.0.1.2（library 4.0.1）。reader 嵌入 Host bundle，避免依赖开发目录。
- HE 验证为 5 项测试、research typecheck/bundle 和真实 React＋Chromium＋Host＋OpenSlide smoke；交互报告 `.build/he-viewer-smoke/2026-09-22T02-27-52.393Z/report.json`。当前限制为 4MP/4096 单轴 tile、最多两个子进程；20GiB 流式哈希限制不是已完成性能验收。StarDist、批处理队列、OpenSeadragon/cache、多边形标注、真实 SVS/NDPI 厂商覆盖、10GiB 性能和安装包验收仍未完成。

## 2026-09-22 continuation: remote deployment preparation

- 只读核验生产 `raiagentai` HEAD 为 `6faa6ca3db533e5353e8d3490b0d211cffb5d5a0` 且无工作树改动；Gateway、Plumber、R worker、OmicVerse 四服务均 active。2026-09-22 02:24 UTC 队列快照均无 queued/running；这是当时快照，不能代替实际切换时的入口排空与复核。
- 独立 `/tmp/zerowall-v7-deploy-audit.rY0t0N/source` 从生产只读共享对象及本地离线 bundle 准备到 `3b95d0c6d85e36ce38885dd8f27a28889adf489f`，没有更改生产 checkout、配置、共享库、服务或业务队列。暂存 Linux 环境构建与 25 项 Gateway 测试通过，部署 fixture 8 项通过；实际影响分类仅 Gateway、Plumber、R worker、OmicVerse。
- 修复部署影响分类器遗漏 `genetics/` 的问题；新方法资产保守归入 Plumber＋worker，并要求任务排空。部署流程尚需处理：dry-run 提前返回并不检查队列、检查后无提交入口排空锁、OmicVerse env 未纳入原脚本读入、旧版部署 helper 不认识 genetics、OmicVerse 回滚覆盖复制可能保留新增文件。未进行生产激活。
- 独立探测显示 Linux R 4.3.3 初始未安装 coloc、susieR、TwoSampleMR、ieugwasr、MVMR；当前正在临时目录准备固定 coloc/susieR 依赖库及数值测试。Windows R lock 不能替代 Linux 方法环境验收。暂存 npm 还报告 `@hono/node-server@2.1.1` 需要 Node ≥20，而当前 `/usr/bin/node` 为 18.19.1；测试通过不消除该支持版本差异。

## 2026-09-22 continuation: real obesity–alopecia catalogue reconnaissance

- 主任务实际连接目录执行 7 个研究 Run，全部以真实返回登记为 succeeded。alopecia、areata、hair loss、baldness 检索均 no-match；BMI、腰围、bodyfat 分别命中 18、24、3 条目录候选。证据位于 `plugins/research/.build/obesity-alopecia-live/2026-09-22T02-32-05.434Z/report.json`。这是目录检索完成，不是脱发表型不存在的普遍结论，也不是医学关联分析。
- 数据契约保持 pending，没有自动冻结方案、登记计算证据或主张；新增 gated live integration test。ReportService 现在草稿和正式报告共用门禁/阻断列表，草稿明确显示未批准事项，正式版仍拒绝交付；6 项报告/来源测试通过。该案例目前只输出侦察和限制草稿，门禁一仍待可用数据和明确主问题形成。

## 2026-09-22 continuation: molecular SDF viewing and independent RDKit reference

- 分子工作台在现有本地 Mol* PDB/mmCIF 之上支持单记录 SDF V2000，以及中性、顺序原子编号、无附加属性的 V3000 子集。Host 核验终止符、计数、坐标、键界限/唯一性，保存形式电荷，禁止小分子卡通。Mol* 5.11 未解析的 V3000 附加电荷/立体等属性会被明确拒绝；不把 2D 图当作准备好的 3D 构象，不自动加氢或推断质子化。
- 实际 React/Host/Mol*/Chromium 完成两种 SDF 打开、球棍、链/残基筛选、1.5 Å 测距、PNG 与字节相同的原 SDF 导出、刷新恢复。RDKit 2026.03.6 在 rdatalinux 现有独立 Biomni Python 只读运行合成参考，V2000/V3000/带氧负电荷 V2000 的原子、键、形式电荷和坐标全部匹配，最大坐标误差 0，容差 `1e-9`。没有安装或服务变更，也没有上传用户分子。
- 7 项 molecule Host 测试、research Host/client typecheck 和包含本地 runtime 的 bundle 通过。最新完整 PDB/mmCIF/SDF smoke 报告和图像 `.build/molecule-viewer-smoke/2026-09-22T03-54-32.836Z`，无页面错误、无浏览器外联。复现脚本 `tools/integration/molecule-viewer-smoke.ts` 与 `molecule-sdf-reference.py`；独立参考需要 rdatalinux SSH/RDKit。安装包内 Electron/CSP 验收由发布阶段另行完成。
- 只读确认 raiagentai Biomni 存在 `docking_autodock_vina`，有显式盒、Meeko、ETKDG、固定 seed 和 PDBQT 姿态输出；本次仅核实源码可复用性。批量分子库、准备界面、搜索盒交互、任务/产物接入和姿态复核尚未验收，不能将此项宣称为工作台 Vina 完成。

## 2026-09-22 continuation: 100k CSR cell viewer numerical and browser acceptance

- 可复现夹具与独立参考为 `tools/integration/cell-100k-reference.py`；自动真实浏览器验收为 `tools/integration/cell-viewer-100k-acceptance.ts --run`。使用标准 AnnData dataframe/categorical/CSR 编码，100,000 细胞、256 features、200,000 非零 counts、20 donor、4 group，以及明确为合成网格的 `X_umap`。不是公开患者数据或真实 UMAP 推断；原始计数矩阵不会发送到浏览器。
- React → Host → h5py → SQLite → Chromium 实际完成打开、供者分组、G7 表达、全量 QC、鼠标多边形圈选、CSV 导出、相机缩放/保存、Host service 重建和刷新恢复、分析产物登记。独立 SciPy CSR `sum/getnnz/column` 与 NumPy 矩形区间判断核对全部 100,000 表达值、20 donor 分组、QC 和 27,944 条选中细胞 CSV，绝对容差 `1e-12`、相对容差 0，通过；G7 非零细胞为 782、均值 0.01173。没有供者级差异推断或医学结论。
- 实际证据 `.build/cell-viewer-100k-acceptance/2026-09-22T03-42-53.201Z/report.json`；四张截图保存首屏、供者配色、圈选和恢复导出。首屏点击至绘制 1,061.84 ms，供者分组 1,201.58 ms，基因表达 1,881.36 ms，QC 2,294.94 ms，圈选 2,228.57 ms，CSV 导出 2,331.49 ms，分析导出 2,935.04 ms，缩放可见变化 50.88 ms。零浏览器异常、零外部网络请求。
- CSR/CSC reader 改为最多 262,144 元素连续存储缓存，消除 CSR 每个细胞重复 HDF5 dataset 读取；保留排序、唯一、界限检查。14 项既有 reader/plot/UI 测试通过，另新增并通过跨缓存边界重复索引与空行回归（共 15 项）。runtime 记录 Python 进程 JSON 序列化前的 OS 峰值 RSS。
- 本次 Python 峰值 RSS（序列化前）112,873,472 B；Node Host 包含 Vite/tsx 的 25 ms 采样 RSS 峰值 483,635,200 B；CDP 检查点 JS heap 最高 57,517,188 B，不含浏览器/GPU 全进程内存。最大 HTTP 测试 RPC 响应 7,834,221 B。Python 输出硬上限 32 MiB、超时 120 秒；元数据预览 2,000 行、嵌入上限 200,000 点、源文件上限 20 GiB，不代表 20 GiB 已实测。全量维度最多 200 万 cells×20 万 features，嵌入前 N 点不是随机抽样。
- Windows、Intel i7-12700、20 逻辑 CPU、约 64 GiB RAM、Python 3.12.10/h5py 3.16.0/NumPy 2.1.3、Chromium 151.0.7922.34，允许 SwiftShader 软件 WebGL。该记录是 loopback HTTP 适配器下的源码验收，不是 Typert/Electron IPC、安装包或专用 GPU 性能验收。聚类、marker、真实组织数据与远程供者级推断仍需各自验收；每次读取的全文件流式哈希仍可能成为大型文件延迟来源。

## 2026-09-22 continuation: bounded million-event flow analysis and browser acceptance

- `FlowService` runner 升级为 `zerowall-flow/7.0.0-3`。先读取至多 1 MiB 的 header/TEXT，再以至多 8192 事件的块解码；源哈希也按 1 MiB 流式计算。Host 不保留完整事件矩阵，补偿、arcsinh、顺序层级矩形/多边形门和补偿求和均逐块执行。响应仍只返回至多 5000 个原始预览和 10000 个分析预览。
- 精确中位数使用任务拥有的临时 population 文件和逐通道外排序，每个排序 run 最多 65536 个值，在最多 200 万事件限制下最多 31 个 run，通过有界缓冲最小堆合并定位中位数。临时磁盘保守上限 2 GiB，提交前检查上界与可用空间；最多 128 门、128 通道、512 MiB 源文件。超限明确拒绝；成功、解码失败与源变更都只清理 mkdtemp 创建的本任务子目录，保留邻近用户文件。
- 定向 `flow.spec.ts` + `flow-viewer-ui.spec.tsx` 共 10 项通过。覆盖跨块和多个排序 run、奇偶/空群体中位数、层级计数、源变更、预算拒绝、失败清理与正常 UI。此测试数量不是 Research 全量回归总数。
- 独立数值/性能报告：`.build/flow-reference/streaming-8192-20260922/report.json`。100 万事件、4 通道、合成 FCS，与 NumPy 2.3.3 / FlowIO 1.4.0 的 raw 及补偿＋arcsinh 参考比较，矩形/多边形/层级门计数、均值、精确中位数、预览和产物哈希全部通过，0 失败。Host-only open 33.97 ms，raw 分析及导出 2578.23 ms，补偿＋arcsinh 3290.78 ms；进程 OS 峰值工作集 239,038,464 B。相同夹具此前全内存实现峰值为 1,130,246,144 B，当前未以全量载入冒充流式。
- 真实 React → FlowService → SQLite → Chromium 交互报告：`.build/flow-viewer-smoke/2026-09-22T03-26-41.329Z/report.json`，截图 `first-screen.png` 和 `gates-restored-exported.png` 已查看。点击打开至 5000 点首屏 2558.41 ms；UI 创建矩形及子多边形门，点击计算至结果显示 2453.42 ms；刷新、标签恢复至结果显示 2418.53 ms；导出至 Artifact 登记显示 2423.86 ms。实际全数据门计数 436495 / 167307，导出均值/中位数仍匹配独立参考，父门/边界/多边形顶点在刷新后恢复。
- 浏览器 RPC 逐条测量：打开响应 374052 B；分析响应 908464 B；含 Artifact 的导出响应 909437 B。所有响应最多 5000 raw + 5000 analyzed 预览，DOM 仅 5000 个 circle，无百万事件客户端数组。该批 Host 含 Vite/tsx 的峰值工作集 608,079,872 B；20 ms 采样的 Host＋Chromium/子进程 RSS 合计峰值 1,230,364,672 B（共享页可能重复计数），不能与 Host-only 峰值混同。
- 硬件：Windows 10.0.26100、Intel i7-12700、20 逻辑 CPU、68,391,665,664 B RAM、Node 24.9.0。以上是源码运行与无头 Chromium 的合成验收，不是 packaged Electron、真实生物学结论或 FlowJo 兼容性声明；FlowJo 子集和批处理仍待交付；GatingML 标准子集导入/互操作已由上文独立 FlowKit 报告验证。

## 2026-09-22：10 GiB OME-Zarr 显示缺陷修复与真实验收

- 合成数据由 5120 个实际 2 MiB chunk 文件构成，共 10 GiB，未使用 sparse 文件；形状 5120×1024×1024，uint16。
- 截图检查发现原预览因 16 位到 8 位转换而近乎全黑。已改为当前平面有限值 min/max 线性显示映射，页面明确标注范围、非有限像素数及跨平面亮度不可直接比较；计算原始像素不变。
- 新测试解码浏览器实际使用的 PNG，独立核对第一行 256 个灰度值 0–255，避免只凭 img 元素存在就判定显示成功。20 项 image/OME-Zarr 测试通过。
- 最终证据 `.build/ome-zarr-large-smoke/2026-09-22T03-44-27.254Z/report.json`；本机 warm-cache 首屏约 273 ms，峰值 Host/Vite RSS 514,895,872 bytes（不包含 Chromium）。切片 0/255/5119 原始像素独立匹配，最后切片视角可刷新恢复。已人工查看修复后灰度条纹截图。
- 范围仍是 Zarr v2、受限单平面和支持的压缩，不代表完整 XY 瓦片、多级金字塔选择、全图分块分析、全量像素哈希或安装包验收。

## 2026-09-22：整合回归记录

- Store 34 项通过；Base 40 项通过、1 项跳过；Skills 10 项通过。
- 首轮 Research 全量 234 项通过、1 项跳过、1 项画布导出 5 秒超时；单独复查画布 3 项通过。限制测试并发后的完整重跑正在记录，超时不会从原始日志中删除。
- 代码与打包版本维持 7.0.0；未执行七牛云或 GitHub 发布。


## 2026-09-22 continuation: native ImageJ scratch, colony and CFU

- `fiji-experiments.ts` 的图像划痕、克隆形成、细菌菌落路径改为真实已安装 ImageJ 1.54p／Java 21.0.7 执行。固定 Jython Runner 使用原始 8 位灰度单平面数据、ImageJ LUT 阈值及 ParticleAnalyzer（8 连通），不再将 TypeScript 阈值算法称为 ImageJ。RGB、多页及其它位深拒绝隐式转换；测量数组汇总保留独立路径。
- 图像先经已登记哈希校验及 128 MiB 有界读取，执行使用独立快照；请求指纹包含源哈希与 Runner 哈希。512 MiB Java 堆、2 个活动处理器、120 秒超时、单实例计算槽，只终止本任务拥有的进程。结果 Manifest 校验请求及每个产物哈希；项目路径在逐层创建后核验真实路径。
- 每次原生执行保存 `mask.png`、`overlay.png`、ImageJ `.roi`、`roi.json`、`particles.csv`、原生结果、完成 Manifest、参数、固定脚本与日志。原图坐标与 ROI 局部坐标分别声明。工作台可选已登记图像并直接显示掩膜／边界叠加、测量结果；重复提交相同参数复用幂等键。
- 克隆形成物理面积必须提供正数 `pixelArea`（每像素对应所选面积单位），不允许仅填写 `mm2` 就把像素数标为平方毫米。原生颗粒统计和染色面积分开；触碰颗粒不自动分裂，碎屑按明确 minArea/maxArea 排除并保留表中记录。
- 验证：Fiji 数值及真实 Host 集成共 28 项通过，面板资产选择→分析→掩膜显示→幂等重试 1 项通过；Research Host／Client 严格类型检查通过。真实原生几何样例：划痕 19 像素、闭合 50%；克隆 2 个、18 像素、校准 0.18 mm²；CFU 2,000/mL；非全图 ROI 单独验证，已修复 ImageJ 重复获取处理器重置 ROI 的问题。
- 尚未完成：成管原生插件与其网孔/分段定义验证、时间序列缺失检查、孔／平板排除区域与人工修订、批处理、多页／多通道、真实生物样例与 packaged Electron 显示验收。成管现有路径明确标为 `builtin-exploratory`，不能把其拓扑结果称为 Angiogenesis Analyzer 输出。本节不宣称 Fiji 五类实验全部完成。


## 2026-09-22 continuation: native tube topology and five experiment Skills

- 成管图像现也使用真实 ImageJ：载入现有 `Skeletonize3D_-2.1.1.jar` 和 `AnalyzeSkeleton_-3.4.2.jar`，二值mask→原生细化→无剪枝骨架分析；记录插件文件名和SHA-256，不覆盖用户安装。新增 skeleton.png、原始标签 skeleton-tags.tif、skeleton-topology.json；面板显示骨架。
- 长度为按用户明确等距标定的AnalyzeSkeleton边长之和，pixel单位必须unitScale=1。端点／连接点／分段来自插件字段；`meshes`标识为独立图环Σ(E−V+1)，不冒充空间网孔个数／面积或Angiogenesis Analyzer字段。保留原生每树字段、顶点坐标、边／slab轨迹、端点和junction坐标，空图插件null数组保留null。
- 三类几何独立验收：13像素直线/.5um每像素→6um、2端点、1段、0环；单闭环→0端点、1独立环；空图→0长度、0段、0环。原生插件结果有别于此前探索性TS骨架统计；本轮Host已不再路由TS成管实现。
- 新增五个专项 Skills：zerowall-fiji-western-blot、zerowall-fiji-scratch-wound、zerowall-fiji-colony-formation、zerowall-fiji-bacterial-cfu、zerowall-fiji-tube-formation；共用规则集中在zerowall-fiji，专项参数／边界分开。示例遵循实际research_workflow包装，资源由返回resourceBase解析。
- 非WB实验改用持久化事务reserveScientificRun，owner明确为fiji-experiment；相同请求跨Store连接只建一Run，改参数冲突；完成时全部Artifact和succeeded同事务提交。提供状态／取消／Host退出收尾；取消只对当前Host拥有的子进程。失去执行所有权的Run在超时后明确失败并保留日志，不自动续算、不使用历史PID杀进程。
- 这完成了原生执行和合成参考验证，不等于全实验流程验收：时间序列映射、批处理、孔位与接种量、反光排除区、手工修订、粘连分离、真实生物数据和独立科学复核仍是明确缺口。


## 2026-09-22：画布多面板与工程导出

- 画布新增最多9个面板、1–3列，编辑标题/轴标签/线性范围/图例/系列颜色和折线或散点；支持添加、删除和前移附加面板。JSON仍可编辑数据、注释和来源，支持重新导入已导出的工程；草稿按会话保存，编辑后清除旧预览。
- 每面板有独立坐标轴和裁剪区域，明确刻度；不自动推断误差线或统计显著性。以迭代方式求范围，修复10万点以上spread参数导致的栈溢出风险；空数据使用明确的0–1轴。
- Host核验全部面板的来源ID属于当前项目，登记来源版本和摘要，继承来源产物的needsReview。SVG、PNG、rasterized PDF和可编辑JSON采用一次Store事务登记，失败不遗留部分Artifact记录。
- 6项数值/Host/来源隔离/事务检查及2项React编辑/恢复检查通过。真实React→Host→Chromium两面板预览、刷新恢复、四格式导出和文件哈希通过：`.build/canvas-viewer-smoke/2026-09-22T05-11-48.822Z/report.json`。已查看实际双面板截图；六个点与手工坐标基准一致。
- 仍未包括图片拼版、自由拖拽、带物理标定的图像比例尺、误差线/统计图全覆盖和出版级人工复核。数据点由用户指定，引用校验不等于已独立复算点值。

## 2026-09-22：本地安装包与真实引擎包

- 初次7.0.0安装包已实际生成，packaged运行通过启动/版本/语言设置和研究工作台/分子端到端；这些测试使用独立profile，未覆盖用户正在运行的安装。后续新增HE/序列/画布代码仍须重新构建安装包。
- Windows Host的两份Sharp曾分别为0.35.3与0.34.5，导致分子PNG导出真实失败。已在权威workspace generator统一0.35.3，重新准备依赖闭包，增加打包验证约束，packaged实际PNG导出已通过。
- 独立HE StarDist包65依赖/294成员/496153296bytes已构建。19项契约、两次真实离线导入/CPU模型推理、损坏拒绝和回滚通过，详见`docs/science-engine-packages.md`。需要外部Python3.11 x64；不冒充可移植运行时或完整切片质量验证。
- 已补7.0.0本地构建说明和本地更新元数据；未上传七牛云/GitHub。主安装包尚未签名，实际安装/升级和完整九工具packaged验收仍未完成。


## 2026-09-22：生产验收、Sanger与严格客户端检查

- backend生产提交36ea1bc8ec351534a557d0f470c53d6418c0d8d4；Gateway/Plumber/worker/OmicVerse/Biomni均active。实际MR、coloc、r_files写入/读取/树/manifest和Vina通过，详见另一仓库`raiagentai/docs/production-7.0.0-acceptance.md`。检查时持久R队列queued=0、running=0；历史86 failed和6 timed_out没有抹除或改写成功。仅是软件/合成计算验收，非医学证据。
- Sanger工作台补上真实双向核对操作，Host核验两边revision和source hash，拒绝用同一视图当双向读段；SCF IUPAC原调用不再被最大信号碱基替代。峰图按原样本坐标有界显示，避免对长数组spread求峰值导致栈溢出。10项解析/Host/UI测试通过；人工碱基修订仍未交付。
- 科研插件常规typecheck由权威generator加入`tsconfig.workbench.json`，保证严格客户端检查不被原`noCheck`配置掩盖。修复本轮分子、流式、图像、先导面板等exact optional/RemoteResult类型问题；最新严格检查通过。
- 最新整合Research 272 passed/2 skipped；Store 36 passed；核心提示词/Skill绑定29 passed；引擎包契约19 passed。尚在进行的HE和序列最终交互验收及后续修改另行记录。


## 2026-09-22 HE CPU StarDist 执行与复核补充

此前仅有 RGB 连通域启发式统计的描述已过时。当前 HE 适配器已经接入 OpenSlide 金字塔局部读取及独立 CPU StarDist `2D_versatile_he` 核分割，二者在界面和结果中明确区分。

- 隔离引擎：Python 3.11.9、TensorFlow 2.15.1、StarDist 0.9.1、csbdeep 0.8.1、NumPy 1.26.4、setuptools 80.9.0，65 个固定版本依赖；不修改原 OpenSlide、Fiji 或 napari 环境。
- 模型下载 ZIP SHA-256：`f1696ef0631bd7e1c0e5c0d3017e2b4c6a95e284c6aab9c22fc2f08317817b28`。许可证据、冻结文件哈希、CPU 健康脚本随外置引擎配置维护。
- 方法：固定 Python Runner，OpenSlide 懒读取；最多 64 个 128×128 样本块估计公共归一化；带 context 与 overlap 的 StarDist 原生 `predict_instances_big` 责任区拼接；标签使用磁盘 memmap 和分块 TIFF 输出；预览不全量读取 RGB。轴补齐使用原生对应的反射边界。
- 任务：数据库原子预留与登记、请求幂等、单个本地重任务、线程上限 8、默认 30 分钟、取消、退出/超时失败、完成 Manifest 恢复、源文件及模型/脚本/产物哈希检查。不会根据历史 PID 杀进程，不把旧失联进程当作自动恢复。
- 输出：核标签 TIFF、核 CSV、轮廓 NPZ、带边界标记的 PNG、参数/计数 JSON、脚本/请求/日志/完成清单。未知校准保持未知；核密度分母是 ROI 几何面积，不是组织掩膜面积。

数值验收保留了预先设定的严格容差：IoU ≥0.9 匹配时额外预测=0、遗漏=0，平均真实匹配 IoU ≥0.995。重复公共 HE 软件样例（1500×1200，20 个解码块）与同版本原生整图预测得到 **2131 对 2131 个核、FP=0、FN=0、平均 IoU=0.9999982815**。报告：`.build/he-stardist-reference/2026-09-22T05-26-45.734Z/report.json`。先前使用 edge padding 导致外侧两核偏差的失败记录保留在 `.build/he-stardist-reference/2026-09-22T04-44-02.627Z/`，修复为 reflect 后通过；未为追平计数删除候选或放宽容差。

真实源代码 React → Host → OpenSlide → StarDist → 结果叠加 → 刷新恢复 → 新任务取消通过。公共单 patch 实际检测 182 个核，恢复没有创建第二个运行；报告和截图：`.build/he-stardist-viewer-smoke/2026-09-22T05-31-38.749Z/`。实际图像来源为 StarDist 公共 HE 样例。

针对 HE、HE 生命周期、HE UI 及 Flow UI 的 4 个文件 **11 项测试通过**。新增生命周期测试确认进程无 Manifest 退出后立即失败。`tsconfig.host.json` 与实际严格客户端 `tsconfig.workbench.json` 均通过。`zerowall-he` Skill 已按当前真实 schema、参数、产物坐标与范围更新。

尚未交付的边界：一次任务限制单个 ROI、最多 6400 万采样像素及 10 万核；没有整片批处理、经验证的组织区域模型或临床诊断模型；没有独立医学人工标注真值验证；没有硬性 OS 进程内存上限。公共 patch 重复只验证软件分块一致性，不构成独立生物学样本。这些源界面检查不替代最终安装包 Electron 验收。
