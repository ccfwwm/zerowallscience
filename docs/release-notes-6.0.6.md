# ZeroWall Science 6.0.6

## 中文

- 内置 MIT 许可的 `dsh-zotero@0.8.4`，提供 Zotero 文献检索、条目与笔记读取、证据提取、引用导出、设置页及会话文献工作区。
- 使用官方 npm 发布包并通过锁文件固定完整性；来源与许可证记录在 `config/integrations/upstream-sources.json` 和 `THIRD_PARTY_NOTICES.md`。
- 打包时适配 `/zotero status` 的命令注册字段，兼容当前固定的 DSH rc.2 接口。
- Zotero 工具继续经过现有 Progressive Tools 发现/分发和 6.0.5 上下文治理链路。
- 保留已有 HuanLin Office 预览插件。本版不包含 Fylar Office Editor 或其商业 SDK。

使用前安装并启动 Zotero 7 或更高版本，在 Zotero「设置 → 高级」开启「允许此计算机上的其他应用程序与 Zotero 通信」。ZeroWall 的 Zotero 设置页默认连接 `http://127.0.0.1:23119/api`。本地读取无需 API Key；插件启动不会后台扫描文献库。安装后新建会话使用 Zotero 工具。

## English

- Bundles the MIT-licensed `dsh-zotero@0.8.4`: library search, item/note reading, evidence retrieval, citation export, settings, and a conversation sources workspace.
- Uses the official npm release with lockfile integrity and recorded upstream provenance.
- Adapts the `/zotero status` registration field at packaging time for the pinned DSH rc.2 commands API.
- Keeps Progressive Tools discovery/dispatch and the 6.0.5 context controls in place.
- Retains the existing HuanLin Office viewer. Fylar Office Editor and its commercial SDK are not included.

Start Zotero 7 or later and enable **Allow other applications on this computer to communicate with Zotero** under **Settings → Advanced**. The ZeroWall Zotero settings default to `http://127.0.0.1:23119/api`. Local reads require no API key. Loading the plugin does not scan the library in the background. Create a new conversation after upgrading.
