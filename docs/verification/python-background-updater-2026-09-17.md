# Python 后台更新与依赖管理验证记录

日期：2026-09-17。目标解释器保持 **Python 3.12.10**，兼容已发布的 **1.4.0** 归档。本文只记录本轮客户端改造，不代表重新发布七牛云环境或桌面正式版本。

## 实现

- Electron 主进程通过独立 Node 子进程调度下载、流式解压、候选环境验证和包管理。采用低优先级、逐条目解压，避免整包读入 JSZip。
- 更新器脚本、公共代码块和 ZIP 读取依赖独立存放在 `app.asar.unpacked`，从物理路径启动，避免更新子进程为了读取脚本而加载整个应用 ASAR 的文件索引。
- 下载缓存以签名归档 SHA-256 命名，支持 Range 续传；完整大小和哈希匹配后才能安装。任务记录持久化在 `jobs`，退出后可恢复。
- 环境和扩展目录使用唯一快照。活动指针原子替换；旧环境、回滚环境和运行中 Python/MCP 的引用受到保护。无引用旧快照保留 24 小时后清理，保留传统 A/B 目录兼容入口。
- 托管 MCP 新进程先完成初始化和工具清单读取，Host 确认后提交快照。新调用转到新进程，旧调用完成后才关闭旧进程。工具接口发生变化时拒绝热切换，保留原环境并报告原因。
- 活动环境与更新目标分别建模。依赖清单带快照标识，迟到的旧响应无法覆盖新清单。活动指针不再包含完整 Skills 审计。
- 依赖改为独立滚动的虚拟列表，提供本地搜索、来源筛选、逐包检查、升级预览、详情、恢复版本和环境回滚。设置页面关闭不会停止后台任务。
- 核心包和扩展使用同一候选事务：解析完整关联变更、默认固定无关包、必要时只允许关联包向上更新；只接受有哈希的 Windows wheel，离线安装后执行 `pip check`、导入、相关最小计算和科研服务验证。
- 核心变更记录为本地修订，保留官方签名 manifest；官方环境更新重放定制要求，有冲突则保留当前环境。
- 修复已发布 1.4.0 归档缺少公共 CA PEM 的兼容问题：使用 Node 信任根验证 pip TLS，仅在未激活候选中补齐公共证书。未关闭 TLS 校验。未来打包保留公开 certifi CA 文件，仍排除私钥。

## 验证结果

### 源码与接口

- Desktop：30 项通过，涵盖环境安装、签名/归档校验、Range 续传及服务器忽略 Range、损坏缓存、下载中断、目录穿越、大小写重复目标、符号链接、空间不足、快照引用保护、任务暂停及同任务编号恢复、提交后崩溃的幂等恢复。
- MCP/Python 插件相关测试：39 项通过，包括工具接口变化保护及真实定时器触发的切换准备。合计 69 个不同测试用例。
- Desktop、MCP Host/Client、Python Host 类型检查通过。
- Desktop 与插件打包通过；变更范围 `git diff --check` 通过。

### 真实环境与归档

归档：`.build/python-1.4.0/dist/zerowall-python-windows-x64-1.4.0.zip`。

大小：983,689,995 字节。SHA-256：`ae486bf3a41371bafaf08f8ab16b54b6a398e8c753d4812410ff2af45c51f705`。

| 项目 | 结果 |
|---|---|
| 解压条目数 | 63,655 |
| 独立解压耗时 | 210.03 秒 |
| 独立解压进程峰值 RSS | 216.42 MiB |
| 解压进程事件循环 P95 | 21.35 ms |
| 真实 1.3.0 → 1.4.0 | 387 个有效包，保留 6 个扩展 |
| 活动指针 | 小于 8 KiB |
| 更新前启动的 80 秒 Python 任务 | 使用原解释器正常结束 |
| 核心 colorama 定制、升级、回滚 | 通过 |
| 扩展 tomli 升级及来源统计 | 通过 |
| 官方修订重放核心与扩展定制 | 通过 |
| 官方更新回滚 | 通过 |
| 不可满足的 NumPy 版本请求 | 拒绝变更，保留当前环境 |

上述解压进程数据不是 Electron 主进程或界面响应数据，两者分别测试。

证据位于 `.build/python-updater/archive-benchmark.json`、`real-upgrade-verification.json`、`customization-verification.json` 及对应日志。

### 打包后的 Electron

隔离测试程序：`.build/python-updater/package/win-unpacked/ZeroWallScience.exe`。隔离用户目录：`.build/python-updater/packaged-smoke/profile`。

最终完整打包回归于 23:55 通过，使用真实签名 1.4.0 manifest 和完整 ZIP。暂停并退出后恢复同一任务，关闭设置后更新继续，最终自动显示 Python 3.12.10 / 1.4.0 / 387 个有效包，并保留六个扩展。宽 1280 与 720 的最终截图已经人工检查，列表具有独立滚动样式，虚拟列表同时渲染的条目少于 40 个。

| 最终打包实测 | 结果 | 目标 |
|---|---|---|
| 搜索交互 P95，146 个样本 | **32.76 ms** | ≤ 200 ms |
| 主进程事件循环延迟 P95 | **33.98 ms** | 记录量化 |
| 主进程 IPC 往返 P95 | **6.63 ms** | 记录量化 |
| 更新子进程 Windows 峰值工作集 | **233.77 MiB** | ≤ 256 MiB |
| 页面脚本异常 | 0 | 0 |

内存修复包括：避免大记录和 manifest 并发重复解析；从 `app.asar.unpacked` 启动更新器及 ZIP 依赖，避免读取整个应用 ASAR 索引；SHA-256 校验复用单个 1 MiB 缓冲区；限制更新进程 V8 堆。早期打包版本峰值为 575.86 MiB，最终数据以上表为准。子进程内存统计仅指 Node 更新进程，不合计健康检查启动的 Python/MCP 进程。

本轮 manifest 从本机只读 HTTP 夹具提供，归档复用已验证缓存，因此不将其作为七牛云下载速度测试。恢复后，从首条解压进度到环境验证约 **215.67 秒**；环境验证约 **25.10 秒**；服务切换准备约 **0.86 秒**。归档占用 983,689,995 字节，解压文件逻辑总大小 2,968,079,841 字节；这些不是全盘磁盘峰值测量。断网和 Range 续传另由网络夹具测试覆盖。

最终证据：`.build/python-updater/packaged-smoke/verification.json`、`stage-timings.json`、`python-panel-1280.png`、`python-panel-720.png`。规范重打包后，逐字节核对主进程、preload、更新器公共代码块、MCP/Python 插件及 ZIP 依赖与构建输出一致，并检查必要文件确实在 ASAR 外；结果位于 `.build/python-updater/package-audit.json`。最终产物没有沿用诊断阶段的手工替换文件。

早期打包测试发现 Host 延迟启动条件和原有 30 分钟轮询间隔阻止及时确认，超时后正确保留 1.3.0。已修正：候选切换确认不依赖普通 MCP 后台启动标记，默认每秒检查小型事务与指针，manifest 保持按文件变化缓存，并加入真实定时器回归用例。

截图检查还发现局部构建缺少项目已有的 CSS 注入步骤。最终构建执行 `tools/plugins/inline-css.mjs`，并在打包界面测试中断言列表的实际滚动样式。仅检查 DOM 文字不足以替代视觉验收。

## 边界

- 测试使用独立目录，没有切换用户当前使用的 Python 环境，没有覆盖另一个发布任务的 `desktop/dist`，没有上传七牛云或 GitHub。
- 三个真实科研服务在环境健康检查中完成初始化和工具列表检查；新旧调用并发路由使用真实 stdio 协议的可控服务验证。最终打包界面测试禁用默认远程 MCP，避免网络凭据影响结果。
- 未调用收费模型做聊天推理负载测试；界面输入/列表性能与模型响应速度分别看待。
- 更新资源消耗和耗时受 Windows 防病毒、磁盘以及并行软件影响。当前数字来自本机单次测试，不是所有客户机器的性能保证。
- 已加入故障保护，但未模拟断电或实际耗尽整块磁盘；使用中断、异常返回、空间阈值和持久化恢复测试验证相应分支。
- 本地验证程序沿用工作区 6.2.1 版本号，不应当作为新的正式 6.2.1 发布覆盖线上安装包。

## 复现入口

- `desktop/test/python-archive.spec.ts`
- `desktop/test/python-updater-service.spec.ts`
- `desktop/test/python-snapshots.spec.ts`
- `plugins/mcp/test/managed-generations.spec.ts`
- `plugins/mcp/test/python-panel.spec.tsx`
- `desktop/e2e/python-updater.spec.ts`
- `tools/release/benchmark-python-updater.ts`
- `tools/release/smoke-python-updater.ts`
- `tools/release/smoke-python-customizations.ts`
