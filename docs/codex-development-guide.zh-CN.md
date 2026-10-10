# ZeroWall Science Codex 开发指导

本文是后续 Codex 参与 ZeroWall Science 开发、修复、构建和发布时的操作合同。它描述当前仓库的真实边界和可复用流程。源码、配置和自动化脚本仍然是最终事实来源；当本文与代码不一致时，应先检查代码和生成器，再修正文档。

## 1. 当前基线

本文编写时的可验证基线：

| 项目 | 值 |
| --- | --- |
| 应用版本 | `8.1.1`；本批次父 HEAD `c8f00c0b1fd15a6695f136b58d2486cb8f73f3e3`，分支 `main`；构建与发布收据见第 17 节 |
| 8.0.9 Windows x64 安装包 | `316,401,650` 字节，SHA-256 `a2200357281410897bd1a9f7f4702742599cb4b004a8f35acdfd4d4f8e344ced`，build ID `1791561463413-f0f9c239` |
| 8.0.9 发布状态 | Windows 安装器、37 个插件、281 个 Skills、2 个 MCP 和 1 个 Python 目录已发布至七牛 Stable 并完成公网校验；未创建 GitHub Release |
| 集成基线 | 8.0.9 从 `d7d8f579357f5fec20773425d5ae9430ea5e7d4e` 开发，实现提交 `d4738fbee0778e0d0bae495b1bcdc2ac75e63c6d` 已合并到 `main` |
| 8.0.7 架构工作分支 | `codex/8.0.7-modular`，从上述基线创建，已合并并推送到 `main`；对应 Codex worktree 已归档 |
| 8.0.7 本地 Windows 安装包 | `artifacts/packages/8.0.7/windows-x64/zerowall-science-8.0.7-win-x64.exe`；当前 manifest 标明源码树非 clean |
| 8.0.7 发布状态 | 独立资源目录、桌面安装器和 Stable 指针已发布至七牛并通过公网校验；[GitHub v8.0.7 Release](https://github.com/ccfwwm/zerowallscience/releases/tag/v8.0.7) 已公开，四项资产已下载复核 |
| 8.0.7 发布标签 | `v8.0.7` 指向 `f5d04dc0dafd468809ba8eef35e2f9eb2027045a`；后续文档提交不改变发布资产 |
| 8.0.7 安装器收据 | build ID `1791439688519-5aba5d34`，229,670,236 字节，SHA-256 `78b1bcb9613ac8b5f2eaf349c13c59ceac575b425587c7d2b0f94ab2370302f7` |
| DSH 子模块 | `86b6740d0e671cee0b3fd0168de484c0efbf46ea` |
| DSH 分支 | `zerowall/reviewer-history-opaque` |
| DSH 标签 | `dsh-v0.2.0-rc.2` |
| GitHub | `https://github.com/ccfwwm/zerowallscience` |
| 8.0.6 Stable 安装包 | `artifacts/packages/8.0.6/windows-x64/` |
| 8.0.6 发布状态 | 以 `artifacts/release/8.0.6/publication/` 收据、七牛公开校验和 GitHub `v8.0.6` Release 为准 |

七牛历史版本使用不可变路径，清理本地安装器和 stage 不删除远端发布。插件、Skills、MCP 和 Python 资源属于独立发布面；如果同一资源 ID 和版本在七牛已有不同字节，必须停止发布并递增该资源版本，不能覆盖或伪造哈希。资源签名保留 `stable-3` 验签兼容，并由 `stable-4` 为新发布的目录和依赖清单签名；私钥只保存在被 Git 忽略的 `scripts/env/`，严禁进入源码仓库或插件总仓库。

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

记录当前分支、父仓库 HEAD、DSH 子模块 HEAD 和工作区状态。默认直接在当前 `main` checkout 开发，保持用户已有改动；只有用户明确要求隔离，或当前目录被另一项任务占用且无法并行时，才创建 Codex 管理的 worktree。新 worktree 必须通过 Codex worktree 工具创建，不能手工复制目录。

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

8.0.7 的资源源码按 `resources/extensions/{skills,mcp,python,runtimes}`、`resources/extensions/engines/r`、`resources/extensions/capabilities/biogenie`、`resources/cases/research` 和 `resources/branding` 分层。路径消费者使用 layout resolver，并在迁移期只读兼容旧路径。根级 `mcp-environment-staging/` 仅保留源码管理的 SciMaster launcher 输入；实际 MCP/Python 中间 staging 放在 `artifacts/stage/<version>/<build-id>/mcp-environment-staging/`。脚本直接准备 Python 环境时，优先传 `--input` 或设置 `ZEROWALL_BUILD_ID`，不要把 staging 写回源码目录。

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

8.1.0 在启动完成后后台检查插件、Skills 和 MCP 签名目录，并每日检查一次；扩展中心打开时独立检查四组资源（含 Python），手动“检查更新”可立即重试。检测只读取、验签 catalog metadata，并保存验证后的缓存，不下载 payload、不安装、不修改 profile、不重启。发现桌面或资源更新时自动打开更新提示，并在左下角保留更新标记和扩展中心入口。用户必须明确通过设置或 `zws` 触发变更。更新失败时保留旧版本继续运行，不能删除用户自定义 Skill、MCP 配置、账户、模型、项目或第三方插件。远端结果成功后，较早发起的本地读取不得覆盖它；网络失败保留已知更新状态，并显示该组诊断。

插件更新、修复、本地导入和启停的 candidate profile 必须保留安装器已验证离线闭包。对未被本次签名更新替换、且位于用户资源 `offline/` generation 内的包，使用 `link:` 引用其完整运行时，不让 pnpm 重新解析源码 manifest 中的 `workspace:`。选中的插件和签名依赖闭包仍使用验签 tarball。不要删除依赖或放宽版本断言来规避 `ERR_PNPM_WORKSPACE_PKG_NOT_FOUND`。包管理失败应显示退出码、脱敏 stdout/stderr 和 profile diagnostics，不能只显示通用失败提示。

### Python 分层合同（8.0.7）

- 运行时根目录固定为 `%LOCALAPPDATA%\\ZeroWall Science\\Python`；旧 Roaming 或安装目录中的 Python 指针不再作为默认目标，也不会被复制或删除。
- `bootstrap` 只表示解释器是否存在，`core` 表示 ZeroWall/MCP 最小依赖，`science` 表示科研依赖，`capability` 表示某个 Skill 或流程的可选依赖。解释器就绪不等于科研层已安装。
- 默认启动只读取已捆绑签名清单和本地状态，不检测远端。Python + pip bootstrap、42 个基础依赖和其他资源均由用户明确选择安装；任务异步运行，不阻塞桌面界面。
- 新桌面版本使用固定版本的 Python bootstrap manifest；首次安装只接受 `python.bootstrapOnly=true` 的清单。发布的运行时 ZIP 只含 CPython 3.12.10 与 pip，拒绝旧的 387 包科研环境清单，避免新用户误下载近 1 GB 的完整环境。bootstrap 资源使用独立的版本目录；验证阶段只上传不可变对象，不更新 `latest.json`。
- 核心任务写入持久 task receipt，持续记录阶段、包计数、当前包、实时 pip 日志和错误。设置页轮询本地快照，不重复扫描完整 site-packages；关闭或重启后恢复最近任务状态，等待用户选择继续后续接核心同步。
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


### 8.0.9 模块化构建、增量打包与资源布局

8.0.7 新增 `config/layout/resource-layout.json`、`package-layout.json` 和 `package-role-manifest.json`。8.0.9 继续使用这些布局，解析器先尝试 `resources/extensions/*`、`resources/cases`、`resources/branding` 与 `packages/{dsh,support,bundles}`，再回退旧路径；在所有生成器和消费者完成验证前，不要手工删除或复制旧目录。

增量入口是 `pnpm build:changed`、`pnpm plugin:build <id>`、`pnpm plugin:pack <id>`、`pnpm package:build <id>`、`pnpm resource:build skill|mcp|python <id-or-layer>`。Windows Stable 打包先执行增量 `pnpm build`，检查全部组件指纹和输出哈希，用有效缓存装配新的 build ID，再验证 runtime stage 的新鲜度并生成安装器。`pnpm build:full` 显式强制重建；单个插件迭代只使用对应的 `plugin:*` 命令。每项收据包含实际依赖闭包指纹、DSH commit、输出哈希、build ID、耗时和重建原因。`pnpm artifacts:gc --dry-run` 默认只读；只有核对候选清单后才使用 `--apply`。

GC 不遍历任何 `node_modules` 目录；候选树包含嵌套依赖目录时保留整棵树。只有超过保留期且不被收据引用的候选项才计算 SHA-256。删除前重新校验内容和嵌套依赖保护，即使 dry-run 后只新增了一个空的 `node_modules`，也必须拒绝删除。

单独的 Python 依赖清单可用 `pnpm resource:build python core`、`science` 或 `capability <id>` 生成。构建命令应绑定新的 `ZEROWALL_BUILD_ID`；输出先进入该 build ID 的 stage，再经签名和 SHA-256 收据校验。catalog 若标记 `localOnly`，只可用于本地验收，不能作为正式发布目录。

`@zerowallscience/dsh-bundle-core` 和 `dsh-bundle-science` 都是组合声明。8.0.9 ASAR 只携带 Core 和宿主依赖；普通运行时依赖收敛到 `profile-runtime.asar`，安装器保留完整默认插件的签名离线闭包 `offline-profile/modules`、必要物理文件、默认 Skills 和小型 MCP 启动资源，独立插件 tarball 留在 release 产物。新用户首次启动不运行 npm/pnpm 网络安装。离线闭包必须使用正式信任公钥验签，并检查 Desktop/DSH、平台、架构、完整文件集、大小和 SHA-256。

architecture 7 通过 candidate profile、事务 journal、真实 Host 健康检查和原子激活提交。8.0.9 的 generation 使用稳定内容身份，桌面版本和 build ID 只作为构建记录；插件完整且兼容时直接复用已验证 generation。固定版本缺包时阻止整个修复，不用离线的新版本替代。用户明确停用、卸载、固定版本、第三方包、账户、模型、项目、环境变量引用和自定义配置优先。签名闭包复制至用户拥有的固定 generation 后再链接，不能链接到会随安装器升级而替换的目录。旧 architecture 6 即使已迁移，也必须检查实际缺包并修复。

正式 build 使用内容指纹和输出哈希组成的任务图。只修改桌面时只重建 desktop；只修改插件时只重建该插件及其实际依赖闭包；共享 helper 修改沿任务图传播；无变化构建复用经过验证的 tarball。桌面版本和 build ID 不再使全部插件失效。常用命令为 `pnpm build:changed`、`pnpm plugin:build <id>`、`pnpm plugin:pack <id>`、`pnpm resource:build <kind> <id-or-layer>` 和 `pnpm package:stable:win`。

扩展中心四组独立显示，本地读取上限 5 秒，人工检测每组上限 15 秒；请求去重、底层超时、关闭后和过期结果保护同时生效。已安装版本、是否缺包、用户启用选择、实际 Host 激活、固定版本必须分开。Python 解释器就绪不等于 science/capability 已安装。某组挂起或不可用不阻塞其他组，不清空已有结果。

验收不能使用 Core smoke 代替完整科研功能测试。当前 Core 策略下 `pnpm smoke:electron` 调用桌面包结构验证，并不启动真实 Electron 界面；修改 UI 或更新交互时必须另行启动隔离的打包后 Electron 验收，报告不能将两者混为一谈。`verify:package` 同时检查原始 Core ASAR 与验签后的离线闭包，保留 Office/Zotero/原生依赖等检查。历史功能基线见 [8.0.6 到 8.0.8 功能对照](feature-parity-8.0.8.md)，8.0.9 发布和性能记录见 [8.0.9 发布说明](release-notes-8.0.9.md)。后续直接在主目录开发；已发布的临时版本产物按用户要求清理，凭据、用户数据、有效缓存和原始插件归档保留。

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

只更新插件时，先运行 `pnpm plugin:pack <目录 id>`，再给目录生成及 `stage|promote|verify` 命令加上 `--kind plugin`。这样不需要完整 Skills stage，其他资源 feed 保留；分类型发布使用自己的 stage/public 收据，不能拿完整发布的收据代替。正式签名变量和完整示例见 [项目指南](project-guide.zh-CN.md#809-增量构建与清理)。

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

## 15. 2026-10 上游独立资源批次

本批次基于父仓库 `60622c6`，最终源码提交前 HEAD 为 `c0161e81433211fbb02262635ce464193b28c8df`，分支为 `main`；桌面版本保持 `8.0.9`，DSH 子模块保持 `86b6740d0e671cee0b3fd0168de484c0efbf46ea`（`dsh-v0.2.0-rc.2`）。构建 ID 为 `1791580654547-438073f3`。本批次只发布独立插件和 Skills，不重建桌面安装器，不改变桌面 `latest.yml`。

### 15.1 上游审计矩阵

| 资源 | 锁定版本/tag | 精确 commit | 适配复核 |
| --- | --- | --- | --- |
| `dsh-file-review` | `0.8.8` / `v0.8.8` | `7636242d1145708b9f602b32c46cb3a57524ae7e` | manifest、文件审查 Host/Client、打包收据 |
| `dsh-zotero` | `0.12.1` / `v0.12.1` | `77604ad4829dea52d0e9f498d635c9b59f1cae38` | manifest、命令注册、Sources UI、状态 codec、remote API、annotation traversal |
| `dsh-wechat` | `0.9.11` / `v0.9.11` | `4eb2800a1197cef2e5a6055418149fd26262f097` | bridge、会话和跨会话通知 |
| `dsh-genui` | `0.11.4` / `v0.11.4` | `1e87eb103dafc32e2612341f1c004bb015c1c024` | fence、schema、block renderer 与 Host API |
| `academic-research-skills` | `v3.23.0` | `6ab4b03bf70a118a1b3ee7f3263ed9f19031061b` | adapter `a6859a3752cfe582a166ca283c10d3a45e1f9c9c`、Skills 清单和哈希 |
| `dsh-progressive-tools` | `0.7.0` / `v0.7.0` | `f929e86fb442bf289d56e268562b31d8fb8a390b` | peer 依赖、catalog 和 runtime 入口 |
| `dsh-ssh-ops` | `0.3.19` / `v0.3.19` | `262953e614db3aae97594a6fe6d76dc1128c2645` | manifest、SSH/SFTP/DB 工具和安全测试 |
| `dsh-univer-office` | `0.3.7` / `v0.3.7` | `8f85ce4074fdbe51416b6c337468bb916a302c2a` | manifest、四个 Office Skills、telemetry=false 和哈希 |
| `dsh-dream-skin` | `10.9.3` / `v10.9.3` | `927a6f1c1a0d694dfc2ec4557f26266a85f91f22` | 透明度适配、默认值和 packaged runtime guard |
| `dsh-free-search` | `0.8.3` / `v0.8.3` | `0b122443597a9af7964e59e556541b27d71492fd` | settings namespace、free-search endpoint 和版本 guard |
| `dsh-session-notification` | `0.2.3-zws.1`（上游 `0.2.3`） | `794f6536ee060e3254a8a027c5954ed20e369fd8` | ZeroWall 通知定制补丁、声音资源和版本 guard |
| `dsh-better-sidebar` | `0.25.0` / `v0.25.0` | `64a61ccfe42f96e950c7e837c4cbc09942090ac9` | 默认分支注入、Host/Client API 与依赖闭包 |

上游锁定的机器可读来源是 `config/integrations/upstream-sources.json`。若上游只有 commit 变化或保留本地补丁，必须递增独立 ZeroWall 版本；同一 `resource-id@version` 的公开字节不可复用。此次新增 `sr-screener@0.1.1`；因适配层依赖闭包变化而递增的 ZeroWall 插件版本记录在各自 manifest 和 catalog 中。

### 15.2 构建、签名和公网收据

生成命令使用稳定 `stable-4` Ed25519 密钥，两个目录的 `applicationVersion` 均为 `8.0.9`、`localOnly=false`：

```powershell
pnpm plugins:generate
pnpm plugins:bundle
pnpm plugins:pack
pnpm plugins:verify-pack
pnpm catalogs:generate
pnpm runtime:profile:sign
node scripts/publish-resources.mjs stage --kind plugin
node scripts/publish-resources.mjs promote --kind plugin
node scripts/publish-resources.mjs verify --kind plugin
node scripts/publish-resources.mjs stage --kind skill
node scripts/publish-resources.mjs promote --kind skill
node scripts/publish-resources.mjs verify --kind skill
```

本地归档和公网校验收据位于 `artifacts/release/8.0.9/publication/`。插件 feed 包含 38 个不可变对象（含 catalog），总大小 `81,525,684` 字节；catalog 为 `54,271` 字节，SHA-256 `fefb5b9d82793f786de2906bf16fb64473f6d513de3ac99d2cea067946ae3fce`，公网指针 `https://zerowall.chengxunkeji.cn/stable/catalogs/plugin-latest.json` 的校验 SHA-256 为 `f57ec85c65c87f468e03eb7ac746ac1c74c166b1fb8000468fa93165802b4f9e`。

Skills feed 包含 283 个不可变对象（含 catalog），总大小 `7,503,550` 字节；catalog 为 `238,104` 字节，SHA-256 `6adf1498a8020ee80e2328edab6f9ae715863ab7407d9aa40f3c5054abb2bc78`，公网指针 `https://zerowall.chengxunkeji.cn/stable/catalogs/skill-latest.json` 的校验 SHA-256 为 `84d0f7d4a0e665754c9d43b63f90d279e3ac3d4ee5ba6131ba35f72a03dfdf77`。资源归档路径、单对象大小和 SHA-256 以 `qiniu-resources-plugin-public.json`、`qiniu-resources-skill-public.json` 为准。

`stage` 只上传并验证不可变对象，`promote` 只更新对应的资源 catalog pointer，`verify` 再次从公网检查大小和 SHA-256。该流程不会上传桌面安装器，也不会修改桌面 `latest.yml`。启动和每日目录检查仍是只读；旧版本安装状态只能用于检测新版本，用户未明确选择时不得下载、安装、重启或改变 profile。

## 16. 8.1.0 更新修复与验收

本批次在 `main` 上从 `c47e360279d4ff0b032b8c4bd384a4cd5fea072d` 开发，DSH 仍为 `86b6740d0e671cee0b3fd0168de484c0efbf46ea`。用户已授权构建和发布 Windows x64 `8.1.0`、更新七牛桌面 Stable 指针，并提交及推送 `origin/main`；本批次不创建 GitHub Release 或版本标签。

插件更新的 candidate profile 不能重新解析安装器离线包的源码 `workspace:` 依赖。未被替换的离线 generation 保留完整闭包并使用 `link:`；选中资源和签名依赖继续使用验签归档。Progressive Tools 上游 `0.7.0` 的四个 DSH peers 仍为精确 `0.2.0-rc.1`，生产适配器核验原版本及 peer 集合后改为精确 `0.2.0-rc.2`。其 bundle 使用未加 scope 的包名，导致安装包中入口无法导入；适配器核验原始 patch 后改为 `@everclear077/dsh-progressive-tools`，独立版本为 `0.7.2-zws.1`。这项适配不改上游源码，也不放宽运行时兼容检查。

资源更新弹窗与桌面更新状态分别判断：只存在插件/Skills 更新时不得显示旧桌面版本为最新版本。捆绑 Skills 使用构建时生成的版本快照；独立更新后的 Skill 副本写入签名目录版本，后续检测使用 `skill.get.declaredVersion`。后台检测只读取并验签目录，实际更新、回滚和 Host 重启均由用户明确操作触发。

### 16.1 上游复查（2026-10-10）

12 个锁定 tag 的远端身份已核验。第 15 节中的 File Review 和 Zotero 旧 `commit` 字段实际记录 annotated tag 对象；本次审计保留该历史身份，并记录剥离 tag 后的真实源码 commit：

| 资源 | 锁定 tag | tag 对象 | 真实源码 commit |
| --- | --- | --- | --- |
| File Review | `v0.8.8` | `7636242d1145708b9f602b32c46cb3a57524ae7e` | `b0a828b925b42435d85c4bb867072c167baf678d` |
| Zotero | `v0.12.1` | `77604ad4829dea52d0e9f498d635c9b59f1cae38` | `abb4054cc13b0a893df96294e57c667aab3fd059` |

额外发现的上游 refs 本次未合入，需要按适配矩阵复核后另发资源版本：

| 资源 | 新 ref | 默认分支 commit |
| --- | --- | --- |
| Zotero | `v0.13.0-alpha.2` | `313b7fffa71c599fed29f1549f1aaab39128f191` |
| GenUI | 默认分支新提交；最新 tag 仍为 `v0.11.4` | `5d0d63b8f542886db4910f4dd13a875b1e01803c` |
| Academic Research Skills | 默认分支新提交；最新 tag 仍为 `v3.23.0` | `e614b322297ba5b072a106942177e218cbe2d48f` |
| Dream Skin | 默认分支新提交；最新 tag 仍为 `v10.9.3` | `c48e03461815aa22014d4ab98f0fbb3b4b12d052` |
| Session Notification | 默认分支新提交；最新 tag 仍为 `v0.2.3` | `655150567cf1a40ca245645daf265cbadd63c97d` |

机器可读审计收据为 `artifacts/verification/8.1.0/upstream-audit.json`。运行时公网检测针对经过签名、适配和发布的资源目录；上游 GitHub 新提交只有正式纳入目录后才作为用户可安装更新。

### 16.2 版本与检测合同

桌面启动完成后 12 秒读取插件、Skills 和 MCP 签名目录，15 秒检查桌面更新，运行中每 24 小时再次检查；手动检查可立即重试。检测不得创建安装任务、修改 profile 或重启 Host。发现更新时自动弹窗，同时保留左下角更新标记；资源更新弹窗直接进入扩展中心，桌面更新仍由用户确认下载和安装。

本批次资源版本为 Base `0.1.13`、Research `0.1.10`、Extension Center `0.1.8`、File Review `0.8.9-zws.1`、Dream Skin `10.9.4-zws.1`、Progressive Tools `0.7.2-zws.1`。其他插件及未变化 Skills 保持已发布版本和字节。扩展中心 `0.1.6` 已存在公网归档，其 Base 依赖为 `0.1.12`；当前依赖为 `0.1.13`，曾递增并暂存 `0.1.7`。后续调整窄屏布局和 Python 安装状态，因此最终发布 `0.1.8`，保留旧归档且不覆盖同版本对象。

扩展中心按插件、Skills、MCP 和 Python 分组，摘要显示资源数量、可更新数量和最近检查时间；窄屏工具栏将标签与搜索分行，搜索与导入保持同一行。Python 完全未安装时显示“安装”，不计入可更新数量或全部更新；已经安装旧包但匹配版本数量为零时仍应识别为更新。实际安装必须由用户点击安装按钮触发。

实际安装验收必须在隔离用户目录启动打包后的 Electron，使用真实旧插件/Skills 归档验证检测、更新、健康检查和回滚。宽屏及窄屏截图要关闭更新弹窗后检查扩展中心，再单独检查公网启动弹窗；只运行结构门禁不能代替这项 UI 验收。失败命令保留脱敏 stdout/stderr、exit code 与 profile diagnostics，不展示凭据。

### 16.3 最终构建与资源收据

构建 ID 为 `1791616088507-10a8b33f`，Windows x64 安装器为 `artifacts/packages/8.1.0/windows-x64/zerowall-science-8.1.0-win-x64.exe`，大小 `317,644,649` 字节，SHA-256 `23c1af2e65fca7655d5b5d41166aa9a8d76da9bf4192db109dd340c961886fd3`。安装器构建基于本节开头记录的父 HEAD 和本次未提交源码；`artifact-manifest.json` 明确记录 `source.clean=false`，不能将它描述为仅由父 HEAD 重现的产物。桌面和 DSH 命令实际输出分别为 `8.1.0` 与 `0.2.0-rc.2`。

本批次变化的插件归档如下，路径前缀均为 `artifacts/release/8.1.0/plugins/`；未变化资源的完整路径、大小和哈希见 `plugin-packages.json` 与公网收据。

| 资源 | 版本 | 归档相对路径 | 字节 | SHA-256 |
| --- | --- | --- | --- | --- |
| Base | `0.1.13` | `plugin-base/0.1.13/zerowallscience-plugin-base-0.1.13.tgz` | `201795` | `f226841fe6dd4e2c8ec273f2cf300d98f8360e6b5b5e1973e544ee7d5e616e99` |
| Extension Center | `0.1.8` | `plugin-extension-center/0.1.8/zerowallscience-plugin-extension-center-0.1.8.tgz` | `143711` | `40b7205ddb04896c164b030c77b83b371cf9cc1d6eb243b4c3a009e1a3499723` |
| Research | `0.1.10` | `plugin-research/0.1.10/zerowallscience-plugin-research-0.1.10.tgz` | `9881038` | `4d27ce4bfd83e34cf5b89666326b053963e8343ead763188a4062d8cd2d22010` |
| Progressive Tools | `0.7.2-zws.1` | `dsh-progressive-tools/0.7.2-zws.1/everclear077-dsh-progressive-tools-0.7.2-zws.1.tgz` | `44553` | `76211474e0e4e781e0a02f7b1cb3db21a15d60143909ce541fe1871b8b69ebd4` |
| Dream Skin | `10.9.4-zws.1` | `dsh-dream-skin/10.9.4-zws.1/dsh-dream-skin-10.9.4-zws.1.tgz` | `149116` | `38a34d5a8a52945c0aa35f775609408b32ecdcb317ca2fc9c78a53b61f6e161e` |
| File Review | `0.8.9-zws.1` | `dsh-file-review/0.8.9-zws.1/dsh-file-review-0.8.9-zws.1.tgz` | `90629` | `dcb970c2c412875519bf6c9a082cae422c11e4f67a896e030bdb893cf9533b54` |

两个签名目录的 `applicationVersion=8.1.0`、`localOnly=false`、`keyId=stable-4`。插件 feed 为 37 个插件和 1 个 catalog，共 `81,637,017` 字节；catalog 为 `54,329` 字节，SHA-256 `af732828dd2a334001770f0cfd3e1cacbe851f2e951dee67623b5f3fb3f8dda7`。Skills feed 为 282 个 Skills 和 1 个 catalog，共 `7,503,550` 字节；catalog 为 `238,104` 字节，SHA-256 `3b7d522df2406fbc62060d2f6bb558144bf670bac548f4d379692e6166767a41`。

插件公网指针 `https://zerowall.chengxunkeji.cn/stable/catalogs/plugin-latest.json` 为 `521` 字节，SHA-256 `70ddceb3cf25eb32f59dbea4f35cafcf24d7fc8200783af4efd19a2ee6e6106d`；Skills 公网指针 `https://zerowall.chengxunkeji.cn/stable/catalogs/skill-latest.json` 为 `520` 字节，SHA-256 `b267a7a266173dcb0b9d641befbc7f5d440690794d7c10c1d2df5ec6ca790af2`。每个不可变对象均已在 `stage` 时从公网下载校验，随后 `promote` 与 `verify` 校验目录指针。逐对象收据为 `artifacts/release/8.1.0/publication/qiniu-resources-plugin-public.json`、`qiniu-resources-skill-public.json`。

### 16.4 验收与限制

以下检查通过：`pnpm dsh:inventory`、`pnpm dsh:verify`、`pnpm profiles:check`、`pnpm dsh:runtime:closure`、`pnpm version:check`、完整 `pnpm typecheck`、`pnpm plugins:typecheck`、`pnpm plugins:test`、`pnpm plugins:verify-pack`（21 个原生包）、`pnpm test:updates`、`pnpm test:security` 和完整 `pnpm verify:package`。最终完整包验证已经包含 `smoke:host` 与 `smoke:electron` 所代理的 Host/Desktop 检查，因此没有重复运行相同门禁。`pnpm smoke:update` 验证桌面更新元数据。

最后修改后补验 Base `54` 通过、`1` 跳过；Extension Center `8` 通过；桌面 `233` 通过、`4` 跳过；更新 `53` 通过、`3` 跳过；合同 `57` 通过、`1` 跳过；安全 `2` 通过。详细日志位于 `artifacts/logs/8.1.0/`。跳过项为未提供私有历史副本、实际 Python 集成 fixtures、提供的 Zotero 回放 fixture，以及未配置独立 Electron 测试可执行路径的三项单测；后者相关运行时能力另由真实安装包验证覆盖。

真实打包 Electron 使用隔离用户目录，完成 File Review `0.8.8` → `0.8.9-zws.1` 更新、Host 健康检查和回滚；`paper-download` `0.1.1` → `0.1.2` 更新后不再误报，随后回滚成功。启动公网检查发现 `1` 个插件和 `1` 个 Skill 更新，弹窗自动显示，关闭后左下角指示仍保留，按钮可以打开扩展中心；检查未创建安装任务。截图与 JSON 收据位于 `artifacts/verification/8.1.0/`。

本批次仅构建 Windows x64，不构建 macOS/Linux；第 16.1 节额外上游 refs 未合入。安装器未使用 Windows Authenticode 证书，资源目录和离线闭包使用稳定 Ed25519 签名。没有创建 GitHub Release/tag，没有对真实用户目录执行安装或更新。未跟踪目录、密钥和 `artifacts/` 不纳入源码提交。

## 17. 8.1.1 启动与共享运行时修复

本批次在 `main` 上从 `c8f00c0b1fd15a6695f136b58d2486cb8f73f3e3` 开发，DSH 仍为 `86b6740d0e671cee0b3fd0168de484c0efbf46ea`。用户授权构建、发布七牛 Windows x64 `8.1.1` 并提交和推送 `origin/main`；本批次不创建 GitHub Release 或版本标签。

### 17.1 覆盖安装与离线验签

客户日志和本机安装副本表明，覆盖安装保留了旧 `resources/offline-profile/profile-runtime.asar.unpacked` 中已改名插件及旧 hash 资源。2026-10-10 本机只读复查：签名收据包含 1031 个物理文件，实际存在 1082 个文件（多余 51 个、缺失 0 个、大小不符 0 个），启动在 Host 创建之前被严格集合校验拒绝。这不是网络更新失败，也不能通过忽略多余文件修复。收据为 `artifacts/verification/8.1.1/installed-offline-diagnostic.json`。

NSIS 在进程占用检查之后、新归档解包之前，只替换安装器拥有的 `profile-runtime.asar.unpacked`；删除失败时中止安装并明确提示关闭进程。其他用户文件、profile、账户、模型、项目、环境变量引用与自定义资源保持原有归属。启动验证继续拒绝链接、特殊文件、缺失、多余、大小或 SHA-256 不符，错误提供物理及逻辑集合差异计数、资源版本、build ID 和内容身份；界面不输出文件名和凭据。不得将启动错误改成自动安装或静默删除用户目录。

覆盖安装回归必须使用已知不匹配的旧离线副本，在隔离的中文安装路径运行真实 NSIS；要求旧副本先被拒绝、新副本正式验签通过、安装后 ASAR 与候选包一致、用户 sentinel 保留。安装器 exit code 不能代替这些检查。

### 17.2 Python、MCP 与目录选择器

Python 插件和 MCP 插件共同解释 Host 的 `runtimeRoot`、`runtimeLayout` 与 `generation`，在唯一的 `%LOCALAPPDATA%\\ZeroWall Science\\Python` 共享运行时中使用平铺解释器及 `Lib/site-packages`。签名 archive manifest 保留原始 `Python/python.exe` 布局，只有 Host 明确记录投影时才接受平铺布局；候选 generation 使用其自己的已声明路径，不从文件存在性猜测另一套环境。

只有 bootstrap 解释器且缺少 Bio MCP 核心依赖时，允许解释器独立激活，保留当前已运行服务；Bio 明确显示核心依赖待安装。核心层候选仍须经过 `initialize` 和 `tools/list` 健康检查，不能放宽断言或切换用户模型。启动失败保留阶段、退出信息与 stderr，经脱敏后展示，Python traceback 的末尾 ImportError 不得被截断成仅有 `closed`。健康检查成功后关闭 stdin，使 stdio 正常退出；Bio 请求取消后避免重复响应，其他协议错误继续报告。

Win32 目录选择器由 runtime adaptation 校验原始目标后使用 Koffi 复制式 UTF-16 解码，COM 分配内存在 finally 中释放，并保持 IPC 连接到终态。修改 adaptation 时必须同步断言和真实中文目录选择验收。

仅变化的独立插件递增：Python `0.1.3`、MCP `0.2.10`。MCP `0.2.9` 曾暂存至七牛，因此即使还未 promote，也不能用它发布不同字节。未变插件、Skills、MCP 配置及 Python archive 继续复用既有归档。新 build ID 按组件指纹检查编译、runtime assembly 和 offline carrier 输入；变更的组件重新构建，未变组件使用内容存储、Electron 和原生缓存。禁止为了打包整目录复制或清空有效缓存。

### 17.3 构建、发布与验收收据

最终 build ID 为 `1791636065885-36d837b3`。Windows x64 安装器为 `artifacts/packages/8.1.1/windows-x64/zerowall-science-8.1.1-win-x64.exe`，大小 `317,646,258` 字节，SHA-256 `74dcf5ac334e67ea4c7002f6843323e65dd81d775fd2a04ee70052af1c9a9f43`。blockmap 为 `332,039` 字节，SHA-256 `54b060b72b61226628155ba7ac2acaf3b76ab1e0f147e63260bf4dc6b8a3c045`。安装后 ASAR 与验收包一致，SHA-256 `64851363a3bef8967aa4b760371c552786151b21e8383de78871f87ba26a2756`。`dsh.cmd --version` 为 `0.2.0-rc.2`，`zws.cmd --version` 为 `8.1.1`。

构建基于本节记录的父 HEAD 加本批次未提交源码；`artifact-manifest.json` 明确记录 `source.clean=false`，不能声称只由父 HEAD 重现。完成安装验收后仅修正文档、发布元数据和隔离测试工具，沿用上述安装器，不再次构建 payload。组件指纹、缓存、内容硬链接和未变 tarball 均复用；默认安装器没有捆绑大型 Python 科研环境，也没有清空历史构建缓存。

本批次变化的插件归档路径前缀为 `artifacts/release/8.1.1/plugins/`：

| 资源 | 版本 | 归档相对路径 | 字节 | SHA-256 |
| --- | --- | --- | --- | --- |
| Python | `0.1.3` | `plugin-python/0.1.3/zerowallscience-plugin-python-0.1.3.tgz` | `24492` | `490fdb5c7094073dd6f641cc7282e2d8754c9f9afd7c4e5f48a5d917c507af40` |
| MCP | `0.2.10` | `plugin-mcp/0.2.10/zerowallscience-plugin-mcp-0.2.10.tgz` | `348202` | `735f0fe56a2b19d0a048c16c6a16eb7380cfea7eec9aba7aa9ac5f2dbd94a01c` |

四组 catalog 的 `applicationVersion=8.1.1`、`localOnly=false`、签名密钥 `stable-4`，generation 为 `1791636065885-36d837b3-1791636373605`。`stage` 下载并核验 326 个不可变对象（37 个插件、282 个 Skills、2 个 MCP、1 个 Python 清单及 4 个 catalog），总大小 `89,406,684` 字节；`promote`、`verify` 成功，收据为 `artifacts/release/8.1.1/publication/qiniu-resources-public.json`。

| catalog | 字节 | SHA-256 | 公网指针 |
| --- | --- | --- | --- |
| plugin | `54332` | `4457e25ef879f8ce37ec0ea31e06ff0f8b20583377a8d6e60bc79f7e1687b893` | `https://zerowall.chengxunkeji.cn/stable/catalogs/plugin-latest.json` |
| skill | `238104` | `97c502b9c2881d51b1a24c6ed8b9f53e338ee55672ab5e757ef5e3e6e11760eb` | `https://zerowall.chengxunkeji.cn/stable/catalogs/skill-latest.json` |
| mcp | `2357` | `c107987b8233435bc6e237a3ff38f31bbfab254393c438b968873e150541f21e` | `https://zerowall.chengxunkeji.cn/stable/catalogs/mcp-latest.json` |
| python | `1229` | `edc3a4e83a505e4607ff5a06b8af38af726e4fd3af74fad01944c88e08dbde26` | `https://zerowall.chengxunkeji.cn/stable/catalogs/python-latest.json` |

### 17.4 真实安装与运行验收

以下门禁通过：`pnpm dsh:inventory`、`pnpm dsh:verify`、`pnpm profiles:check`、`pnpm dsh:runtime:closure`、`pnpm version:check`、完整 `pnpm typecheck`、`pnpm plugins:typecheck`、`pnpm plugins:test`、`pnpm plugins:verify-pack`（21 个原生包）、`pnpm test:updates`、`pnpm test:security`、`pnpm smoke:update` 和 `pnpm verify:package`。包验收包括 Host/Desktop、About `8.1.1`、中英文设置切换；ready 为 `26145 ms`，5096 个安装资源，离线闭包 1032 项（含收据），展开目录 `1348.2 MiB`、安装器 `302.9 MiB`。包验收已包含 Host/Electron smoke，不重复运行相同检查。

最终相关测试：桌面 `238` 通过、`4` 跳过；Updates `54` 通过、`3` 跳过；Security `2` 通过；MCP `86` 通过、`2` 跳过；Python `8` 通过；Bio `8` 通过；目录选择器 adaptation 单测 `1` 通过。跳过项包括 Base 私有历史、桌面真实 Python fixtures、MCP 远程 R 凭据、Research 的 live docking/OpenSlide/H5AD，以及未配置独立 Electron 路径的 3 项更新单测。真实打包后的 Electron 能力另经以下验收覆盖；不能据此宣称所有远程科研服务均已验证。

真实 NSIS 覆盖安装使用已知不匹配的旧 carrier 和隔离中文目录。第一次安装超过 180 秒；第二次 NSIS exit `0` 且必需断言通过，但读取可选性能 trace 时出现 ENOENT，使原验证命令 exit `1`。随后补验全部必需断言 exit `0`，记录 `installer-test-811/installation-receipt.json` 与 `final-isolated-installation-complete.log`：旧 carrier 被拒绝，新 carrier 的 1031 个 payload 文件正式验签通过，ASAR 一致、用户 sentinel 保留、729 个 Office 物理资源齐全。未取得可选性能 trace；不能把原验证命令描述为直接成功。

隔离安装会临时注册命令入口，测试工具现于安装前保存精确 HKCU PATH 值、类型及命令 owner，在 finally 中恢复；并发外部修改时拒绝覆盖。`powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File tools/packaging/installer-command-state.test.ps1` 在专属测试注册表 key 验证了顺序和类型恢复、安装前失败的 no-op、并发修改拒绝、原 PATH/owner 缺失及预先存在的相同路径。实际测试留下的临时命令入口已按所有权校验恢复正式安装，收据为 `command-owner-restoration.json`，未修改真实 profile。

真实安装后的 Electron 使用隔离用户数据：宽屏和窄屏扩展中心分别为 `559/559`、`511/511` 的滚动宽度/客户区宽度，无横向溢出；未安装 Python 不计为更新。File Review `0.8.8` → `0.8.9-zws.1` 完成更新、Host 健康检查与回滚，`paper-download` `0.1.1` → `0.1.2` 完成更新与回滚。公网检测发现 1 个插件和 1 个 Skill 更新，启动弹窗、关闭后左下角标记、扩展中心跳转均通过，未创建自动安装任务且 profile 保持原样。收据为 `ui-receipt.json`、`update-receipt.json`、`notification-receipt.json`；对应截图保存在同目录。

科学代码通过 Python Host 工具在唯一共享 `Python/python.exe` 中完成 NumPy `2.5.3`、Pandas `2.3.3`、SciPy 线性回归及 Matplotlib 出图，`current.json` 不变；并非从 UI 发起。最终安装目录下的 Bio stdio 完成 initialize、8 个公开工具/247 个内部工具发现、`bio_search`、`bio_jobs` 和再次 tools/list，连接保持。收据为 `python-tool-receipt.json`、`bio-stdio-receipt.json`。

仅 Windows x64；未测机器级 UAC、生产安装注册、远程科研 API。无 Windows Authenticode 签名，资源目录与离线闭包使用稳定 Ed25519 签名。未创建 GitHub Release/tag。用户数据、密钥、未跟踪用户目录和 `artifacts/` 不纳入源码提交；详细机器收据位于 `artifacts/verification/8.1.1/`、`artifacts/release/8.1.1/publication/` 和 `artifacts/logs/8.1.1/`。

### 17.5 本次桌面同版本覆盖授权

普通稳定发布首先拒绝了旧七牛 `8.1.1` 候选对象与最终包的大小/哈希冲突。旧安装器为 `317,645,085` 字节，SHA-256 `04a15cf29dafb8047ae2c329a40a7c6bed3b94816587632406637ad94cebdb43`。用户随后明确要求“直接覆盖即可 8.1.1，没人下载”，撤回此前选择的 `8.1.2`。本次仅对 `stable/releases/8.1.1/` 下安装器、blockmap 和版本 JSON 三个桌面对象执行授权覆盖；常规发布保护及插件/Skills 的不可变规则保持有效，后续任务不得默认复用此例外。

桌面下载地址为 `https://zerowall.chengxunkeji.cn/stable/releases/8.1.1/zerowall-science-8.1.1-win-x64.exe`。旧 publication 收据保留为 `*-before-authorized-overwrite.json`；覆盖后要求刷新 CDN，带校验参数及无参数的公开下载均匹配第 17.3 节最终字节，然后通过标准 `pnpm release:publish:stable` 提升桌面指针及 `pnpm release:verify:stable` 公网复核。当前已安装相同 `8.1.1` 的客户端不会因同版本号自动再次升级，需要退出后手动下载覆盖安装；`8.1.0` 及较早版本可检测到 `8.1.1`。

最终 `pnpm release:publish:stable` 的 `stage`、`promote` 均成功，`pnpm release:verify:stable` exit `0`；公网收据 `artifacts/release/8.1.1/publication/qiniu-desktop-public.json` 的验证时间为 `2026-10-10T13:45:46.046Z`。安装器、blockmap、版本 JSON 及三个桌面指针均匹配本地 `artifact-manifest.json`。无参数安装器 URL 已完整下载核验；三个无参数指针也独立核验通过，收据分别为 `qiniu-desktop-overwrite-normal-urls.json`、`qiniu-desktop-pointer-normal-urls.json`。

| 桌面 Stable 指针 | 字节 | SHA-256 |
| --- | --- | --- |
| `https://zerowall.chengxunkeji.cn/stable/latest.yml` | `1987` | `ace931b0c7a46033a83f26e0d2f1128f296f5a0d9696235f467b4294bd0f88d2` |
| `https://zerowall.chengxunkeji.cn/stable/releases/latest.json` | `2076` | `29d1524b22c58cf48f0b4fdc7f381030ebe0593f1e1a80894f686e9fcdfb69fd` |
| `https://zerowall.chengxunkeji.cn/stable/releases-zerowallsciencedev/latest.json` | `2076` | `29d1524b22c58cf48f0b4fdc7f381030ebe0593f1e1a80894f686e9fcdfb69fd` |
