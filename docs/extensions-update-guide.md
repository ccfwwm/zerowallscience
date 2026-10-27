# ZeroWall 8.3.3：插件、Skills、MCP 与 Python 单独更新教程

## 先升级桌面一次

8.3.3 集成发布时最新的插件与 Skills，并默认启用配置 HMR。后续独立发布的资源仍以验签后的 catalog 为准。开发与打包流程见 [开发指导](codex-development-guide.zh-CN.md)。

桌面核心与扩展资源分开更新。安装器携带已验证的默认功能签名离线闭包。插件、Skills、MCP 在启动后和每日读取、验签远端目录，检查只显示可用更新，不下载 payload、不安装、不激活、不重启。用户在设置或 CLI 明确操作后才执行这些变更。Python 是下文说明的后台自动维护例外。桌面升级保留账户、模型、项目、环境变量、第三方插件、停用和固定版本选择。

升级后启动桌面，重新打开一个 PowerShell 窗口：

```powershell
dsh --version
zws --version
zws help
zws doctor
zws plugin list
```

`dsh` 应显示 `0.2.0-rc.2`，`zws` 应显示桌面 `8.3.3`。`zws doctor` 会报告实际加载的插件版本和来源。命令需要正在运行的桌面 Host；若提示先启动 ZeroWall Science，请启动应用后再操作。

如果 Windows 安装目录变过或旧终端仍持有旧 PATH，关闭并重开终端。程序会按 owner receipt 管理命令，避免覆盖不属于 ZeroWall 的 `dsh`。

## 在设置中操作

进入“设置 → 扩展中心”，选择“插件”“Skills”或“MCP”：

1. 点击“检查更新”，查看已安装版本、可用版本、来源、签名与兼容状态。
2. 选中需要的资源，手动安装或更新；更新任务记录下载、校验、激活和失败原因。
3. 插件代码更新后 Host 会重新加载；Skills 内容更新可热刷新；MCP Server 更新只管理对应连接或服务。
4. 出现问题时使用该资源的回滚。首次安装尚无旧 generation 时不能回滚。

启动和每日检查只显示可用更新，不自动安装或重启。离线、签名不可信、SHA-256 错误或版本不兼容时继续保留旧资源。DSH 核心与 Electron 仍通过桌面升级更新。

用户导入的同名 Skill 优先于内置资源。修改过自己的 Skill 时，先导出/备份该目录；不要点击批量更新覆盖自己的内容。内置插件卸载会记录 profile 的移除选择，安装包中的文件仍保留；单独安装的插件才实际移除。

## 单独更新插件

```powershell
zws plugin check
zws plugin update plugin-extension-center
zws plugin update plugin-files
```

GUI 与 CLI 使用同一插件发现、安装和 profile 激活流程。扩展中心可发现 CLI 安装的合法 DSH bundle 并导入桌面 profile；读取列表不会触发重装，已有禁用、移除和固定版本选择保持不变。

完整包 ID 也可以使用，例如 `@zerowallscience/plugin-files`。需要的自有依赖会一起准备和验签，随后只提交受影响的插件路径并执行 Host 健康检查；不复制整个 profile，也不保留插件版本回滚快照。失败会恢复清单、锁文件和本次受影响路径；需要回退时重新安装旧版安装包。

安装、启停和移除：

```powershell
zws plugin add plugin-pubmed
zws plugin disable plugin-pubmed
zws plugin enable plugin-pubmed
zws plugin remove plugin-pubmed
zws plugin repair
```

`zws plugin update` 不带 ID 会触发多个已安装资源的更新，请优先指定一个 ID。正在运行重要任务时，先等待任务结束再更新需要重启 Host 的插件。

手动导入从可信来源下载的 tarball：

```powershell
zws plugin add "C:\Downloads\zerowallscience-plugin-pubmed-0.1.0.tgz"
```

在线更新优先使用签名 catalog。手动 tarball 属于用户明确导入，不会自行获得官方签名信用；不要从未知来源导入代码。

## 单独更新和导入 Skills

```powershell
zws skill list
zws skill check
zws skill update zerowall-presentation
zws skill rollback zerowall-presentation
```

导入目录必须包含 `SKILL.md`。下载的 Skill tarball 先解压，然后选择解压后包含 `SKILL.md` 的目录。

```powershell
zws skill import "C:\MySkills\my-analysis"
zws skill disable my-analysis
zws skill enable my-analysis
zws skill update "C:\MySkills\my-analysis"
zws skill remove my-analysis
```

`update <资源ID>` 读取签名在线目录；`update <已有本地目录>` 刷新该目录内容。Skills 本身是说明与资源，调用的 Python 包、命令和 MCP 服务仍需相应环境。

## MCP 配置和 Server 包

MCP 配置模板与可执行 Server 是两类资源。当前目录包含 `r-platform` 连接模板和 `scimaster` 独立 Server 包：

```powershell
zws mcp check
zws mcp add r-platform
zws mcp add scimaster
zws mcp list
```

这两个资源首次添加默认停用。到“设置 → MCP”的详细配置页面填好自己的凭据和地址，再明确启用。密钥使用安全存储和环境变量引用，公开模板不包含用户密钥。

启停、日志、重启使用 `zws mcp list` 返回的 **connection ID**：

```powershell
zws mcp start <connection-id>
zws mcp stop <connection-id>
zws mcp restart <connection-id>
zws mcp logs <connection-id>
zws mcp remove <connection-id>
```

Server 包更新和回滚使用 catalog 的资源 ID：

```powershell
zws mcp update scimaster
zws mcp rollback scimaster
```

连接模板更新会保留已有启用状态；模板没有独立 Server generation，因此不提供 Server 包式回滚。SciMaster 支持 Server 包历史回滚；模型及 API Key 仍使用自己的设置。

## 七牛与 GitHub 资源（既有发布入口）

以下为正式资源入口；实时版本以在线签名内容及公开下载校验为准：

- [插件签名指针](https://zerowall.chengxunkeji.cn/stable/catalogs/plugin-latest.json)
- [Skills 签名指针](https://zerowall.chengxunkeji.cn/stable/catalogs/skill-latest.json)
- [MCP 签名指针](https://zerowall.chengxunkeji.cn/stable/catalogs/mcp-latest.json)
- [插件源码与独立 Releases](https://github.com/ccfwwm/zerowall-dsh-plugins)

客户端验签后读取指针指向的不可变 catalog，再下载资源并验证 SHA-256 与大小。GitHub Release 镜像与七牛采用同一份资源字节，catalog 默认下载 URL 仍指向七牛。已经签名的指针不能手动修改 URL。

`--catalog` 可以明确指定另一个被当前可信密钥签名的 HTTPS catalog：

```powershell
zws plugin check --catalog https://zerowall.chengxunkeji.cn/stable/catalogs/plugin-latest.json
zws skill update zerowall-presentation --catalog https://zerowall.chengxunkeji.cn/stable/catalogs/skill-latest.json
```

## 开发者发布一个资源

8.3.0 的适配插件、Research Store、支持包和组合声明统一位于 `plugins/`；Skills/MCP 资源源码位于 `resources/extensions/`。插件源码仓库保留源码快照、构建工具及来源收据；历史 `skills/`、`mcp/` 和签名 `catalogs/` 继续保留历史发布记录，资源是否上线以签名目录和公开校验收据为准。

1. 只提升改动资源的 semver，并更新它的兼容范围；不能更改已发布同 ID/版本的字节。
2. 构建选定插件、执行对应测试和 `pnpm plugin:pack <id>`；Skills 使用确定性 tar，MCP 配置/Server 分别打包。插件私有资源必须进入 tarball，发布依赖不能含 `workspace:` 或 Git 源依赖。
3. 用正式 Ed25519 密钥签署资源条目、catalog 和指针；密钥仅放本地忽略目录或 GitHub Secrets。8.3.0 使用 `stable-4`，以当前 trusted-keys 合同为准，不能发布开发签名。
4. 上传 `stable/plugins/<id>/<version>/`、`stable/skills/<id>/<version>/` 或 `stable/mcp/<id>/<version>/`，再上传不可变 catalog。公开下载验证签名、大小及 SHA-256。
5. 使用该不可变 catalog 在隔离 profile 测试安装、最小调用和回滚，再切换对应类型的 `*-latest.json`。只更新这一类资源目录，不修改桌面 `stable/latest.yml`。
6. 在插件总仓库创建对应资源版本 Release，上传与七牛相同的包及签名清单。独立更新无需变更桌面版本。

当前主仓库提供分阶段发布工具（默认不切换 latest）：

```powershell
# 在已准备好正式签名 catalog 和资源的集成工作区执行
node scripts/publish-resources.mjs stage
# 所有公开对象验证成功，且隔离安装验证后再执行
node scripts/publish-resources.mjs promote
node scripts/publish-resources.mjs verify
```

桌面发布使用 `pnpm release:publish:stable` 和 `pnpm release:verify:stable`。独立资源脚本不会改变桌面更新指针。

## Python 分层更新

Python 内容 revision、依赖层与桌面版本独立。固定解释器默认位于实际安装目录的 `Python/python.exe`，也可使用用户明确选择的固定根目录；不会切换 Roaming、LocalAppData 或 legacy slots 中的解释器。

桌面可用后，后台队列执行签名 bootstrap/recovery，逐包检查并自动安装、更新全部 `core` 和 `science` 依赖；在线签名依赖清单按小时检查。安装核对签名、下载大小和 SHA-256，并通过实际 import 验证；尚未验证的包不能标记为完成。任务和日志持久化，可恢复符合条件的自动任务，不阻塞界面。

失败时按文件事务恢复同一固定根目录中的旧文件，记录失败与恢复结果，不通过切换 `current.json` 或 generation 路径回滚。`capability` 是可选依赖，仍由用户显式选择安装。打开扩展中心只读取任务与状态，后台维护由 Python 启动及周期流程负责。

## 固定版本与修复

插件支持“固定当前版本”和“解除固定”，`zws plugin pin <id>`、`zws plugin unpin <id>` 使用同一选择记录。“全部更新”跳过固定项和固定依赖冲突项并给出原因。停用、卸载存在依赖的插件时先展示受影响插件，用户确认后再处理。

升级自动修复损坏的 8.0.7 architecture 6 profile，并保留明确停用、卸载和第三方配置。缺失的固定版本必须导入精确版本或由用户解除固定。离线签名或健康检查失败保留原 profile 和失败 receipt；不要手工清空用户配置。MCP 缺凭据显示待配置，Python 显示各层真实安装程度及后台任务，capability 安装仍需显式选择。


## 开发者：共享不可变插件与稳定桌面打包

插件包存于共享不可变目录 `artifacts/release/plugins/<插件目录名>/<独立版本>/`，不随桌面版本复制或重归档。组件构建验证插件字节后生成绑定 DSH commit 的插件快照和成功构建收据；相同 ID/版本出现不同文件或字节时必须停止，调查并提升真正变化的组件版本，不能覆盖历史归档或绕过签名。

后续每个桌面版本必须集成共享 plugin-packages.json 中全部最新、已验证且兼容的插件与支持包，包括新增插件。复用的是不变 tgz 字节，不能因此冻结安装器内的插件版本。先独立构建/打包变化插件、同步组合/profile，再运行 pnpm package:stable:win。该入口检查最新快照及实际闭包版本；stage 过期会增量装配，未变化插件沿用原归档，不强制重编。

共享清单比源码新时先同步对应源码，不允许打包静默降级或丢包。单插件打包合并共享最新清单，保留其他插件的最新记录。完整离线闭包需要随安装器集成；tgz 不为每个桌面版本重复复制，也不在安装器里额外存一套。

具体签名变量、资源定向合并、验收与发布顺序见 [开发指导](codex-development-guide.zh-CN.md)。本次仅更新后续流程和脚本，保留已发布 8.3.0 的安装包、build ID、SHA-256 和线上更新指针。
# 动态插件安装与卸载（8.3.2）

8.3.2 已默认启用配置 HMR，无需用户额外操作。对于自定义 DSH Web profile，可在该 profile 的 `cordis.patch.yml` 中加入下列配置并重启一次 Host：

```yaml
- id: hmr
  disabled: false
  config:
    root: []
```

`root: []` 只开启配置重载，不监听工作区与会话文件。官方插件管理器可动态安装、启停、卸载满足生命周期契约的插件。已加载代码的版本替换由 ZeroWall 的候选 profile 和 Host 重启流程处理；固定版本、禁用、移除和第三方插件选择会保留。
