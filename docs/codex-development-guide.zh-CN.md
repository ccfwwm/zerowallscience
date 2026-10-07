# ZeroWall Science Codex 开发指导

本文是后续 Codex 参与 ZeroWall Science 开发、修复、构建和发布时的操作合同。它描述当前仓库的真实边界和可复用流程。源码、配置和自动化脚本仍然是最终事实来源；当本文与代码不一致时，应先检查代码和生成器，再修正文档。

## 1. 当前基线

本文编写时的可验证基线：

| 项目 | 值 |
| --- | --- |
| 应用版本 | `8.0.6` |
| 当前开发分支 | `main` |
| 8.0.6 发布提交 | 以安装包 `artifact-manifest.json` 中的 `commit` 为准 |
| DSH 子模块 | `86b6740d0e671cee0b3fd0168de484c0efbf46ea` |
| DSH 分支 | `zerowall/reviewer-history-opaque` |
| DSH 标签 | `dsh-v0.2.0-rc.2` |
| GitHub | `https://github.com/ccfwwm/zerowallscience` |
| 8.0.6 Stable 安装包 | `artifacts/packages/8.0.6/windows-x64/` |
| 8.0.6 发布状态 | 以 `artifacts/release/8.0.6/publication/` 收据、七牛公开校验和 GitHub `v8.0.6` Release 为准 |

8.0.4 和 8.0.5 的历史安装包继续保留；8.0.6 使用新的不可变路径。插件、Skills、MCP 和 Python 资源属于独立发布面；如果同一资源 ID 和版本在七牛已有不同字节，必须停止发布并递增该资源版本，不能覆盖或伪造哈希。资源签名保留 `stable-3` 验签兼容，并由 `stable-4` 为新发布的目录和依赖清单签名；私钥只保存在被 Git 忽略的 `scripts/env/`，严禁进入源码仓库或插件总仓库。

用户指定的模型、推理强度、生图模型、协议和参数必须保持不变。开发任务不因为测试方便而自动切换模型、降低推理级别或增加替代路由。

## 2. Codex 的工作方式

### 2.1 先确认工作区和目标

每次开始工作先执行：

```powershell
git status --short --branch
git branch --show-current
git rev-parse HEAD
git submodule status
Get-Content config/deepseek-harness/upstream.json
```

记录当前分支、父仓库 HEAD、DSH 子模块 HEAD 和工作区状态。用户没有要求切换分支时，继续当前分支；涉及大范围架构、版本升级或打包时，优先从目标基线创建独立 worktree。新 worktree 必须通过 Codex worktree 工具创建，不能手工复制目录。

主目录有未提交修改时，逐项识别归属并保留。禁止使用 `reset --hard`、广泛 `git clean`、删除整个工作区或覆盖用户配置来“恢复干净”。任何清理都必须先列出精确路径、确认该路径属于生成物，再按 allowlist 删除。

### 2.2 先读规则和事实来源

在修改代码前检查：

- `README.zh-CN.md` 和本文。
- `package.json`、`pnpm-workspace.yaml`、`pnpm-lock.yaml`。
- `config/deepseek-harness/upstream.json`、`config/integrations/upstream-sources.json`。
- 受影响插件的 `package.json`、`src/`、测试和生成器。
- `tools/build/paths.cjs`、`tools/build/paths.mjs`。
- `tools/plugins/`、`tools/release/`、`tools/packaging/` 中对应脚本。
- 相关历史版本说明和验收收据，只用于理解事实，不作为当前配置的替代品。

修改生成文件时必须找到生成器并修生成器。下次运行生成器会覆盖的文件不能只做手工补丁。

### 2.3 以证据结束工作

最终报告必须说明实际执行的命令、通过或失败的结果、产物路径、提交和哈希。不能用“已启动”“已生成”“测试数量增加”代替端到端证据。失败、跳过、未验证和依赖外部服务的部分要单独写明。

## 3. 仓库结构和目录边界

| 目录 | 职责 | 处理规则 |
| --- | --- | --- |
| `desktop/` | Electron 主进程、preload、Host 生命周期、凭据、更新和安装器 | 桌面核心改动需要完整类型检查和 Electron/Host 验收 |
| `plugins/` | ZeroWall 一方领域插件源码 | 每个插件保持独立 manifest、Host/Client/remote 边界和版本 |
| `packages/` | DSH 适配、第三方集成、组合 bundle 和支持包 | 先确认是否被 workspace、profile 或 runtime closure 使用 |
| `store/` | SQLite Research Store、迁移、审计、快照 | 数据结构变更必须有迁移和契约测试 |
| `deepseek-harness/` | 固定 DSH fork 子模块 | 父仓库只提交 gitlink；子模块改动按专门流程处理 |
| `resources/` | Skills、Python 清单、品牌和小型运行时资源 | 大型 Python 环境不放入默认安装包 |
| `profiles/`、`config/` | profile 生成、上游锁定、catalog、公钥和版本表 | 生成结果变化要检查来源和用户选择迁移 |
| `tools/` | 构建、打包、命令、catalog、验收和安全自动化 | 修改行为时同步更新对应测试和文档 |
| `scripts/` | 发布和外部服务入口 | 凭据只从忽略文件读取，不能打印值 |
| `tests/` | 契约、安全、更新、集成、打包和 E2E 测试 | 先运行受影响测试，再扩大到完整门禁 |
| `docs/` | 架构、开发、更新、版本和验收记录 | 新版本说明记录真实发布状态 |

正式产物统一使用根目录 `artifacts/`：

```text
artifacts/
├── cache/                 # pnpm、Electron、DSH、Python、开发签名缓存
├── dev/                   # 插件和包的开发编译输出
├── stage/<version>/<id>/  # 当前构建的 staging 和 runtime closure
├── packages/<version>/<target>/
├── verification/<version>/
├── release/<version>/     # tarball、Skills、MCP、Python、catalog 和收据
└── logs/<version>/
```

`desktop/dist/`、`desktop/out/`、根 `.build/`、源码目录下的 `lib/` 和各插件临时目录不是正式输出目录。它们可作为兼容链接或历史生成物存在，但新正式构建必须由 `tools/build/paths.*` 指向 `artifacts/`。`node_modules/`、pnpm store、用户数据、忽略的签名文件和现有缓存不要移动或删除。

## 4. DSH 子模块合同

父仓库当前使用 ZeroWall DSH fork `86b6740d0e671cee0b3fd0168de484c0efbf46ea`，仍属于 `dsh-v0.2.0-rc.2` 版本线。`config/deepseek-harness/upstream.json` 必须与子模块 HEAD、仓库、分支和标签一致。执行 `pnpm dsh:verify` 之前不要声称 DSH 已锁定。

检查：

```powershell
git -C deepseek-harness status --short --branch
git -C deepseek-harness rev-parse HEAD
pnpm dsh:inventory
pnpm dsh:verify
```

需要修改 DSH 时：

1. 先确认改动确实属于官方运行时或 DSH API，ZeroWall 领域能力优先放入独立插件。
2. 在子模块自己的分支中只修改明确文件，运行子模块测试。
3. 在子模块提交并推送到已授权的 fork；记录 commit、上游基线和变更原因。
4. 父仓库更新 gitlink 和 `config/deepseek-harness/upstream.json`。
5. 运行 `pnpm dsh:verify`、模块图检查和完整受影响测试。

不要把子模块内部文件直接当作父仓库文件提交，也不要为了修复插件而随意升级 DSH。DSH 精确兼容范围目前仍是 `0.2.0-rc.2`。

## 5. 插件开发合同

ZeroWall 的领域功能通过 DSH 插件分发。插件必须具备：

- 独立 semver，不把桌面版本复制到插件版本。
- 明确 `dsh`、`zerowall`、Desktop 兼容范围、capabilities、permissions、restartRequired 和 rollbackSupported。
- Host、Client、remote 和 manifest 的明确入口。
- 发布依赖中不出现 `workspace:`、Git 源、开发依赖或本地路径。
- DSH 包使用 peer dependency；插件私有依赖由自己的 bundle 负责。
- 可独立 `pnpm pack`，并能安装到隔离 profile。
- 更新前进入 candidate profile，健康检查成功后再原子切换。

主要领域插件位于 `plugins/<name>/`，组合包 `@zerowallscience/dsh-bundle-science` 只声明组合和依赖，不重新聚合全部领域代码。`plugin-base` 保留公共服务和 UI，不恢复静态导入全部科研插件。动态 remote contribution 必须由实际安装包注册。

开发插件时使用：

```powershell
pnpm plugins:generate
pnpm plugins:bundle
pnpm plugins:typecheck
pnpm plugins:test
pnpm plugins:verify-pack
pnpm plugins:pack
```

如果只改一个插件，优先使用对应 filter 的 typecheck、test 和 pack；涉及生成器、共享服务、profile 或 runtime closure 时运行完整插件门禁。生成的 bundle 和真实 tarball 必须检查 Host、Client、remote、许可证和资源文件是否齐全。

同一插件 ID 和版本已经公开过时，字节必须保持不变。代码、依赖、资源、生成内容或 manifest 发生实质变化时递增插件版本；桌面版本变化本身不要求所有插件递增。

## 6. 扩展中心、Skills、MCP 和 Python

扩展中心位于独立插件 `@zerowallscience/plugin-extension-center`，入口放在设置中。它统一展示插件、Skills、MCP、Python 和环境资源的状态，但领域详细配置仍由 `plugin-skills`、`plugin-mcp`、`plugin-python` 等负责。不要把扩展中心重新注册成侧边栏页面，也不要在扩展中心复制领域服务。

资源管理通过 Host 的受认证 endpoint 和 `tools/commands/resource-manager.mjs` 完成。核心状态包括：

- 签名 catalog、资源版本、Desktop/DSH 兼容范围、平台和架构。
- 下载、验签、解包、依赖准备、健康检查、切换和回滚阶段。
- 独立 generation、任务 journal、旧版本、失败原因和重试次数。
- 插件按 profile 原子切换；Skills 支持运行中刷新；MCP 配置支持热刷新，Server 支持启停和重启；Python 使用 generation 与 `current.json`。

启动检查和每日检查只读取、验签并显示可用版本，不自动下载、安装或重启。用户必须明确通过设置或 `zws` 触发变更。更新失败时保留旧版本继续运行，不能删除用户自定义 Skill、MCP 配置、账户、模型、项目或第三方插件。

### Python 分层合同（8.0.6）

- 运行时根目录固定为 `%LOCALAPPDATA%\\ZeroWall Science\\Python`；旧 Roaming 或安装目录中的 Python 指针不再作为默认目标，也不会被复制或删除。
- `bootstrap` 只表示解释器是否存在，`core` 表示 ZeroWall/MCP 最小依赖，`science` 表示科研依赖，`capability` 表示某个 Skill 或流程的可选依赖。解释器就绪不等于科研层已安装。
- 默认启动顺序是：按需联网安装轻量 Python + pip bootstrap；bootstrap 就绪后，后台检查并自动安装签名核心清单中的 42 个基础依赖。核心任务必须异步运行，不阻塞桌面界面。
- 新桌面版本使用固定版本的 Python bootstrap manifest；首次安装只接受 `python.bootstrapOnly=true` 的清单。发布的运行时 ZIP 只含 CPython 3.12.10 与 pip，拒绝旧的 387 包科研环境清单，避免新用户误下载近 1 GB 的完整环境。bootstrap 资源使用独立的版本目录；验证阶段只上传不可变对象，不更新 `latest.json`。
- 核心任务写入持久 task receipt，持续记录阶段、包计数、当前包、实时 pip 日志和错误。设置页轮询本地快照，不重复扫描完整 site-packages；关闭或重启后恢复最近任务状态，并在安全条件下续接自动核心同步。
- 科研层和 capability 层不随启动自动安装。用户明确选择“安装科研层”或某个能力层后，才预检、下载并进行 generation 切换；启动检查不得下载这些大型资源。
- `core-dependency-manifest.json` 与 `dependency-manifest.json` 独立签名；同步计划必须绑定所选层和 manifest hash，资源不可用时不创建安装任务。
- Python 状态、路径和错误必须从 Host 返回的稳定字段读取，不能从旧 snapshot 的物理路径推导 UI 路径。

### RMCP 工具发现合同（8.0.6）

- RMCP 在桌面启动完成后后台连接，不阻塞桌面启动。缺少 `R_PLATFORM_MCP_AUTHORIZATION` 时状态是 `waiting-for-credentials`，不能显示成普通“0 个工具”。
- 工具发现阶段使用 `discovering-tools`；`tools/list` 成功且返回空数组时才使用 `active-with-zero-tools`。这与连接失败、凭据缺失和发现超时严格区分。
- 每次重连或 managed generation 切换前清理旧工具索引，再注册 `mcp__rmcp__*`；DTO 必须带发现状态、时间、最近成功数量和脱敏错误。
- RMCP fake-server 测试至少覆盖多工具、零工具、缺凭据、`tools/list` 失败、重连集合变化和重复注册。

### 历史会话兼容合同

- DSH fork 只为已知 `zerowall/reviewer/report` 注册 opaque v0 迁移处理：验证 envelope，原样保留 payload、序号和时间，不解释业务字段。
- 原始 `session.jsonl` 永不修改；迁移写入新的版本化副本。其他未知 required 事件继续拒绝，不能把迁移放宽成忽略所有未知事件。

常用命令：

```powershell
zws help
zws version
zws doctor
zws extensions status
zws plugin list
zws plugin check
zws plugin update <id>
zws plugin rollback <id>
zws skill list
zws skill import <directory>
zws skill update <id>
zws skill rollback <id>
zws mcp list
zws mcp check
zws mcp update <id>
zws mcp restart <connection-id>
zws env list
zws python status
```

`zws env set <name>` 的敏感值通过 stdin 输入；命令、界面和日志只显示是否已配置，不输出密钥。`dsh` 保持官方命令语义。命令安装使用 owner receipt，保留已有 PATH 和外部 `dsh`；卸载时只删除本程序拥有的 PATH 项。

## 7. 版本和兼容性

桌面版本、插件版本、Skills 版本、MCP Server 版本、Python generation 和提示词版本相互独立：

- Desktop：根 `package.json`、`desktop/package.json`、构建 receipt、Windows metadata 和 release notes 一致。
- 插件：manifest 自己的 semver 和 Desktop/DSH 范围。
- Skills：确定性 tarball 和资源版本表。
- MCP：配置模板版本与可执行 Server 包版本分开管理。
- Python：环境版本、依赖清单版本和 generation 分开管理。
- 提示词：保留领域语义版本，例如 `7.5.0-file-visual.1`，不机械替换成桌面版本。

版本变更后至少运行：

```powershell
pnpm version:check
pnpm profiles:check
pnpm dsh:verify
pnpm release:metadata
```

升级必须保留 7.5.0、8.0.0、8.0.1、8.0.2 等历史 profile 的账户、模型、项目、Skills、MCP、环境变量和插件选择。迁移脚本只处理明确退休的标识，例如旧 `dsh-auto-review`；官方 DSH Auto Review 继续保留。`packages/dsh-capability-menu` 已退休，不能重新进入 runtime closure、profile 或安装包。

## 8. 构建流程

### 8.1 源码和合同检查

```powershell
git status --short --branch
pnpm dsh:inventory
pnpm dsh:verify
pnpm profiles:check
pnpm dsh:runtime:closure
pnpm version:check
```

### 8.2 类型、安全和功能测试

```powershell
pnpm typecheck
pnpm plugins:typecheck
pnpm plugins:test
pnpm test:security
pnpm test:updates
pnpm audit:runtime
```

修改桌面、Host、资源管理或更新事务后，还要运行：

```powershell
pnpm verify:package
pnpm smoke:host
pnpm smoke:electron
pnpm smoke:update
```

### 8.3 Windows 打包

用户已经明确“不要重新构建”或已有经过验证的安装包时，先校验现有包的版本、大小、SHA-256 和构建 receipt，不得为了形式重新打包。需要重新打包时：

```powershell
pnpm package:stable:win
pnpm release:metadata
pnpm verify:package
pnpm smoke:host
pnpm smoke:electron
```

最终 Windows x64 安装包必须位于：

```text
artifacts/packages/<version>/windows-x64/zerowall-science-<version>-win-x64.exe
```

验收要确认新 build ID、安装包 SHA-256、ASAR/runtime closure、`dsh --version`、`zws --version`、旧插件清理、Office/文件预览资源和升级 profile 行为。不能只依据安装器退出码。

## 9. 七牛云和 GitHub 发布

发布是外部可见操作。只有用户明确要求发布，或用户已授权的发布流程正在执行时，才上传七牛或创建 GitHub Release。用户要求“先验证再发布”时，先完成本地安装、隔离 profile、资源安装/升级/回滚和公开下载检查，等待明确认可。

凭据只从以下忽略文件读取，永远不打印值：

```text
scripts/env/.env.qiniu
scripts/env/runtime-private.pem
```

桌面发布顺序：

1. `pnpm release:metadata`。
2. `pnpm release:publish:stable` 上传七牛 Stable。
3. `pnpm release:verify:stable` 检查 HTTP、大小、SHA-256 和版本。
4. `git push origin <branch>`。
5. 创建并推送 `v<version>` 标签。
6. 创建 GitHub Release，上传安装包、blockmap、`latest.yml` 和 JSON metadata。
7. 从 GitHub 下载安装包，重新计算 SHA-256。
8. 检查工作区和远程 HEAD。

当前桌面发布脚本只发布桌面安装包和更新 metadata：

```powershell
pnpm release:publish:stable
pnpm release:verify:stable
```

独立资源使用：

```powershell
# 正式 Ed25519 密钥和 HTTPS base URL 必须已配置
node tools/release/generate-resource-catalogs.mjs
node scripts/publish-resources.mjs stage
# 隔离 profile、签名、哈希和回滚全部通过后，才允许：
node scripts/publish-resources.mjs promote
node scripts/publish-resources.mjs verify
```

`stage` 验证所有不可变对象；`promote` 只更新资源 catalog 指针，不更新桌面 `latest.yml`。遇到 `Public size or SHA-256 differs`、签名不可信、同版本对象冲突或 catalog 仍为 `localOnly` 时立即停止。先比较本地和远端事实，再递增资源 semver、重新生成正式 catalog，并重新执行隔离安装验收。

GitHub Release 的 tag 必须指向实际发布提交，Release 必须为非 draft、非 prerelease，资产状态为 `uploaded`。GitHub 与七牛使用相同资源字节和 manifest；GitHub 发布成功不能替代七牛公开下载校验。

## 10. 安全和隐私

- 不读取、打印、提交或写入报告的密钥值、token、私钥、Cookie 和凭据文件内容。
- 对环境变量做存在性检查时只输出 `SET/UNSET`。
- 用户数据目录、账户、模型配置、项目数据库、MCP 凭据和自定义 Skills 默认保留。
- 所有文件路径操作必须做 containment 检查；资源解包拒绝绝对路径、路径穿越、链接和特殊文件。
- Renderer 只通过 preload/Host 使用特权能力；不要把文件系统、命令执行或凭据直接暴露给页面。
- 更新日志、错误和 CLI 输出必须脱敏。
- 不以测试方便为理由禁用签名、放宽兼容范围或加入开发公钥到正式安装包。

## 11. 清理规则

可以在确认没有正在运行的构建、测试或安装任务后清理的生成物：

```text
artifacts/              # 仅清理明确版本和 build ID
desktop/dist/
desktop/out/
.build/
test-results/
playwright-report/
*.tsbuildinfo
```

清理前执行：

```powershell
git status --short --untracked-files=all
Get-ChildItem artifacts -Recurse -File | Select-Object FullName,Length
```

不要删除：`desktop/build/`、`deepseek-harness/`、`node_modules/`、`scripts/env/`、`.zerowall/`、用户数据、签名文件、未确认的缓存和外部挂载目录。已发布版本、旧安装包和回滚 generation 保留到用户明确要求清理为止。

## 12. 常见问题处理

### 插件列表不全

先分别检查：内置 bundle、profile selection、disabled/removed 状态、实际 `node_modules`、catalog 资源和 `zws plugin list` 的输出来源。不要直接恢复所有默认插件；用户主动移除、停用、固定版本和第三方选择必须保留。`@zerowallscience/dsh-bundle-science` 是组合声明，列表中是否显示组合包与展开后的插件由 profile 语义决定。

### 扩展中心不显示或报错

确认桌面安装包确实包含 `plugin-extension-center`，确认版本兼容 DSH/桌面，确认它在设置路由而不是侧边栏注册，检查 Host Loader、remote descriptor、catalog 和 profile 选择。先运行 `zws doctor`、`zws extensions status`，再查看 Host 日志；不要重新安装并覆盖用户 profile 作为第一步。

### 七牛同版本冲突

七牛资源对象是不可变的。冲突代表当前字节和已有同 ID/版本对象不同，通常说明版本号复用或历史包不同。保留两边，确定实际内容变化后递增资源版本，重新生成签名 catalog。禁止设置覆盖参数绕过独立资源保护。

### 7.5.0 升级后配置丢失

停止继续安装和清理。收集旧 profile 路径、迁移日志、`package.json`、selection、generation journal 和当前版本 receipt；确认用户数据仍在原目录。迁移只删除明确退休插件标识，不能重建完整默认 profile。

### 构建把文件写回旧目录

检查 `ZEROWALL_ARTIFACT_ROOT`、`ZEROWALL_PACKAGE_OUTPUT`、`tools/build/paths.cjs`、Electron Builder 配置和插件 prepack。修生成器和路径合同，再清理新产生的错误输出。不要把 `desktop/dist` 设为正式发布目录。

## 13. 提交粒度和报告模板

推荐将大改动拆成可回滚提交：

```text
chore: update version/build contract
refactor: centralize artifact staging
feat: add or update independent plugin/resource
fix: repair profile migration or update transaction
test: add contract or package verification
build: package release artifact
docs: record development or release evidence
```

每个提交只包含一个可解释的边界。提交前检查：

```powershell
git diff --check
git status --short --untracked-files=all
git diff --stat
```

交付报告至少包含：

1. 目标版本、分支、父仓库 HEAD、DSH commit。
2. 修改文件和架构边界。
3. 运行过的验证命令及结果。
4. 产物绝对路径、大小、SHA-256 和 build ID。
5. GitHub/Qiniu URL、远端校验结果和签名状态。
6. 跳过、失败、外部依赖和未验证事项。
7. 是否修改了用户数据、主分支、DSH 子模块和旧产物。

不要把计划、局部构建、HTTP 上传成功或进程启动成功写成完整交付。只有实际验收证据满足用户要求后，才能报告任务完成。

## 14. 快速门禁

普通代码变更：

```powershell
pnpm typecheck
pnpm test:security
pnpm plugins:test
```

插件或资源变更：

```powershell
pnpm plugins:typecheck
pnpm plugins:test
pnpm plugins:verify-pack
pnpm test:updates
```

桌面或发布变更：

```powershell
pnpm dsh:verify
pnpm profiles:check
pnpm dsh:runtime:closure
pnpm verify:package
pnpm smoke:host
pnpm smoke:electron
pnpm release:verify-local
```

公开发布前还必须完成七牛公网校验、GitHub 资产校验、安装包下载复核和工作区状态检查。任何一项没有证据，都应标记为未完成并继续调查。
