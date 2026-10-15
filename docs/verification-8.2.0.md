# ZeroWall Science 8.2.0 验收与发布记录

- 分支：`main`
- 父仓库 HEAD：`b5fc20202410f159e72e1a67d756265525685120`
- Git 标签：`v8.2.0`（已推送至 `origin`）
- DSH：`4af4cb76935bd893a6854f38403bd06928878074`，`zerowall/reviewer-history-opaque`，`0.2.0-rc.2`
- 构建 ID：`1792008538381-25c2fcd4`
- 安装包：`artifacts/packages/8.2.0/windows-x64/zerowall-science-8.2.0-win-x64.exe`
- 安装包大小：`317554262` 字节
- 安装包 SHA-256：`4f21394719675acdcb7e77229006d0b3c2f475f33d366dc32d5e89b75ee6e3b8`
- 安装后的 ASAR 与本地展开包一致，SHA-256：`3c41c34e0102a2c9b9ab75f41fe2a21140bc57a5b579bad608c4143518699e06`

`artifact-manifest.json` 明确标记 `source.clean=false`；本包由上述父 HEAD 加本地未提交源码构建，不能声称仅凭父 HEAD 可以重现。

## 变更范围

启动工作台增加了真实 Renderer 就绪检测、旧 Host 导航取消和动态端口回退；没有工作区时 Base 自动创建用户目录下的默认工作区。插件更新会先卸载旧 Renderer，再进行 Host 停止、候选 profile 激活和回滚，避免旧页面访问已销毁的服务。Oh Story 的媒体会话节点、轨迹/Zotero/SSH 面板和发送消息显示链路已修复。SSH 原生加速器默认禁用时仍使用纯 JavaScript 连接。

Python 补装依赖继续校验签名、平台、固定安装根、解释器和 wheel 兼容性，但不再把桌面版本或清单中的 Python 版本当作安装阻断条件；旧版本客户端导入同一签名清单已验证通过。Office 本地适配包使用 `0.3.7-zws.3`，避免和七牛中已有的不同字节复用同一不可变版本。

最终离线包包含本地已经打包的完整插件集合。关键版本为 Sidebar `0.26.1-zws.1`、GenUI `0.12.1-zws.1`、Progressive Tools `0.7.2-zws.1`、Archive Manager `1.0.17-zws.1`、Oh Story `0.1.16-zws.18`、Python `0.1.14`、Office `0.3.7-zws.3` 和 SSH `0.3.19-zws.1`。

## 验收证据

- 空用户目录安装启动：约 `26945 ms`，自动创建默认工作区，工作台进入 `ready`。
- 真实用户目录安装启动：约 `24399 ms`，保留 335 个会话、572 个 Python 包、凭据、配置和插件选择。
- 真实 Electron computer-use 验收：保持 `deepseek-flash`，发送测试消息后 12 秒显示完整回复“最终消息正常。”轨迹可切换；Zotero 面板显示本机 Zotero 未运行；SSH 侧栏可打开并显示未连接状态。
- 桌面测试：44 个文件通过，274 项通过，15 项跳过。
- 插件测试分两组执行：其他插件在隔离环境中 408 项通过、4 项跳过；Research 使用软件自带固定 Python，58 个文件通过、322 项通过、3 项跳过。MinerU 和 Publications 未提供单元测试文件。
- DSH inventory、DSH verify、profiles、runtime closure、version、typecheck、plugins:typecheck、security、updates、verify-pack 和 smoke:update 均通过。
- Updates 63 项通过、3 项跳过；Security 2 项通过；22 个一方插件的 native pack 验证通过。
- `pnpm verify:package` 验证 Host/Desktop、中英文设置和版本、5187 个安装资源与 1063 项签名离线闭包。安装器为 302.8 MiB，展开包为 1352.8 MiB。
- 已安装 `resources/commands/dsh.cmd --version` 返回 `0.2.0-rc.2`；`zws.cmd --version` 返回 `8.2.0`。
- 纯 JavaScript SSH 回环握手与只读命令通过；旧 Python worker 使用 8.1.3、8.0.0、7.0.0、6.0.0 应用版本导入同一签名清单均通过。

隔离环境中的部分历史测试依赖私有 H5AD/OpenSlide、实时 R 或 docking 服务，未配置的项目按契约跳过。默认并行测试出现过超时和 Windows 临时目录清理 EPERM；桌面和相关插件已串行重跑通过。Research 首次误用系统 Python 缺少 numpy，改用软件自带 Python 后通过。将真实 Python 根注入所有插件测试会破坏 MCP/Python 的“环境不存在”隔离 fixture，因此最终只对 Research 注入真实环境，其他插件保持隔离；原始失败日志均保留。Sidebar 全量测试 2491 项通过、8 项跳过，2 项临时目录清理 EPERM 在后续重跑中通过。GenUI 1219 项通过、4 项跳过。

最终测试命令为 `pnpm --workspace-concurrency=1 --filter '@zerowallscience/plugin-*' --filter '!@zerowallscience/plugin-research' run test --no-file-parallelism`，以及配置固定 Python 后的 `pnpm --filter @zerowallscience/plugin-research test --no-file-parallelism`。记录分别为 `artifacts/logs/8.2.0/accepted-all-plugins-isolated.log` 和 `accepted-research-managed-python.log`；桌面最终记录为 `accepted-desktop-serial.log`。`git diff --check` 仍报告用户已有 `packages/dsh/dsh-progressive-tools/docs/cost-baseline-report.md:67` 的末尾空行，未修改无关文档。

仅验证 Windows x64。真实 Zotero 未运行，未验证它的实时文献连接；Zotero 包 RPC 使用只读隔离 fixture。SSH 验证面板与回环握手，未连接生产服务器。未执行远程 R、真实 docking、机器级 UAC 或所有外部科研服务。桌面中 15 项与资源/插件中的未配置 fixture 跳过不能解释为已覆盖。

## 七牛发布

桌面安装器、40 项插件资源、Python core/science 签名清单和 Stable 指针已经 stage、promote、verify，并使用无查询参数的普通 URL 重新下载校验。发布收据位于 `artifacts/release/8.2.0/publication/`，普通 URL 复核为 `artifacts/release/8.2.0/publication/qiniu-final-normal-urls.json`。

下载地址：

`https://zerowall.chengxunkeji.cn/stable/releases/8.2.0/zerowall-science-8.2.0-win-x64.exe`

插件目录：

`https://zerowall.chengxunkeji.cn/stable/catalogs/plugin-latest.json`

Python 依赖目录：

`https://zerowall.chengxunkeji.cn/stable/zerowall-science-python/windows-x64/latest.json`

## 最终补充验收

- 已安装版本通过原生 computer-use 验证设置窗口：默认约 `1040×820`；拖拽缩小后关闭并重开保持尺寸；方向键每次调整 `40px`；`Home` 和“恢复默认大小”恢复默认尺寸。窄窗口下 AI 云平台账号、余额、充值与订单区域可滚动且没有横向溢出。
- 已安装版本打开右栏“多媒体创作”，工作台实际加载并显示 `26` 个媒体模型；“任务与结果”“模型设置”“作品素材”均可切换，聊天正文和输入框仍保持可见。未提交支付订单或付费生成请求。
- 40 项发布资源包括 36 个可执行插件、1 个组合声明和 3 个支持资源，已再次与安装版核对；组合包 `@zerowallscience/dsh-bundle-science@0.1.13` 保持声明性质，24 个组成插件分别安装和验签。完整机器可审计收据为 `artifacts/verification/8.2.0/goal-completion-audit.json`，设置与媒体 UI 收据为 `artifacts/verification/8.2.0/installed-restart-final/settings-media-computer-use-receipt.json`。
- 独立 Playwright/CDP 设置探针在连接阶段由 Playwright 传输断言失败，未进入产品断言；该失败日志 `artifacts/logs/8.2.0/accepted-settings-installed-final.log` 保留，最终设置结论以原生 computer-use 观察为准。

主仓库提交 `b5fc20202410f159e72e1a67d756265525685120` 已推送至 `origin/main`，标签 `v8.2.0` 已推送至 `origin`。

## GitHub 发布

GitHub Release 已正式发布：

`https://github.com/ccfwwm/zerowallscience/releases/tag/v8.2.0`

从 GitHub Release 独立回源下载 `zerowall-science-8.2.0-win-x64.exe` 后复核：大小 `317554262` 字节，SHA-256 `4f21394719675acdcb7e77229006d0b3c2f475f33d366dc32d5e89b75ee6e3b8`，与本地安装包和 Release 资产摘要一致。
