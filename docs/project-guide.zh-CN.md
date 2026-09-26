# ZeroWall Science 项目开发与发布指南

本文是当前仓库的开发、构建和发布入口。源码和脚本是事实来源；旧版本验收记录、一次性审计结果和本地构建目录不属于项目源代码。

## 1. 项目边界

ZeroWall Science 是 Windows 优先的 Electron 科研工作台：Electron 主进程负责窗口、更新、凭据和 Host 生命周期；React/TypeScript 插件提供科研工作台能力；`deepseek-harness` 提供 Agent、会话、工具、Skills、MCP 和 React 外壳运行时；Research Store 保存科研数据、审计和可复核产物。

核心原则是：模型只能提出操作请求，Host 负责权限和执行，Research Store 保存事实，用户做最终科研判断。

## 2. 目录职责

| 目录 | 内容 | 是否提交 |
| --- | --- | --- |
| `desktop/` | Electron 主进程、preload、更新和安装包配置 | 是 |
| `plugins/` | ZeroWall 一方产品插件 | 是 |
| `packages/` | 可复用的 DSH、Office 和科研包 | 是 |
| `store/` | SQLite Research Store、迁移、审计和快照 | 是 |
| `deepseek-harness/` | 固定的 DSH fork 子模块 | 通过 gitlink 提交 |
| `resources/` | Skills、Python 依赖清单、科学资源和许可证 | 是 |
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

Python 由软件使用一个共享环境。项目不为 profile 创建独立 Python 环境；依赖版本以 `resources/python/requirements-*.lock`、`resources/python/dependency-manifest.json` 和 `resources/python/skill-dependencies.json` 为准。

常用命令：

```powershell
pnpm dev
pnpm typecheck
pnpm test
pnpm test:security
pnpm plugins:typecheck
pnpm dsh:verify
```

## 4. DSH 子模块提交控制

父仓库只保存 `deepseek-harness` 的 gitlink，不能把子模块内部文件当作父仓库源码提交。当前 ZeroWall fork 使用远端 `https://github.com/ccfwwm/deepseek-harness.git`、分支 `codex/biomni-model-routing`、固定 commit `75e2d12fc666eb16225cd3a21195a0f056ce8a50`，上游基线为 `dsh-v0.1.5-rc.2`。

修改 DSH：

```powershell
git -C deepseek-harness status --short --branch
git -C deepseek-harness switch codex/biomni-model-routing
# 修改后只添加明确文件
git -C deepseek-harness add path/to/changed-file
git -C deepseek-harness commit -m "fix: describe the DSH change"
git -C deepseek-harness push zerowall HEAD:codex/biomni-model-routing
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

构建前检查工作区，构建后不要把 `desktop/dist/`、`desktop/out/` 或临时验证目录加入 Git。发布前记录安装包大小和 SHA-256。

## 6. 版本管理

版本号至少同步根 `package.json`、`desktop/package.json`、相关插件 manifest、发布说明和更新 metadata。修改版本后运行：

```powershell
pnpm profiles:check
pnpm dsh:verify
pnpm release:metadata
```

当前版本说明放在 `docs/release-notes-<version>.md`。历史版本只保留在 GitHub Release，不在工作树累积一次性验收文档。

## 7. 七牛云与 GitHub 发布

正式发布必须先七牛云、后 GitHub。凭据只放在未跟踪的 `scripts/.env.qiniu`，不能打印、提交或写入日志。

```powershell
pnpm release:metadata
pnpm release:publish:stable
pnpm release:verify:stable
```

七牛云验证必须检查公开 HTTP 状态、大小和 SHA-256，并完整下载 Windows 安装包与本地包逐字节比较。重复覆盖同一版本时使用 `ZEROWALL_QINIU_OVERWRITE=1`，完成后仍要重新执行公网校验。

七牛云通过后：

```powershell
git status --short --branch
git push origin main
git tag v<version>
git push origin v<version>
gh release create v<version> `
  desktop/dist/zerowall-science-<version>-win-x64.exe `
  desktop/dist/zerowall-science-<version>-win-x64.exe.blockmap `
  desktop/dist/zerowall-science-<version>-latest.json `
  desktop/dist/latest.yml `
  --title "ZeroWall Science <version>" `
  --notes-file docs/release-notes-<version>.md
gh release view v<version> --json tagName,isDraft,isPrerelease,assets,url
```

GitHub 验证要确认 tag 指向发布 commit、Release 不是 draft/prerelease，资产状态为 `uploaded`，服务端摘要与本地摘要一致，并尽可能完整下载安装包复核。

## 8. 清理规则

可以安全删除并重新生成的目录包括 `node_modules/`、`deepseek-harness/node_modules/`、`desktop/dist/`、`desktop/out/`、`.tmp*/` 和 `test-results/`。删除后使用 `pnpm install --frozen-lockfile` 和对应构建命令恢复。`desktop/build/` 是源码，不要删除。

不要清理 `.env`、`scripts/.env.qiniu`、`.zerowall/`、用户科研数据、签名证书或未确认的外部挂载目录。发布前使用 `git status --short --untracked-files=all`，确保临时产物没有混入提交。
