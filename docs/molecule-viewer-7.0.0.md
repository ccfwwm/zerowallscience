# 7.0.0 分子结构查看器实施记录

已接入统一科研工作台和 `science_viewer` 同一业务服务，支持登记于当前项目内的 PDB/mmCIF 和单记录 SDF 文件（16 MiB 以内、第一模型最多 10 万原子）。GUI 和 Agent 均使用 `MoleculeService` 的参数、项目隔离、源文件哈希与版本检查。

已实现：

- 本地 Mol* 5.11.0 WebGL 渲染，球棍、聚合物卡通和分子表面表示。
- 按链、残基或配体筛选；旋转、缩放与适配视野。
- 从原子列表选择两个原子，由 Host 基于原始 Cartesian 坐标计算 Å 距离。
- 保存/恢复相机、链、残基、表示和测距原子，使用 expectedVersion 拒绝过期更新。
- 导出 PNG、原始结构文件和 JSON 溯源记录，登记 Artifact、来源 Asset、SHA-256、参数及待复核标记。
- CIF 使用实际 Mol* CIF parser，支持正式 token/多行语法；不依赖简化行正则解析器。

Mol* 独立构建为 `lib/molecule-runtime.js`，实际 2,860,559 字节；主 research client 不内嵌这份运行时。由于现有 DSH `/plugins` 通道只提供注册的 client 模块，Electron 还使用 file/IPC，本版通过已认证 `scienceViewer` 的固定 runtime 动作按需传输一次，在客户端 SHA-256 校验后使用 blob script 加载。Host 只读取固定构建产物与 manifest，不接受路径或脚本参数，上限 8 MiB，并缓存读取结果。所有结构来自已登记本地资产；不使用 CDN、不向外部服务上传结构。

实际变更涉及 research Host/index 注册、shared molecule/types、客户端 panel/view 注册、独立 runtime 构建脚本、固定依赖和测试。补充了此前已有图像模块使用但未明确声明的 `sharp@0.35.3`（与完整安装运行时统一）。`@scarf/scarf` 遥测安装脚本明确禁用。

验证命令：

```powershell
pnpm --filter @zerowallscience/plugin-research run typecheck
pnpm --filter @zerowallscience/plugin-research exec vitest run --config ../../vitest.plugins.config.ts test/molecule.spec.ts
pnpm --filter @zerowallscience/plugin-research run bundle
pnpm exec tsx tools/integration/molecule-viewer-smoke.ts --run
```

2026-09-22：7 项 Host 测试通过；实际 React → Host → Molstar → Chromium WebGL 烟测通过。使用同一份 10 原子、2 链合成结构的 PDB/mmCIF 版本，两原子已知距离为 5 Å。实际执行两格式打开、残基筛选、分子表面、链筛选、相机保存、页面刷新恢复、PNG 与原结构导出。另执行 SDF V2000/V3000 合成乙醇的打开、球棍显示、链/残基筛选、1.5 Å 测距、PNG 和逐字节相同的源 SDF 导出、页面刷新恢复。记录无浏览器外部网络请求、无浏览器异常；PDB 导出 PNG 为 25,793 字节。最新报告及截图位于 `.build/molecule-viewer-smoke/2026-09-22T03-54-32.836Z`。

独立 RDKit 2026.03.6 参考通过已有 rdatalinux Biomni Python 只读执行；仅把合成 fixture 通过 stdin 传入，无安装或服务变更。V2000、V3000 和 V2000 氧负电荷三例的元素、形式电荷、键及坐标一致；最大坐标误差 0，测距 1.5 Å，预设容差 `1e-9`。脚本为 `tools/integration/molecule-sdf-reference.py`，浏览器 smoke 默认调用 rdatalinux 现有 RDKit 环境，重跑需要该 SSH 连接；用户结构不会自动上传。

明确边界：

- 只查看第一 deposited model、原始不对称单元；不自动构建生物学装配或周期结构。
- altLoc 保留标识，跨 altLoc 测距由用户选择负责，不默认解释为同一实际构象。
- 截图由客户端 Mol* 生成；Host 核验 PNG 和登记来源，不能独立证明图像内容未被客户端修改。距离始终由 Host 重算。
- 原子下拉最多显示当前筛选前 5000 项，并保留已选择的跨链原子；大结构需先选链/残基。
- SDF 必须仅含一个以 `$$$$` 结束的记录。V2000 使用 Mol* 标准 parser 及严格计数/坐标/键校验，保留原有形式电荷和原文件。V3000 仅支持中性、顺序编号、无可选属性的验证子集；Mol* 5.11 缺少 V3000 电荷解析，因此显式拒绝 CHG/CFG/其他附加字段，不静默抹去。需要完整 V3000 化学语义时仍需专业准备工具。已准备受体与配体 JSON 的批量 Vina/搜索盒入口见 [对接实施记录](molecule-docking-7.0.0.md)；交互式受体准备和多构象选择仍未实现；SDF 的 2D 坐标不能当作已准备的 3D 构象。
- `docking_autodock_vina` 已经经固定 `research_workflow`/`r_files` 接入；公共受体加乙醇的真实链路、Manifest/请求/构象校验和 Mol* 显示通过，具体证据及科学边界见对接实施记录。
- 本烟测是实际源码浏览器链路，不能代替安装器内 Mol* / GPU / CSP 验收，也不代表 10 万原子的性能验收。
