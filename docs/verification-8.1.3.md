# ZeroWall Science 8.1.3 验收与发布记录

## 源码与交付边界

本轮直接使用当前项目，未创建 worktree、未使用子代理。分支为 `main`，父 HEAD 为 `15aa09b7a586ef71f18e0ab06da9cfec4caff929`；DSH 为 `8c00ce78435cf35300654c41e69336e69dc758b1`，分支 `zerowall/reviewer-history-opaque`，版本线保持 `0.2.0-rc.2`。工作区含本轮及已有用户修改，构建 manifest 标记源码非 clean；未提交、推送、打标签或创建 GitHub Release。

仅发布七牛 Stable。资源使用 Ed25519 `stable-4` 签名，并保留旧稳定公钥兼容；Windows EXE 没有 Authenticode 签名。凭据、私钥、用户数据、Python 和旧 slots 未纳入源码或发布包。

## 最终版本

| 组件 | 版本 |
| --- | --- |
| Desktop | 8.1.3 |
| Python | 0.1.7 |
| BioGenie | 0.1.3；上游 0.6.48，commit `9ad4269d0afd49213431bb4ee4d00566704641f3` |
| Account / AI Cloud | 0.1.6 / 0.1.6 |
| MCP / Extension Center / Base | 0.2.11 / 0.1.9 / 0.1.15 |
| Files / Research / 科研组合声明 | 0.2.5 / 0.1.11 / 0.1.13 |
| zerowall-bio / zerowall-python-packages | 0.1.3 / 0.1.4 |
| CPython / bootstrap | 3.12.10 / 1.5.2 |
| 核心 / 科研清单 | r18-core / r18；43 / 529 包 |

部分插件版本比原计划提高，原因是先前候选已暂存相应不可变对象；不复用同版本发布不同字节。

## 已验证行为

- Python 默认为 `<实际安装目录>\Python\python.exe`。自定义根遵循同一固定布局；旧默认根和 slots 不迁移、不删除、不执行。Roaming 是既有用户配置的目录，不是安装目录；新 profile 或 Roaming 不可用时使用 LocalAppData。
- 首次显式安装下载验签 bootstrap 并展开到固定根，实际 Electron 检查解释器、pip 和本地包。下载中断保留原始错误与断点，用户重试后成功。
- 本地 pandas 2.2.3 与在线目标版本不同仍计为已安装，补缺计划不重装、不升级、不降级。pip 检测使用固定解释器；运行、包存在和 MCP 服务分别报告。
- 固定路径事务覆盖提交、取消和同目录回滚。原安装→升级→卸载→重装收据证明 Python 可执行文件 SHA-256 不变，未归属用户文件保留。
- 实际工具发现与分发完成 `tool_search → tool_dispatch → bio_local`，序列 `ATGGCCATTGTA → MAIV`；文件输入、多记录与越界拒绝、SBOL、正式 DE/GSEA、分组 ML、质粒绘图均通过。
- 实际 Python 取消、超时和 1,200,000 字节 stderr 完整结果保留通过。安装后的实际 Bio Tools 完成 `initialize → tools/list → bio_jobs` 调用。
- 两个实际签名插件 Account + AI Cloud 通过真实 pnpm 准备后只停止/启动一次 Host；完整 profile 回滚和候选健康失败后恢复旧 Host 均通过。
- docopt 源码构建失败后，从七牛下载匹配的签名 wheel 并实际安装成功；坏哈希/不兼容资源拒绝。五个首批 fallback wheel 均经干净 Python 构建及安装验证。

## 中科大网络实测

默认源为 `https://mirrors.ustc.edu.cn/pypi/simple`，保留用户明确保存的镜像。未改全局 pip 配置，未关闭 TLS。

在本机使用固定 Python 连续三轮无缓存下载 pandas 2.3.3、NumPy 2.3.3、MCP 1.26.0：共 9 个 wheel、72,038,856 字节，耗时约 3.98 / 3.56 / 3.36 秒，大小与 SHA-256 全部一致，未发生中断。该结果是本机当时网络实测，不能保证所有客户网络永不失败；重试与断点校验仍保留。

收据：`artifacts/verification/8.1.3/ustc-network/receipt.json`，日志：`artifacts/logs/8.1.3-ustc-network.log`。

## 旧离线运行时覆盖修复

实际 8.1.2 → 前一 8.1.3 候选升级曾失败：旧 `PythonEnvironmentPanel.module.css` 残留在 `resources/offline-profile`，新版严格签名集合检查发现多余 1 个文件，拒绝启动。失败记录保留在 `nsis-812-813-final/electron/receipt.json`；build `1791790849334-f9889e35` 的 EXE 不用于发布。

最终复制器以新版签名 payload 为准，复制前逐文件检查新资源大小和 SHA-256；旧收据缺失或损坏不阻断升级。旧集合之外的普通文件逐文件直接删除，不创建备份；新版文件直接覆盖。该流程不依赖旧版本号，旧版展开目录、冗余 tarball 和离线归档也从活动闭包移除。安装器不执行旧版递归卸载器，不删除或替换 Python、用户数据目录。

`node --test tools/packaging/installer-ownership.test.mjs` 在实际 Electron 文件接口下 11/11 通过，无跳过：旧收据缺失/损坏、旧版展开目录、旧残留直接删除且不创建备份、新文件覆盖、Python/用户文件保留、坏签名/坏哈希/未签名文件/缺少新版收据拒绝、ASAR 原始字节及 MAX_PATH。日志为 `artifacts/logs/8.1.3-offline-delete-tests.log`。

## 检查命令与证据

| 检查 | 结果与证据 |
| --- | --- |
| dsh:inventory / dsh:verify | 通过；`8.1.3-final-dsh-inventory.log` / `8.1.3-final-dsh-verify.log` |
| profiles:check / dsh:runtime:closure / version:check | 通过；对应 `8.1.3-final-*.log` |
| typecheck / plugins:typecheck | 通过；`8.1.3-typecheck-final-all.log`，最终 Desktop/Python 专项类型检查补验通过 |
| plugins:test | 全 22 插件通过；`8.1.3-plugins-test-last-verified.log`；历史缺固定 Python fixture 的失败日志保留 |
| test:security | 2/2；`8.1.3-security-release-last.log` |
| test:updates | 59 通过、3 跳过；`8.1.3-updates-release-last.log` |
| Python 固定路径/事务集成 | 11 通过、2 跳过；`8.1.3-final-python-integration.log`；wheel 两项随后补跑，3/3、无跳过 |
| bootstrap 原始错误保留 | 42/42；`8.1.3-bootstrap-error-final-tests.log`；Python 插件 11/11 |
| 默认源与下载重试 | 21/21；`8.1.3-ustc-default-and-retry-tests.log` |
| plugins:verify-pack | 22 个原生插件包通过；`8.1.3-accepted-plugins-verify-pack.log` |
| 实际安装工具链 | `installed-tools-final/installed-tools-receipt.json` 的 complete=true |
| 实际插件批次与回滚 | `installed-batch-final/batch-receipt.json` 的 complete=true |
| CLI | dsh `0.2.0-rc.2`，zws applicationVersion `8.1.3`；`8.1.3-installed-*-version.log` |

日志均位于 `artifacts/logs/`；上表中的验收子目录位于 `artifacts/verification/8.1.3/`。前一完整候选的 Electron smoke 为 16 通过、2 跳过，跳过项是当前 Windows clipboard 接口不可用；不得记成 18/18。

## 外部限制

未提供真实 AI 测试账户，托管供应商、同步并发/失效及界面经源码测试，未实际登录客户网关验证。未验证所有远程科研 API、机器级 UAC 或其他操作系统。源码 SciMaster bundle 和用户 Zotero 重放 fixture 未提供，相关合同测试跳过。真实 Bio Tools 和本地 BioGenie 结果不代表所有外部科研服务通过。

## 最终构建

最终 build ID 为 `1791793375998-0eb1ffda`。Windows x64 安装器位于 `artifacts/packages/8.1.3/windows-x64/zerowall-science-8.1.3-win-x64.exe`，大小 `316,315,589` 字节，SHA-256 为 `1e2fb6c6ed50acc355483b2b62b1ae1d7fc6ebedd69f0d907a1110bad3c8d1a1`。对应 `artifact-manifest.json` 记录源码与 stage 收据。

打包重试通过，日志为 `8.1.3-offline-delete-build-retry2.log`：thin Python 检查、ASAR/运行闭包、真实 Electron 启动、About 8.1.3、中英文设置切换通过；5141 个安装资源、1018 项签名离线闭包（含收据），展开大小 1348.2 MiB。前次因 Windows `EBUSY` 在编辑候选 EXE 资源时失败，确认无候选进程并检查独占可写后，使用同一已验证 stage 和 runtime 写锁重试；失败日志保留。未修改正式用户安装。

发布前，七牛暂存的 332 个不可变对象已全部公开验签/大小/哈希校验通过，目录 generation 为 `1791793375998-0eb1ffda-1791793510877`。完成真实升级与生命周期验收后提升 Stable 指针，结果见下节。

最终 `pnpm verify:package` 通过，日志 `8.1.3-verified-delete-package.log`，包含真实 Host + Desktop。`pnpm smoke:update` 通过。最终 `pnpm smoke:electron` 为 16 通过、2 跳过，日志 `8.1.3-verified-delete-smoke-electron.log`；两项 clipboard 跳过与前候选一致，未弱化测试断言。

真实 NSIS `8.1.2 → 8.1.3` 升级与安装后的 Electron 全部通过：`nsis-812-813-final-delete/nsis-upgrade-receipt.json` 和 `electron/receipt.json` 均 complete=true。已断言旧 CSS 删除、不创建残留备份、旧 slots marker 保留、所有产品执行入口使用固定 Python；在线 bootstrap、中科大默认源、手动 pip 安装 pandas 2.2.3 后按存在复用均通过。日志为 `8.1.3-nsis-812-upgrade-final-delete.log`。更早展开目录的兼容通过普通旧文件集的集成 fixture 验证，未取得各历史版本安装器逐版安装。

随后在同一已升级环境完成覆盖升级、卸载、同目录重装，`nsis-receipt.json` 的 upgradePreserved/uninstallPreserved/reinstallPreserved 均为 true，Python SHA-256 始终为 `4d6f5f81a4bca11191c4c7c6b43632694d0a4ce74e068619d8fdc161d469859a`。重装后实际导入 pandas 2.2.3、NumPy 2.5.4 成功，解释器仍为固定根；收据为 `package-retention.json`，日志为 `8.1.3-nsis-final-delete-lifecycle.log`。正式用户应用进程保持运行，应用注册、PATH 和快捷方式在 finally 中恢复。

## 七牛 Stable 发布

核心 43 包与科研 529 包的签名 r18 清单已上传不可变路径，并更新 `stable/zerowall-science-python/windows-x64/core.json` / `latest.json`，公网校验通过；收据 `artifacts/release/8.1.3/publication/qiniu-python-dependencies.json`。资源目录的 stage / promote / verify 均通过，38 个插件、282 个 Skills、2 个 MCP、6 个 Python 资源及 4 个签名目录共 332 个不可变对象；收据 `qiniu-resources-stage.json` / `qiniu-resources-public.json`，对应最终 generation。资源 promote 不修改桌面 `latest.yml`。

`pnpm release:publish:stable` 的 stage / promote 和 `pnpm release:verify:stable` 全部通过。安装器上传中的网络重试使用 HTTPS 8 MiB 分片与持久进度，五次尝试复用已完成分片后成功；没有覆盖已发布的不可变版本。安装器、blockmap、版本 JSON 与三个桌面 Stable 指针均公开校验通过，收据为 `qiniu-desktop-stage.json` / `qiniu-desktop-public.json`。最终桌面公网校验时间为 `2026-10-12T08:55:41.536Z`。

公开下载：[ZeroWall Science 8.1.3 Windows x64](https://zerowall.chengxunkeji.cn/stable/releases/8.1.3/zerowall-science-8.1.3-win-x64.exe)。大小 `316,315,589` 字节，SHA-256 与上节最终构建一致。

独立运行 `verify-normal-public-urls.mjs`，对不带查询参数的安装器、blockmap、版本 JSON、3 个桌面指针、4 个资源指针及 2 个 Python 清单指针共 12 个普通 URL 完整下载并核对大小和 SHA-256，全部通过。收据为 `artifacts/verification/8.1.3/qiniu-normal-public-urls.json`，complete=true，build ID 与最终包一致；日志 `8.1.3-qiniu-normal-public-urls.log`。

本轮未创建 GitHub Release，未提交/推送源码或标签。所有跳过项、外部限制及源码非 clean 状态仍按前文保留，不因发布成功而改记为通过。
