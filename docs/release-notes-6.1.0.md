# ZeroWall Science 6.1.0

## 中文

- 修复 Zotero Harvest 凭据标识以数字开头时在请求授权前报错的问题；兼容迁移已存在的合法旧标识。
- Zotero 设置新增“自动获取本机授权”与重新授权，直接调用本机 Zotero 授权接口，状态与 lit_save 共用，无需手工填写密钥；授权拒绝可重试。
- 会话菜单新增“删除会话”，默认取消的原生二次确认框；将选中会话记录移入系统回收站，刷新工作台，保留工作区文件和其他会话。运行任务期间不允许删除。


- 融合 Zotero Harvest：对话内多源检索、开放获取链接解析、原生授权入库、DOI／标题去重、分类和 PDF 附件保存；已入库条目进入 Zotero 列表。离线待导入文件与成功入库明确区分。

- 启动页仅展示状态，移除日志和重启按钮，增加连续流光与呼吸动画，动画独立于阶段进度更新；托盘重启保留。
- Zotero 概览按选中文献直接查询本机 Zotero，显示作者、期刊、DOI、标签、分类和摘要；无摘要与读取失败分别显示真实状态。
- 修复“在 Zotero 中打开”的 Windows 协议调用；“问这篇”填入草稿后自动切换到对话；引用直接由 Zotero 生成，支持格式选择、复制和下载。
- 修复文件审阅插件覆盖用户消息后复制按钮绕过桌面剪贴板的问题，统一使用桌面复制接口并验证实际写入。
- 设置页面统一中英文适配：AI 云平台、Python 环境、SSH 资源及编辑窗口、关于页面随语言设置即时切换，修复英文模式中残留中文导航、说明和按钮。
- 修复单细胞插件三个工具参数定义与当前 DSH schema 的不兼容，并使子服务启动失败正确上报，避免插件显示已加载而接口不可用。
- 修复保存 SSH 资源后再次启动卡住：持久化配置允许未设置的项目目录为 `null`，保留原有服务器与凭据。
- 启动检查必须等到已认证的工作台页面就绪；插件启动失败会显示具体原因并停止残留 Host，不再把 HTTP 401 当作成功。
- 启动页展示阶段进度与耗时；先显示启动页，再检查本地数据，已有用户不再每次遍历旧版数据目录。
- 工作台显示后才后台连接已启用 MCP，自动启动最多同时连接两个服务；托盘菜单增加“重启”，退出旧 Host 进程树后重启应用。
- 集成 MIT 许可的 `dsh-ssh-ops@0.3.8`，提供 SSH 终端、SFTP、端口转发、批量运维和 MySQL/PostgreSQL/Redis/MongoDB 管理能力。
- SSH 凭据继续由 DSH 本机凭据库托管，危险命令和高危 SQL 保留插件的确认闸门；插件来源、版本、提交和许可证记录在 `config/integrations/upstream-sources.json`。
- Windows 桌面版通知改为 Electron 原生桌面通知，不再依赖浏览器通知授权。通知保留设置页中的提示音、音量和通知范围；点击右下角通知会恢复 ZeroWall 窗口并打开对应会话。
- 为稳定版设置 Windows AppUserModelId，确保通知能进入 Windows 通知中心并使用 ZeroWall 图标。
- 修复工具转发丢失 Zotero 结构化展示元数据的问题，新检索结果随日志持久化；旧日志从实际检索工具输出恢复文献列表，并修复结果更新时的缓存失效。
- SSH 改为正式主区域标签，正确切换到终端工作区；独立侧栏入口保留。输入框仅在对话标签显示，切回仍保留草稿。
- 修复 Zotero 附件批注读取静默为空的问题；附件级 Local API 请求现在显式使用 `itemType=annotation`，`zotero_children` 和 `zotero_retrieve({ sources: ['annotation'] })` 可以读取批注。

## English

- Fix numeric-leading Zotero credential identifiers preventing native authorization, and migrate valid legacy identifiers.
- Add Get local authorization / Renew local authorization to Zotero Settings, sharing managed credentials with lit_save and supporting retry after denial.
- Add Delete session with a native confirmation that defaults to Cancel. Move only the selected session records to the Recycle Bin and refresh the workbench; running tasks block deletion.


- Integrate Zotero Harvest with live DSH settings, authenticated native writes, DOI/title deduplication, collections, and PDF attachments. Confirmed saves appear in the Zotero tab; offline inbox files remain explicitly pending manual import.

- Make the splash display-only with continuous compositor animations and real stage progress; retain Restart in the tray menu.
- Load selected Zotero item details directly from the local API. Open Zotero through its Windows protocol, switch to Chat for item questions, and generate citations with copy and download actions.
- Route the file-review user-message copy button through the native desktop clipboard and verify the write before reporting success.
- Localize AI Cloud, Python environment, SSH resources and editors, and About. Navigation and page contents update immediately when the language changes.
- Fix three single-cell tool schemas for the pinned DSH runtime and propagate child-service startup failures to the plugin loader.
- Fix startup failure with saved SSH profiles containing a null project directory, authenticate Host readiness, and surface actionable startup errors. Load optional MCP connections after the workbench appears, and add Restart to the tray menu.
- Integrates MIT-licensed `dsh-ssh-ops@0.3.8` with SSH terminal, SFTP, port forwarding, batch operations, and MySQL/PostgreSQL/Redis/MongoDB tools.
- SSH secrets remain in the DSH local credential store. The plugin's destructive-command and high-risk SQL confirmation gates stay enabled; provenance is recorded in `config/integrations/upstream-sources.json`.
- Windows desktop builds now use Electron native notifications instead of the browser Notification permission. Existing sound, volume, and scope settings remain active; clicking a toast restores ZeroWall and opens its conversation.
- Stable Windows builds set an AppUserModelId so notifications use the Windows notification center and ZeroWall icon.
- Preserve Zotero presentation metadata across tool dispatch and session replay; recover legacy literature lists from rendered search tool results and refresh cached rows when results change.
- Register SSH as a real main conversation view with a separate sidebar utility. Show the composer only in Chat while preserving its draft across view changes.
- Fixed silent empty annotation results by adding the required `itemType=annotation` filter to attachment-level Local API requests used by `zotero_children` and `zotero_retrieve({ sources: ['annotation'] })`.
