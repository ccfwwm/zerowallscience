# ZeroWall Science 8.0.1 融合实现记录

本次以 `dsh-allupdate@ab7d2fde` 的插件化架构为基础，实际 merge `main@c7cfc769` 的 7.5.0 修复。共同起点为 `0c8506a2`，DSH 固定为自定义提交 `93bacb7e30c888cc01a1322245a33ff3be9ff2b3` / `0.2.0-rc.2`。

## 来源和提交

| 提交 | 内容 |
| --- | --- |
| `57ea4a08` | 保留 merge 来源，解决 52 个冲突，融合 main 的附件、Office、GIS、提示词与 MinerU 修复 |
| `a3e4dabb` | 浏览器私有依赖、插件资源、profile 实际版本与迁移验收 |
| `8c34608b` | 同版本归档不变、发布依赖合同保留、GIS 销毁后的动画修复 |

主目录仍在 `main`，实现目录为 `C:\Users\ccf\.codex\worktrees\dsh-allupdate\zerowallscience`。本次未推送、未上传七牛、未创建 GitHub Release 或插件公开仓库。最终候选包与实际测试结果见 `verification-8.0.1.md` 和 `artifacts/verification/8.0.1/`。

## 融合边界

桌面保留 Electron、DSH Host、凭据保险库、窗口/托盘、安装器、签名环境下载、原生 Office 和更新事务。独立插件承载 AI 云平台、文件/附件、科研工作台、生图、MinerU、Skills、MCP、Python 工具和环境变量等领域功能。

main 的 `dsh-open-file-viewer` 集成继续由 `plugin-files` 承载。没有另注册一套查看器；Office 扩展让给 DSH 原生查看器，科研 TIFF/模型扩展让给科研工作台。`plugin-base` 没有恢复静态聚合所有领域插件，remote 仍由所属插件动态注册。

| 组件 | 独立版本 | Desktop 最低版本 |
| --- | --- | --- |
| `plugin-files`、`plugin-images` | `0.2.0` | `8.0.1` |
| `plugin-base`、`plugin-mineru`、`plugin-mcp` | `0.1.1` | `8.0.1` |
| science 组合 bundle | `0.1.1` | `8.0.1` |
| 未改动的 ZeroWall 插件 | `0.1.0` | 保留已有声明 |

所有 ZeroWall 插件的 DSH 范围保持精确 `0.2.0-rc.2`。应用版本、插件版本与提示词版本分离；提示词继续保留 `7.5.0-file-visual.1`，不替换成桌面版本。历史科研引擎兼容记录保留 7.4.0、7.5.0、8.0.0 等版本。

## 统一构建与查看器资源

正式安装包进入 `artifacts/packages/8.0.1/windows-x64/`，每次完整构建创建新的 `artifacts/stage/8.0.1/<build-id>/`。开发输出进入 `artifacts/dev/`，缓存和验收进入 `artifacts/cache/` 与 `artifacts/verification/`。源码中的输出入口可以是指向集中产物的兼容链接；正式构建不写入 `desktop/dist` 或旧 `.build`。

查看器 CSS 是构建虚拟模块，不生成 `src/client/viewer-style.ts`。PDF Worker、CMap、字体、WASM 与 Leaflet 文件位于文件插件的物理 `lib/viewer-assets` 中，随插件 tarball 一起分发。

资源 URL 采用 `/zerowall/viewer-assets/<SHA-256内容标识>/<白名单路径>`；正确版本使用 immutable 缓存，错误版本与越权路径返回 404。旧无版本 URL 保留兼容，但不缓存。Host 从实际加载的文件插件定位资源，升级后不借用源码目录中的文件。

GIS 地图导航使用即时缩放；侧栏切换和销毁不会继续执行旧地图的缩放动画。仍保留几何渲染、缩放、边界适配与离线底图失败时显示本地要素的能力。

## 同版本不变与发布合同

发布准备移除 `workspace:` / Git 源依赖、开发脚本与发布目录设置，将 DSH 改为 peer 依赖。没有发生版本变化的组件保留原发布依赖范围，避免一次桌面升版改变所有插件的依赖锁定。

构建读取已有历史组件归档。同 ID、同版本的文件集与内容必须相同；仅允许构建注释和编译器产生的纯 CSS 字符串字典顺序差异，随后直接复用原归档字节。真实执行代码、依赖或物理资源发生变化时，构建拒绝复用并要求组件升版。复用记录在 `artifacts/release/8.0.1/immutable-package-receipt.json`。

本次 21 个未升版的插件或支持包复用原归档；修改的五个 ZeroWall 插件和组合 bundle 使用各自新版本。三个自定义 Skill 与四个 Univer Skill 为 `0.1.1`，其他 Skills 保持 `0.1.0`。Skills 采用确定性归档，保留 Univer 来源哈希与适配收据。

Skill/MCP 的同版本历史包也先逐文件比较，再复用原归档字节。本次 274 个未改 Skill 和两个同版本 MCP 条目的 SHA-256 与 8.0.0 相同；旧归档的 `./` 前缀和 tar 头信息不会导致内容相同的资源被误判为新版。新版本使用确定性归档，真实内容变化则拒绝保留原版本。

## profile 和独立更新

安装包默认插件由运行时直接提供。已经独立安装的 profile 插件仍优先；`zws doctor` 展示实际版本、来源、兼容状态和可用更新。不会因为桌面升级重新初始化 profile、恢复用户移除的默认插件或覆盖用户固定版本。

JavaScript 插件通过 candidate profile 安装、Host 健康检查和事务切换升级；失败恢复旧 profile，并支持显式回滚。Skills 内容、启用状态与用户导入资源热刷新。MCP 配置更新对应独立进程的启停与重启。环境变量的值继续存入凭据保险库，命令列表只返回配置状态。

Python 使用独立 generation、验证后的原子 `current.json` 切换和 rollback。正在运行的任务继续使用它已选定的 snapshot。精简桌面包不包含完整 Python archive；启动和浏览 Python 页面只检查状态，用户明确安装后才创建任务。

`dsh` 保持官方语义，`zws` 使用同一 profile 与已有资源管理器。Windows 命令的 PATH 安装有 owner receipt，并检测已有命令；不覆盖或卸载外部命令。

## catalog 和后续发布

四类 catalog 位于 `artifacts/release/8.0.1/catalogs/`，分别为 plugin、skill、mcp、python。每项包括版本、兼容范围、平台、大小、SHA-256、签名和回滚/重启声明；不可变 catalog generation 由签名指针引用。

本地候选 catalog 标记 `localOnly`，验收显式提供本地测试公钥。正式桌面没有加入开发公钥，仍拒绝开发 catalog。后续正式发布需要配置正式签名和资源基础 URL，再将同一批归档、catalog 和 receipt 上传七牛或 GitHub。

插件源码已经具备独立打包边界。本次继续放在当前仓库；通过候选验证后，可迁移到一个 `zerowall-dsh-plugins` 总仓库，各插件保持独立版本与发布，而不重新编译桌面核心。

## 验收边界

验收使用隔离 profile，六份真实样本和既有生成 PPT。模型与生图参数没有切换，不新增付费调用；附件会话中的 `MISSING_CREDENTIAL` 是无凭据测试 profile 的预期结果，不代表已验证新的模型生成。

Windows NSIS 的过长路径可能造成深层 Office 文件缺失。本轮短路径中文目录安装已核对全部 729 个原生资源和 ASAR 哈希；不把“安装器退出 0”作为资源完整的证明。生产注册、全机器 UAC 与公开更新发布未在本次范围内执行。
