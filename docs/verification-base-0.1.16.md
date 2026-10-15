# Base 0.1.16 更新入口验收

日期：2026-10-14。分支：`main`。任务开始与结束的根仓库 HEAD：`f727d39994bf396346e3bf249dc5758b3288d27a`。DSH：`8c00ce78435cf35300654c41e69336e69dc758b1`（`0.2.0-rc.2`）；桌面版本：`8.1.3`。

## 变更

- 移除右下角浮动更新条。
- 插件、Skills、MCP 等资源更新只在左下角更新入口显示数量和标记；不自动弹出资源更新对话框，点击直接进入设置中的扩展中心。
- 侧栏收起后保留图标、标记和数量 tooltip；更新清零后恢复普通检查入口。
- 桌面更新保留下载、安装确认流程；同时存在资源更新时保留扩展中心按钮，资源状态变化不重新打开已关闭的桌面更新提示。
- Base `package.json` 和 `zerowall.plugin.json` 升至 `0.1.16`，通过 `dsh:inventory` 同步生成的版本清单。更新 Base 单元测试、桌面 E2E 点击预期、开发指南；增加隔离 Electron 验收脚本 `desktop/scripts/verify-update-entry.mjs`。

共享工作目录原有账户、AI 云平台、图片、环境、Python、扩展中心和其他改动均保留。生成清单包含这些现有版本变化，不能将整个清单 diff 都归为本任务。

## 检查结果

| 命令 | 结果 |
| --- | --- |
| `pnpm --filter @zerowallscience/plugin-base test` | 55 通过，1 跳过 |
| `pnpm --filter @zerowallscience/plugin-base typecheck` | 通过 |
| `pnpm dsh:inventory` | 通过；生成清单包含 Base 0.1.16 |
| `pnpm dsh:verify` | 通过 |
| `pnpm profiles:check` | 通过 |
| `pnpm dsh:runtime:closure` | 通过 |
| `pnpm version:check` | 通过 |
| `pnpm typecheck` | DSH 与 Store 构建、22 个插件类型检查通过；桌面类型检查受下述已有测试错误阻塞 |
| `pnpm plugins:test` | Base 等已执行套件通过；research 为 306 通过、16 失败、3 跳过，递归命令退出 1 |
| `pnpm test:security` | 2 通过 |
| `pnpm test:updates` | 59 通过，3 跳过（未配置该集成测试要求的 Electron fixture executable） |
| `pnpm plugin:build base` | 通过 |
| `pnpm release:metadata`、`pnpm smoke:update` | 通过；仅针对本地现有 8.1.3 安装包元数据，不证明旧安装包包含本次 UI |
| `node desktop/scripts/verify-update-entry.mjs` | 通过；4 张界面截图已目视复核 |
| `pnpm plugin:pack base` | 发布阶段通过；仅打包 Base，包内 client/Host 哈希与上述界面验收代码一致 |
| `pnpm plugins:verify-pack` | 发布阶段通过；22 个原生插件包检查通过，未发布其他插件 |
| `node --test tools/release/targeted-plugin-catalog.test.mjs tools/release/resource-publication-scope.test.mjs tools/release/plugin-dependency-contract.test.mjs` | 发布阶段 9/9 通过 |
| 已安装 Electron + `tools/packaging/verify-installed-plugin-batch.mjs` | 隔离 profile 的正式签名升级、真实 pnpm、Host 健康、回滚及故障恢复全部通过 |
| `publish-resources.mjs stage/promote/verify --kind plugin --reuse-published` | 全部 exit 0；40 个不可变对象和 1 个正式签名指针校验通过 |
| `check-publication.mjs verify` | 普通无 query 公网 URL 验证通过；仅 Base 条目改变，6 个其他指针哈希一致 |
| `git diff --check` | 通过；其他已有文件有 CRLF 提示 |

桌面类型错误：`desktop/test/python-updater-service.spec.ts:274` 的测试数据缺少 `PythonUpdateJob.canPause`（TS2741），该文件任务开始时已有修改。本任务未改动它。

Research 的失败集中在 `brain-coordinate-contract.spec.ts`、`brain-transform.spec.ts`、`cell-viewer.spec.ts`、`research-tools.integration.spec.ts`：测试解释器缺少 NumPy，或找不到 ZeroWall 固定共享 Python 环境，从而阻止业务断言执行。这些失败涉及本任务未改动的功能；未切换解释器、安装依赖或放宽断言。

本次未运行整套 `desktop/e2e/desktop.spec.ts`、`pnpm verify:package`、通用 `pnpm smoke:host` / `pnpm smoke:electron`。发布阶段创建并验证 Base tarball，补跑 `pnpm plugins:verify-pack`，并用已安装 Electron 实测隔离 profile 的签名升级与 Host。未创建新桌面安装包，未重复 ASAR、CLI `dsh --version` / `zws --version`、安装器尺寸与哈希验收。专项 Electron 验收覆盖下面的界面和升级路径，不代替完整安装包验收。

## 编译产物和 Electron 证据

当前 Base client：`artifacts/dev/@zerowallscience__plugin-base/lib/client.js`，720566 字节；SHA-256：`e4b373481df79a6364c67a79b042399c7005c3f6e63b0bf2070d105f664c74b5`。

Host bundle：`artifacts/dev/@zerowallscience__plugin-base/lib/index.js`，15371 字节；SHA-256：`319c60cf4c753bec54b1eead7aa699e081d433785f739771cd0eb452084382bb`。

构建任务记录：`artifacts/cache/build-graph/tasks/plugin-build_base.json`。任务 fingerprint：`4fe5a8449e48af76cde98ae658de8b503dee01b22474ca86bd8dab9ddf6933ff`。构建路径合同当前 ID：`1791793375998-0eb1ffda`；此 ID 来自现有 8.1.3 stage，未产生新的桌面安装包。

界面验收用已有 `artifacts/packages/8.1.3/windows-x64/win-unpacked/ZeroWallScience.exe` 启动独立用户目录，通过 HTTP 响应覆盖加载当前编译的 Base client，通过生产 preload IPC 推送 fixture 更新状态。原有打包客户端的其他模块照常加载，签名资源和安装包未修改，未下载或安装更新。

最终成功证据目录：`artifacts/verification/8.1.3/update-entry/acb0b4a3-1282-407f-9dd1-90641d0bf3fe/`，包含 `receipt.json` 与以下截图：

- `sidebar-resource-updates.png`：只在左下角显示 4 个扩展更新，页面没有更新浮动条或资源更新弹窗。
- `extension-center-from-sidebar.png`：点击直接进入真实设置扩展中心；profile 文件内容一致，安装任务列表为空。扩展中心继续执行真实只读检查，所以此截图中的数量已刷新为 6。
- `collapsed-sidebar-resource-updates.png`：收起侧栏保留更新图标与标记；tooltip 仍包含数量。
- `desktop-and-resource-updates.png`：fixture 桌面版本 99.0.0 的确认弹窗保留下载、扩展中心按钮，无浮动条；关闭后刷新资源状态不会再次弹出。

验收 receipt：`complete: true`，`pageErrors: []`、`routeErrors: []`。早期验收脚本尝试修改 combo URL 导致 404，随后一次立即 reload 的等待超时；修复脚本为保留原始 combo URL、替换 Base 注册后验收通过。最终脚本先等待 Electron 完成首次工作台导航，避免 reload 中断启动；最终 startup.log 记录 `renderer-ready`，进程正常退出。失败目录保留作诊断，成功断言以上述 receipt 为准。

## Base 独立发布

用户明确授权“请发布base”后，2026-10-14 北京时间 10:18 完成七牛正式发布。分支仍为 `main`，父 HEAD 和 DSH commit 均与开头一致。未提交、推送或创建 Git tag / GitHub Release。

发布输入隔离于 `artifacts/verification/8.1.3/base-0.1.16/publication/`，避免覆盖共享工作区其他任务的目录生成结果。其 `release/8.1.3/plugin-packages.json` 只含 Base 候选；定向 generator 从最新正式公网目录保留其他 38 条签名条目。旧归档缓存逐一按正式签名 size/hash 校验，未绕过验签或不可变对象保护。

实际发布命令：

```powershell
$env:ZEROWALL_BUILD_ID = 'base-0.1.16-20261014-release'
pnpm plugin:pack base
node artifacts/verification/8.1.3/base-0.1.16/check-publication.mjs snapshot
node artifacts/verification/8.1.3/base-0.1.16/check-publication.mjs prepare
$env:ZEROWALL_ARTIFACT_ROOT = Join-Path (Get-Location) 'artifacts/verification/8.1.3/base-0.1.16/publication'
$env:ZEROWALL_RESOURCE_PRIVATE_KEY_FILE = Join-Path (Get-Location) 'scripts/env/resource-stable-4-private.pem'
$env:ZEROWALL_RESOURCE_KEY_ID = 'stable-4'
$env:ZEROWALL_RESOURCE_BASE_URL = 'https://zerowall.chengxunkeji.cn/stable'
node tools/release/generate-resource-catalogs.mjs --kind plugin --plugin @zerowallscience/plugin-base
node artifacts/verification/8.1.3/base-0.1.16/check-publication.mjs cache
node scripts/publish-resources.mjs stage --kind plugin --reuse-published
# 真实隔离签名升级、Host 激活、回滚和故障恢复通过后：
node scripts/publish-resources.mjs promote --kind plugin --reuse-published
node scripts/publish-resources.mjs verify --kind plugin --reuse-published
node artifacts/verification/8.1.3/base-0.1.16/check-publication.mjs verify
```

签名与七牛凭据来自 Git ignored 文件，没有打印、上传或提交凭据。stage 仅上传新 Base 归档和不可变目录，其余 38 个旧对象按哈希复用；promote 前重新检查线上 baseline，随后提升 `stable/catalogs/plugin-latest.json` 并刷新 CDN。

### 产物

- build ID：`base-0.1.16-20261014-release`。
- 归档：`C:/softworks/gpt-tools/zerowallscience/artifacts/release/8.1.3/plugins/plugin-base/0.1.16/zerowallscience-plugin-base-0.1.16.tgz`。
- 大小：202,674 字节。
- SHA-256：`0f5c060c73f676abf48603fb13d34e39f655049aba3f2d77703720a707a2c7f8`。
- source fingerprint：`2064ff9d90b9625efe5e5a8209d882b872618ac78424f0b284c5973b5183fd1b`。
- [Base 0.1.16 公网归档](https://zerowall.chengxunkeji.cn/stable/plugins/plugin-base/0.1.16/zerowallscience-plugin-base-0.1.16.tgz)。
- [插件更新指针](https://zerowall.chengxunkeji.cn/stable/catalogs/plugin-latest.json)：527 字节，SHA-256 `e9bf730b3140066e5682b8eff75560fa6be6aaa0c72895ced7b5921dd3c3622b`。
- [不可变正式签名目录](https://zerowall.chengxunkeji.cn/stable/catalogs/plugin/8.1.3/base-0.1.16-20261014-release-1791944068564/catalog.json)：68,030 字节，SHA-256 `0a98b08a53412d3ba80e1aff5425a9b12fc4875be6a50a792c59c11c36354fee`。

### 实际升级与回滚

使用已安装的 `C:/Users/ccf/AppData/Local/Programs/ZeroWallScience/ZeroWallScience.exe`，在 `artifacts/verification/8.1.3/base-0.1.16/isolated-signed-upgrade/` 初始化独立离线 profile。未改动用户实际 profile、账户或 Python 环境。

通过已安装正式资源管理器读取本地正式签名目录，归档从七牛 HTTPS 下载，真实 pnpm 构建候选 profile。Base 0.1.16 更新成功，`packageIds` 只含 Base，Host 停止/启动各一次，实际 Host inventory 确认 Base active。随后完整 profile 回滚成功；再次升级时在实际 Host 激活后注入健康失败，事务恢复旧 profile 和健康 Host。最终 `batch-receipt.json` 为 `complete=true`，测试拥有的进程已退出。

### 收据与范围

- 包内容收据：`artifacts/verification/8.1.3/base-0.1.16/packed-base-receipt.json`，包内 client/Host 与此前测试产物哈希相同。
- 原生 pack：`artifacts/verification/8.1.3/native-pack/42f82b39-ee65-482b-a0a4-f7013915cb2a/receipt.json`，22 个插件包通过。
- 升级、回滚和故障恢复：`artifacts/verification/8.1.3/base-0.1.16/isolated-signed-upgrade/batch-receipt.json`。
- stage / public 收据：隔离 publication 的 `release/8.1.3/publication/qiniu-resources-plugin-stage.json` 与 `qiniu-resources-plugin-public.json`。
- 普通无 query 公网复核：`artifacts/verification/8.1.3/base-0.1.16/qiniu-normal-public-urls.json`，`complete=true`；实际公网下载保存为同目录 `public-base-0.1.16.tgz`。
- 日志：`artifacts/logs/8.1.3/base-0.1.16-{qiniu-stage,qiniu-promote,qiniu-verify,isolated-upgrade}.log`。

普通公网指针与本地提升字节一致；目录和所有条目验签通过；公网归档的大小、哈希和本地包一致。仅 Base 从 0.1.15 更新到 0.1.16，其余 38 条资源及原始签名一致。`stable/latest.yml`、两个桌面 JSON 指针，以及 Skills/MCP/Python 三个资源指针的 SHA-256 均保持一致。未发布其他插件或桌面安装器。

桌面 8.1.3 客户端可在“设置 → 扩展中心 → 检查更新”更新 Base 至 0.1.16，完成后按提示重启以加载新客户端代码。未在用户真实 GUI/profile 安装此次更新，未验证其他系统或全部历史桌面版本。此前全仓类型检查与 research 测试失败仍按上文记录，不记为全量通过。
