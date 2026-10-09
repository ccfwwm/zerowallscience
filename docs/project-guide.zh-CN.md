# ZeroWall Science 项目开发与发布指南

本文保留项目级目录、开发环境和通用构建说明。当前 Codex 的执行合同、DSH 固定版本、插件更新事务和 8.0.9 完整离线默认功能和发布边界以 [Codex 开发指导](codex-development-guide.zh-CN.md) 为准。源码和脚本是事实来源；旧版本验收记录、一次性审计结果和本地构建目录不属于项目源代码。

## 1. 项目边界

ZeroWall Science 是 Windows 优先的 Electron 科研工作台：Electron 主进程负责窗口、更新、凭据和 Host 生命周期；React/TypeScript 插件提供科研工作台能力；`deepseek-harness` 提供 Agent、会话、工具、Skills、MCP 和 React 外壳运行时；Research Store 保存科研数据、审计和可复核产物。

核心原则是：模型只能提出操作请求，Host 负责权限和执行，Research Store 保存事实，用户做最终科研判断。

## 2. 目录职责

| 目录 | 内容 | 是否提交 |
| --- | --- | --- |
| `desktop/` | Electron 主进程、preload、更新和安装包配置 | 是 |
| `plugins/` | ZeroWall 一方产品插件 | 是 |
| `packages/` | 按 `dsh/`、`support/`、`bundles/` 分组的适配器、支持库和组合声明；旧路径只读兼容 | 是 |
| `store/` | SQLite Research Store、迁移、审计和快照 | 是 |
| `deepseek-harness/` | 固定的 DSH fork 子模块 | 通过 gitlink 提交 |
| `resources/` | `extensions/` 下的 Skills、MCP、Python、运行时与引擎，另有 cases、branding、provenance | 是 |
| `profiles/`、`config/` | 配置生成和 DSH 固定版本声明 | 是 |
| `tools/`、`scripts/` | 生成、检查、构建和发布自动化 | 是 |
| `tests/` | 契约、安全、集成和发布测试 | 是 |
| `docs/` | 当前架构、运行时和发布说明 | 是 |

不应提交的本地生成物包括：`node_modules/`、`deepseek-harness/node_modules/`、`desktop/dist/`、`desktop/out/`、`runtime/`、`.tmp*/`、`test-results/`、`.upstream/`、`*.tsbuildinfo`、审计 JSON 和发布日志。`desktop/build/` 是已提交的打包配置和安装器模板，必须保留。

## 3. 开发环境

当前基线：Node.js `24.9.0`、pnpm `11.7.0`、Windows x64。

```powershell
git clone --recurse-submodules https://github.com/ccfwwm/zerowallscience.git
Set-Location zerowallscience
git submodule update --init --recursive
pnpm install --frozen-lockfile
```

Python 由软件使用一个共享环境。项目不为 profile 创建独立 Python 环境；依赖版本以 `resources/extensions/python/requirements-*.lock`、`resources/extensions/python/dependency-manifest.json` 和 `resources/extensions/python/skill-dependencies.json` 为准。

默认直接在当前 `main` checkout 开发，保留用户已有未提交文件；除非用户明确要求隔离，不创建 worktree。常用命令：

```powershell
pnpm dev
pnpm typecheck
pnpm test
pnpm test:security
pnpm plugins:typecheck
pnpm dsh:verify
```

## 4. DSH 子模块提交控制

父仓库只保存 `deepseek-harness` 的 gitlink，不能把子模块内部文件当作父仓库源码提交。当前 ZeroWall fork 使用远端 `https://github.com/ccfwwm/deepseek-harness.git`、分支 `zerowall/reviewer-history-opaque`、固定 commit `86b6740d0e671cee0b3fd0168de484c0efbf46ea`，版本合同为 `dsh-v0.2.0-rc.2`。

修改 DSH：

```powershell
git -C deepseek-harness status --short --branch
git -C deepseek-harness switch zerowall/reviewer-history-opaque
# 修改后只添加明确文件
git -C deepseek-harness add path/to/changed-file
git -C deepseek-harness commit -m "fix: describe the DSH change"
git -C deepseek-harness push zerowall HEAD:zerowall/reviewer-history-opaque
# 更新父仓库 gitlink 和固定声明
git -C deepseek-harness rev-parse HEAD
# 将同一个 commit 写入 config/deepseek-harness/upstream.json
pnpm dsh:verify
git add deepseek-harness config/deepseek-harness/upstream.json
git commit -m "chore(dsh): pin updated harness commit"
```

提交父仓库前，`config/deepseek-harness/upstream.json` 的 `repository`、`branch` 和 `commit` 必须与子模块当前 HEAD 一致。

## 5. 构建与验证

```powershell
# 解包目录和运行时验证
pnpm package:dir
# Windows x64 Stable 安装包和更新 metadata
pnpm package:stable:win
pnpm release:metadata
# 包、Host、Skills 和更新检查
pnpm verify:package
pnpm smoke:host
pnpm smoke:update
```

构建前检查工作区，构建后不要把 `desktop/dist/`、`desktop/out/` 或临时验证目录加入 Git。正式输出位于 `artifacts/packages/<version>/<target>/`，发布前记录安装包大小、SHA-256、build ID 和 artifact manifest。

## 6. 版本管理

版本号至少同步根 `package.json`、`desktop/package.json`、相关插件 manifest、发布说明和更新 metadata。修改版本后运行：

```powershell
pnpm profiles:check
pnpm dsh:verify
pnpm release:metadata
```

当前版本说明放在 `docs/release-notes-<version>.md`。历史版本只保留发布说明和必要的公开收据，不在工作树累积一次性验收目录；Windows 安装器、stage、临时验证和日志应在发布校验后按精确版本路径清理。

## 7. 七牛云与 GitHub 发布

正式发布必须先七牛云、后 GitHub。七牛凭据和运行时签名私钥只放在 Git 忽略的 `scripts/env/`，不能打印、提交或写入日志。

```powershell
pnpm release:metadata
pnpm release:publish:stable
pnpm release:verify:stable
```

七牛云验证必须检查公开 HTTP 状态、大小和 SHA-256，并完整下载 Windows 安装包与本地包比对。版本资产不可变，已存在的对象只有大小与 SHA-256 一致时才可复用；不同字节必须使用新版本。`release:publish:stable` 先完成 stage 的公网校验，再 promote 更新指针；`release:verify:stable` 重新下载并校验全部资产和指针。凭据继续从 `scripts/env/` 或 `ZEROWALL_QINIU_ENV_FILE` 读取；不因取消 worktree 流程而移动或提交凭据。

七牛云通过后：

```powershell
git status --short --branch
git push origin main
git tag v<version>
git push origin v<version>
gh release create v<version> `
  artifacts/packages/<version>/windows-x64/zerowall-science-<version>-win-x64.exe `
  artifacts/packages/<version>/windows-x64/zerowall-science-<version>-win-x64.exe.blockmap `
  artifacts/packages/<version>/windows-x64/zerowall-science-<version>-latest.json `
  artifacts/packages/<version>/windows-x64/latest.yml `
  --title "ZeroWall Science <version>" `
  --notes-file docs/release-notes-<version>.md
gh release view v<version> --json tagName,isDraft,isPrerelease,assets,url
```

GitHub 验证要确认 tag 指向发布 commit、Release 不是 draft/prerelease，资产状态为 `uploaded`，服务端摘要与本地摘要一致，并尽可能完整下载安装包复核。

## 8. 清理规则

不要把 `node_modules/`、pnpm store、`deepseek-harness/` 或 `desktop/build/` 当成一般缓存清理；项目级清理合同要求保留它们。`desktop/dist/`、`desktop/out/`、`.tmp*/` 和 `test-results/` 只有在确认是当前工作区拥有的生成物、没有正在运行的任务且不含待保留数据后，才可按精确路径单独清理。正式 artifacts 清理先运行 `pnpm artifacts:gc --dry-run`，核对候选与保护项后再按项目合同处理。

不要清理 `.env`、`scripts/env/`、`.zerowall/`、用户科研数据、签名证书或未确认的外部挂载目录。发布前使用 `git status --short --untracked-files=all`，确保临时产物没有混入提交。

## 8.0.9 增量构建与清理

修改单个插件、Skill、MCP 或 Python 层时使用对应的 `plugin:*` 或 `resource:*` 命令，不触发完整 Electron 构建。正式产物只写入 `artifacts/`，构建收据和锁保证并发安全。清理前先运行 `pnpm artifacts:gc --dry-run`；受保护目录、当前 stage、回滚 generation、发布收据、用户数据和 `%SystemDrive%` 异常目录不会由 GC 处理。

## 8.0.9 完整离线 profile

Core ASAR 与完整功能的离线默认 profile 分开构建。`pnpm build` 依次准备 Core、`offline-profile/modules`、默认 Skills/MCP、独立 tarball、catalog 和签名 receipt；普通 JS/JSON 资源收敛到 `profile-runtime.asar`，需要物理路径的 Office worker 和原生库按规则展开。`pnpm package:stable:win` 消费已验证 stage，使用新 build ID 重新绑定签名。正式 build 使用内容指纹和输出哈希任务图，普通插件后续可独立构建、打包和上传，无需同步提升桌面版本。

扩展资源列表和远端检测严格分离：`resources.list`、`pythonLayers.listLocal` 只读本地；点击检查更新才调用 `check`。桌面版本通过 ZeroWall 的 DSH 构建 wrapper 注入 `DSH_CLIENT_VERSION`；CLI `dsh --version` 继续显示独立 DSH 核心版本。
