# ZeroWall Science 8.4.0

Windows 稳定版；安装器已由用户完成本地升级与功能确认，本次发布使用同一份安装器字节。

## 插件安装与修复

- 插件安装、更新使用独立候选和安装源，避免自引用 link 导致 pnpm 删除其他插件。
- 缺失插件与受管依赖优先从安装器的签名离线供给恢复；固定版本、第三方插件、禁用状态和用户配置继续保留。
- 候选通过入口、依赖链接、兼容性与 Host 健康检查后切换。失败、取消和崩溃使用事务日志恢复，保留单插件回滚。
- 插件列表显示实际安装版本与加载状态。
- 插件签名和已安装文件摘要差异改为警告，避免旧收据阻断安装；入口完整性、路径边界和失败回滚继续检查。
- 升级时同步替换已安装的受管支持包及旧导入收据，修复 Zotero 支持包遗留旧 DSH exact-runtime 要求导致启动失败的问题；支持包不加入启用列表。
- 受管插件直接使用当前安装包的兼容闭包，避免旧正式版与适配版的版本排序留下旧运行时；保留用户自行安装的 dsh-context 等第三方插件。
- 新版 DSH 生成的 remote-info 客户端辅助代码随所属插件内联，修复插件加载时 missed the module table。
- Dream Skin 改用新版 DSH Connection 服务校验外观持久化请求，修复等待已移除的 webRuntime 服务而触发回滚及 Plugin management timed out。

## Windows 图标

- 窗口使用多尺寸 ICO，统一 EXE、窗口和快捷方式的 Windows 应用身份。
- 安装提交前恢复新文件的权限继承，使普通 Windows Shell 能读取应用与图标；不修改 Python 和用户数据权限。

## DSH 与资源

- 升级至 DSH dsh-v0.2.1-rc.2，并保留 ZeroWall 的附件、导航、会话删除、Reviewer 历史、模型设置与桌面插件管理适配。
- 更新 Sidebar、File Review、WeChat、SSH Ops、Dream Skin、Free Search、Session Notification、Archive Manager、Oh Story、PPT Maker 与 Office 支持包。具体版本和提交见 config/integrations/upstream-sources.json。
- PPT Maker 与 DSH 统一使用 LibreOfficeKit 0.1.5，复用同一份转换引擎依赖。
- 共享图像运行时统一为 Sharp 0.35.5，版本范围由配置定义，避免多套原生库混载。
- 已集成的 Academic Research Skills 来源更新至 3.23.1，共享参考资料使用独立支持资源，避免重复复制。

## 构建

- 稳定入口固定为 pnpm package:stable:win，版本和说明由 config/build/desktop-release.json 定义。
- 复用内容缓存、不可变资源归档与硬链接；安装器保留完整离线插件集合。
- 增量打包始终刷新当前 commands，避免复用旧 stage 时漏装配启动修复脚本。
- 本地验收阶段关闭构建后自动清理，保留 8.3.6 安装器和回滚证据。
