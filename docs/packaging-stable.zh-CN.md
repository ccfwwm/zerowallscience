# 稳定版打包固定流程

Windows 正式入口固定为 `pnpm package:stable:win`，普通 `package:win` 也指向此入口。Mac 普通入口同样使用 stable 配置；不默认生成 preview 安装器。

## 每次发布修改配置

| 信息 | 唯一编辑入口 |
| --- | --- |
| 桌面版本、产品描述、说明文件模板 | `config/build/desktop-release.json` |
| 稳定渠道、Windows 目标、签名文件引用、发布地址、保留数量 | `config/build/stable.json` |
| 已审查的 NSIS 工具版本和模板摘要 | `config/build/nsis-adaptation.json` |
| 共享原生依赖的兼容版本范围 | `config/build/runtime-dependencies.json` |
| 插件签名与已安装内容的校验模式 | `config/catalogs/plugin-verification.json` |
| 本地插件版本、描述、兼容范围和依赖 | 对应 `plugins/<id>/package.json` 与插件声明 |
| 上游插件来源及适配版本 | `config/integrations/upstream-sources.json` |
| DSH 版本、tag、fork 与上游完整提交 | `config/deepseek-harness/upstream.json` |
| Skill 独立版本 | `config/catalogs/resource-versions.json` |
| MCP 模板及 SciMaster 包版本 | `config/catalogs/mcp-catalog.json`、`config/catalogs/mcp-server-bundles.json` |

例如下次桌面升级，在 desktop-release.json 设置新稳定版本并准备对应 release notes，然后执行：

```powershell
pnpm release:sync
pnpm plugins:generate
pnpm profiles:generate
pnpm version:check
pnpm profiles:check
pnpm dsh:verify
pnpm package:stable:win
```

正式打包不要求提权 PowerShell。签名配置默认引用已有的忽略文件，私钥内容不进入配置和日志；显式环境变量仍可覆盖签名引用和发布地址。版本同步不会提升插件、Skills、MCP 或 Python 的独立版本。新增原生插件按现有插件/profile 声明纳入完整共享清单。8.4.4 必须携带 config/python/bundled-bootstrap.json 固定的已发布签名 Python + pip 基础包；完整科学依赖仍由桌面可用后的后台队列安装。

组件编译后、运行时装配前，固定流程会用实际编译文件预检全部运行时适配器及 JavaScript 语法；菜单、预览、目录选择器或上游结构变化时先失败，不生成缺补丁的载体。LibreOfficeKit 的审核版本同样由 `upstream-sources.json` 定义，结构锚点继续严格检查。

已有同版本安装器时，入口立即拒绝覆盖。检查现有产物或提升桌面版本；不要删除已发布安装器来强行重打。桌面仅换版本时，无须修改打包脚本或统一提升插件版本。

## 复用和存放

插件使用 `artifacts/release/plugins` 的完整已验证清单。Skills/MCP 不可变归档保存在 `artifacts/release/resource-packages/<kind>/<id>/<version>`，桌面 release 路径硬链接到同一文件。内容变化必须提升资源版本，不能复用旧 ID/版本写入新字节。

运行时代码、离线载体和 Skills/MCP 资源树按内容缓存；相同文件通过 `artifacts/objects/sha256` 共享。桌面版本戳仅替换新 stage 中少量文件。每个 stage 有独立收据和 build ID，当前指针只在构建成功后切换。硬链接保留普通文件路径，删除一个历史 stage 不会删除其他链接仍引用的内容。

正式结果始终写入 `artifacts/packages/<version>/<target>`。安装器需要完整离线闭包，因此每个发布版本仍有自己的安装器；本地展开树与组件归档共享存储。共享缓存的完整性检查失败时停止使用该缓存，不能跳过摘要校验。

## 空间保留

`stable.json` 的 `retention.afterPackage` 控制成功打包后是否自动运行受控清理，`keepDesktopVersions` 控制保留的桌面版本数。8.4.0 本地验收期间分别设置为 `false` 和 `2`，保护 8.3.6 的安装器与回滚证据。每个保留版本留下一个成功 stage、每类一个最近缓存，以及当前 stage 仍引用的缓存。失去全部外部硬链接且没有活动引用的内容对象保留一天宽限期，历史清理报告不会使它永久保留；下一轮 GC 回收符合条件的对象。普通清理按 TTL 保留近期失败 stage，显式 `--prune-incomplete` 立即回收失败和未完成 stage。克隆来源 ID 是溯源记录，不要求保留完整源 stage；当前分发包的持久引用仍受保护。共享插件/资源归档、开发依赖、签名文件和用户数据独立保留。

需要立即清理失败或未完成 stage 时：

```powershell
pnpm artifacts:gc --dry-run --prune-incomplete --output artifacts/verification/8.3.6/cleanup-plan.json
pnpm artifacts:gc --apply --plan artifacts/verification/8.3.6/cleanup-plan.json
```

将示例中的验收目录换成当前版本。执行前重验路径归属、活动构建、当前指针和文件身份；变更过或无权限的目标跳过并写入清理收据，不会把部分清理报告成完整成功。

打包不等于发布。公网七牛/GitHub 发布仍须用户明确授权，并遵循开发指南中的公开下载与 SHA-256 验证流程。
