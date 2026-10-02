# ZeroWall 8.0.2：插件、Skills 与 MCP 单独更新教程

## 先升级桌面一次

7.5.0 及更早桌面没有完整的独立资源桥接，需要先在“设置 → 关于/更新”检查并升级到 8.0.2。关闭旧程序后，也可以运行 [七牛安装包](https://zerowall.chengxunkeji.cn/stable/releases/8.0.2/zerowall-science-8.0.2-win-x64.exe) 覆盖安装。不要手动删除用户数据目录；账户、模型、项目和自定义配置由原目录继续使用。

升级后启动桌面，重新打开一个 PowerShell 窗口：

```powershell
dsh --version
zws --version
zws help
zws doctor
zws plugin list
```

`dsh` 应显示 `0.2.0-rc.2`，`zws` 应显示桌面 `8.0.2`。`zws doctor` 会报告实际加载的插件版本和来源。命令需要正在运行的桌面 Host；若提示先启动 ZeroWall Science，请启动应用后再操作。

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
zws plugin rollback plugin-files
```

完整包 ID 也可以使用，例如 `@zerowallscience/plugin-files`。需要的自有依赖会一起准备和验签，随后通过 candidate profile 和 Host 健康检查切换；不重新下载整个桌面安装包。

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

## 七牛与 GitHub 资源

官方客户端默认目录：

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

源码总仓库保存 `plugins/`、`skills/`、`mcp/`、签名 `catalogs/`、构建工具及来源收据。8.0.2 桌面主仓库保留当次集成源码以重现历史构建；后续扩展改动在总仓库开发，集成桌面时同步固定提交，不在两边手工重复修改。

1. 只提升改动资源的 semver，并更新它的兼容范围；不能更改已发布同 ID/版本的字节。
2. 构建选定插件、执行对应测试和 `pnpm pack`；Skills 使用确定性 tar，MCP 配置/Server 分别打包。插件私有资源必须进入 tarball，发布依赖不能含 `workspace:` 或 Git 源依赖。
3. 用正式 Ed25519 密钥签署资源条目、catalog 和指针；密钥仅放本地忽略目录或 GitHub Secrets。`stable-3` 公钥已经内置于 8.0.2，不能发布开发签名。
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

桌面发布使用独立的 `publish-desktop.mjs stage|promote|verify`。独立资源脚本不会改变桌面更新指针。
