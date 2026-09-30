# ZeroWall Science 7.4.0 发布说明

## Harness 与 Zotero

- 内置 DeepSeek Harness 升级至 `dsh-v0.2.0-rc.2`，保留 ZeroWall 定制集成。
- 修复 Zotero 本机状态和授权接口的路由校验，并改善非 JSON 错误响应的提示。
- 修复删除会话返回 404：删除操作先由 Host 锁定目标会话，再移入系统回收站并提交索引；中断后可恢复。
- 搜索插件直接升级至 `dsh-free-search@0.6.0`。
- Free Search 的配置进入可编辑的 Web profile，现有用户配置继续保留。
- 侧边栏升级至 `dsh-better-sidebar@0.24.1`，保留 ZeroWall 原有的工作区文件访问围栏。
- Dream Skin 升级至官方 `v9.29.0`，默认使用其 iOS 扁平主题，不再植入紫色壁纸；手选主题和自定义壁纸继续保留。File Review 升级至 `v0.8.5`。
- 移除多余的 Sidebar Icons 和旧 Better Sidebar Office 预览插件。

## 桌面界面

- 将 Windows 顶部拖动和双击最大化/还原限制在标题空白区域，恢复右侧栏按钮的点击操作。
- 统一左下角 GitHub、微信和 AI 平台入口样式，并显示对应连接状态。
- 外观标题随界面语言显示“外观”或“Appearance”；设置页可直达 Free Search、File Review 和 Sidebar 文件预览配置。
- File Review 在插件页只显示一个配置入口，自动换行等设置可保存到用户配置。
- 修复 Windows 麦克风权限识别；系统禁用麦克风时提示打开 Windows 隐私设置。
- 历史文件卡片支持预览、复制文件和重新添加到当前对话。
- 点击历史文件卡片即可预览，也可将卡片拖回当前对话输入框重新添加。
- 首次打开默认跳过内测欢迎提示和自动 API Key 引导；密钥仍可在设置中手动配置。
- MinerU 支持当前会话的 `sha256:` 附件和工作区外的绝对路径普通文件；相对路径仍限定在当前工作区。
