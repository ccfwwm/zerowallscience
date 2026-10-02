# ZeroWall Science 8.0.0 本地迁移验收

2026-10-01 完成架构迁移和 Windows x64 本地候选包。此报告描述本地验证结果；8.0.0 未上传七牛云，未创建 GitHub Release 或公开插件仓库。

## 分支、模型与隔离

| 项目 | 结果 |
| --- | --- |
| 实施 worktree | `C:/Users/ccf/.codex/worktrees/dsh-allupdate/zerowallscience` |
| 实施分支 | `dsh-allupdate` |
| 起点 | `main@0c8506a2bce63e3268f93f74476d98fd38a46f94` |
| 自定义 DSH | `93bacb7e30c888cc01a1322245a33ff3be9ff2b3` / `0.2.0-rc.2` |
| 最终 runtime 构建提交 | `3c75dfdf0faad6dcbc3342cc11c955bf326e4889` |
| 最终 build ID | `1790817499571-d4770586` |
| 模型 | 本任务未切换执行模型，未修改用户模型配置 |

原目录 `C:/softworks/gpt-tools/zerowallscience` 的 `main` 引用仍为上述起点。本任务仅向独立 worktree 写入。原目录当前处于用户另一个 `codex/dsh-file-preview-ppt-visual` 分支，并有并行工作产生的修改；因此不把原目录所有文件哈希宣称为未变化，也不回退这些修改。只读对照收据为 `artifacts/verification/8.0.0/main-preservation-final.json`。

最后一次打包复用了未变化、已经验收的 DSH、插件和资源 staging，重新编译桌面 Python 修复；复用范围写入本次 stage 的 `desktop-rebuild.json`。安装包构建后补充的提交只涉及测试、验收脚本及说明文档；插件原生打包入口已经进入本次 staging。包 manifest 保留实际 runtime 构建提交，不能用后续文档提交替换它。

## 已实现的功能边界

| 领域 | 实现 |
| --- | --- |
| 版本 | 桌面统一 8.0.0；20 个 ZeroWall 插件独立为 0.1.0；保留历史兼容版本 |
| 构建 | 新输出进入 `artifacts/cache`、`dev`、`stage`、`packages`、`verification`、`release`、`logs` |
| DSH 集成 | 保留 ZeroWall Electron 主进程与固定自定义 DSH；采用官方 profile、ModuleLoader 和包管理语义 |
| 插件 | 独立 Host、Client、remote 和 manifest；领域 client 动态注册；science bundle 仅声明组合 |
| 命令 | Windows `dsh.cmd/.ps1`、`zws.cmd/.ps1`；官方 PATH worker 和 ownership receipt |
| Skills | 导入、启用、停用、更新和刷新；保留旧内容以供回滚 |
| MCP | 配置更新、启停、重启、日志；签名 Node 服务包独立 generation 和回滚 |
| Python | 精简包按需安装；签名 feed；generation 切换、旧任务 snapshot lease 与 rollback |
| 环境变量 | 环境插件和 CLI；敏感值进入现有安全存储，列表只显示配置状态 |
| 资源分发 | plugin、skill、mcp、python catalog；Ed25519 验签、大小与 SHA-256 校验 |

DSH 固定包仍需要源码侧 `lib` 解析入口；401 个兼容链接将实际编译文件和增量缓存引向 `artifacts`，并非继续向源码目录写生成字节。`node_modules` 保留原位置，pnpm store 使用已有外部目录 `C:/Users/ccf/AppData/Local/pnpm/store/v11`。

本次保留所有历史 `.build`、`desktop/dist` 和旧版本产物。精确清理候选只有清单，`artifacts/verification/8.0.0/cleanup-review.json` 的 `deletionPerformed` 为 false，当前 build、复用链、回滚、缓存、依赖树和候选安装器均保留。

## 最终 Windows 安装包

```text
artifacts/packages/8.0.0/windows-x64/zerowall-science-8.0.0-win-x64.exe
```

| 项目 | 数值 |
| --- | --- |
| 大小 | 354,883,341 bytes，338.4 MiB |
| SHA-256 | `08a8b40ec2cb3c1a6852207f3fdbcf32a5d6304f4f622eed5fa84d323eb4be14` |
| win-unpacked 总文件大小 | 1,609,498,389 bytes，1534.9 MiB |
| 完整 Python archive | 未包含 |
| 隐式 Python 安装任务 | 未创建 |
| 更新元数据 | 版本、大小、SHA-256 与安装包一致 |
| Authenticode | `NotSigned` |

安装目录大小高于现有 1500 MiB 提示预算约 34.9 MiB，安装器小于 1024 MiB 提示预算。文件哈希和签名状态以 `artifacts/verification/8.0.0/installer-receipt.json` 为准。Electron Builder 的 signtool 日志不等于安装器已经签名。

包内未包含大型 Python 环境。首次启动和打开 Python 页面只检查信息；没有运行时的 feed 检查完成后返回 `idle`，安装按钮可用。打开再关闭安装确认框不会下载或生成任务。明确安装操作或需要 Python 的工具调用才进入准备环境流程。

## 插件与 catalog 验收

20 个 ZeroWall 插件均执行了原生 `pnpm pack`，检查 Host、Client、remote 与 manifest 的实际归档内容，并确认发布依赖中没有 `workspace:` 或 Git 源依赖。`prepack` 在 `artifacts/dev/publish/<包名>` 创建物理 staging，再通过 `publishConfig.directory` 打包。

原生打包收据：

```text
artifacts/verification/8.0.0/native-pack/55b6cffe-8a2f-4add-8f2b-b9e913dc2334/receipt.json
```

正式资源 staging 另有 27 个插件、组合及支持包 tarball。四类 catalog 分别包含 27 个 plugin/support、277 个 Skill、2 个 MCP 和 1 个 Python 资源条目，catalog/pointer 签名及所有 payload 哈希均已检查。结果为 `artifacts/verification/8.0.0/catalog-verification.json`。

真实隔离 DSH profile 已验证：安装 environment 0.1.0、升级 0.1.1、回滚；science 组合展开；缺失依赖后自动恢复；Skills 导入及热刷新；MCP 启停、重启和签名服务包升级回滚；环境变量脱敏。收据中的 Host 启动次数为 6：

```text
artifacts/verification/8.0.0/profiles/a6fc630c-a036-4a30-b5b7-b217691c73ad/receipt.json
```

catalog 当前使用本地开发密钥、`file:` 地址和 `localOnly=true`。桌面正式信任列表没有加入开发公钥。本地验签和 profile 测试不代表公开 feed 已可用，也不代表七牛资源已经上线。正式发布仍需要正式签名、HTTPS 地址和公开下载核验。

## 最终验证结果

| 检查 | 结果与证据 |
| --- | --- |
| DSH pin、profile、runtime closure、inventory | 通过；DSH 351 个包、291 个 runtime workspace 包、20 个 ZeroWall 插件 |
| 根类型检查及最终桌面类型检查 | 通过；`typecheck.log`、`compact-final-typecheck.log` |
| 最终完整 `pnpm test` | Vitest 844 passed / 10 skipped；Node 85 passed / 2 skipped；`verified-final-source-tests.log` |
| 原生插件独立打包 | 20 个通过；`native-pack-verification.log` |
| 隔离插件升级与回滚 | 通过；`profiles-acceptance.log` |
| `pnpm smoke:electron` | 12 passed / 2 skipped，原生插件管理通过；当前会话剪贴板权限被 Windows 拒绝（Win32 error 5）；`compact-final-electron-tests.log` |
| `pnpm verify:package`、`pnpm smoke:host` | 通过；Host、ASAR、包策略和中英文设置；`compact-final-package-verification.log`、`compact-final-host-smoke.log` |
| 包内 dsh/zws 与管理功能 | 通过；`compact-final-packaged-commands.log` 和 commands 收据 |
| 精简 Python 页面 | 通过；1440、1920、760 三种窗口尺寸无横向溢出；打开/关闭安装确认框，无 jobs、无 Python executable |
| `pnpm release:verify-local`、`pnpm version:check --artifacts` | 通过；`compact-final-release-check.log`、`compact-final-version-artifacts.log` |
| 包内启动事务恢复 | 四种中断位置均恢复旧 profile，Host ready；`compact-final-profile-recovery.log` |
| 真实 Python 包操作与源码构建 | 4 passed / 0 skipped；`python-real-integration-verified.log`、`artifacts/verification/8.0.0/python-real-tests/verified-final/` |
| 包内按需 Python 安装与重启 | 通过；签名、archive SHA-256、科学库导入、相同 snapshot、current 指针不变且不新增安装任务；`complete-final-python-on-demand.log` |
| 包及独立资源 manifest | 已生成；packages 与 release 各有 `artifact-manifest.json` |

日志均位于 `artifacts/logs/8.0.0/`。最终测试汇总为 `artifacts/verification/8.0.0/final-test-summary.json`；Python 页面收据和截图为 `artifacts/verification/8.0.0/python-ui/compact-final/`；包内命令收据为 `artifacts/verification/8.0.0/commands/0e4254fa-61a6-4660-88ec-517dcfd044bf/receipt.json`。

默认源码测试仍有条件 skips，包括离线 bootstrap、私有历史或科学样本。真实 Python snapshot、源码构建和包操作另行启用并验证，三个 spec 共 4 passed / 0 skipped；其中真实安装、卸载、重放、健康失败保留、回滚和签名源码允许/拒绝均通过。源环境的 flowio origin/version/content SHA-256 与解释器 `._pth` 前后相同。最新包的剪贴板两项因会话权限无法执行，不能算作通过；上一候选包曾完成 14 passed / 0 skipped。实际远程 R 服务和用户科研数据分析流程未在此次验收中完整运行。


包内 `zws python install` 在隔离 profile 中请求 durable task，使用现有完整缓存 archive 作为 resume seed（983,689,995 bytes），再次验签公开 feed 并核对 SHA-256，实际解压、规范化和激活新 generation。安装前 idle 且无 jobs；安装后 Python 3.12.10、numpy 2.5.3、pandas 3.0.5、scipy 1.18.1、anndata 0.13.3.post0、scanpy 1.12.4 与 flowio 1.4.0 均真实导入成功。关闭并重新启动同一 profile 后恢复 ready，snapshot 和 current.json 字节保持一致，没有新增安装任务，包库存可读取。该验收没有对科学数据集执行分析，也没有操作用户现有 Python。

完整收据：`artifacts/verification/8.0.0/python-on-demand/2edcafd4-687c-40c2-8ff7-7830a12c360d/receipt.json`。验收脚本等待 Desktop 延迟的本地检查完成，不把工作台刚显示时服务的初始 idle 当成重启失败；库存扫描会发布不含远程检查时间戳的 local status，因此重启使用已验证的活动 snapshot 和 Python ready 状态作断言。

NSIS 的 PATH ownership 行为在隔离 registry key 中验证过，保留外部命令和既有 PATH，移除时只删除本程序所有的项。本次启动的是安装包对应的 `win-unpacked` 应用，没有覆盖用户当前安装，也没有运行安装器对真实用户 PATH 作变更。

## 使用与后续发布入口

`dsh --version` 返回 `0.2.0-rc.2`，`zws --version` 返回 `8.0.0`。`zws` 管理操作通过正在运行的 Desktop 的本地认证接口调用现有服务；应先启动 Desktop。`--user-data` 可指定另一个正在运行的 profile。`zws env set <name>` 从标准输入接收值，避免敏感值进入命令历史。

日常独立打包和验证：

```powershell
pnpm --filter @zerowallscience/plugin-ai-cloud pack --pack-destination C:/path/to/artifacts
pnpm plugins:verify-pack
pnpm plugins:pack
pnpm catalogs:generate
```

完整新构建仍用 `pnpm package:stable:win`，每次创建独立 build ID。后续插件源码可迁移到 `ccfwwm/zerowall-dsh-plugins` 总仓库，各插件独立 semver。本次未创建、推送或发布该仓库。

公开发布前尚需配置 Windows 签名证书，以及正式资源 catalog 的 Ed25519 私钥、key ID、HTTPS base URL；验证实际公网资源与失败恢复，再按七牛优先的发布流程处理。当前安装包和所有本地资源保留供用户评审。
