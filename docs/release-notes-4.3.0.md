# ZeroWall Science 4.3.0

## DSH-better-sidebar 默认工作台

- 默认集成并锁定 `dsh-better-sidebar@0.16.0`，兼容当前 DSH `0.1.1-rc.2`。
- 依赖对应上游 `v0.16.0` tag，锁定提交 `e18528b716bfbbda9dfb1509b390e2cdb2deaaad`，不跟随 `main`。
- 保留 DSH 原生左侧会话栏，同时提供右侧栏与底部面板。
- 内置文件资源管理器、编辑器、Markdown/HTML/PDF 预览、终端、Git、浏览器、子代理任务和自由窗口。
- ZeroWall 项目、研究、审查、账户、AI Cloud、MCP、Skills、图像、执行、运行、出版物、演示文稿、Web Search、微信页面以独立 `zerowall:*` Tab 注册。
- 继续使用 ZeroWall Files Host 的附件解析和持久化边界，不复制文件处理实现。

## 兼容性与体验修复

- 恢复无工作区直接对话、项目文件夹选择、MCP 环境初始化、中文权限名称与默认完全权限。
- 恢复附件选择和文件拖放；普通附件以紧凑文件卡片展示，可在 better-sidebar 中打开，并支持复制文件。
- 修复附件 Remote 返回值解析和 Attachment Viewer 的服务注入，避免 `cannot get property "remote" without inject` 与 `zerowallFiles.inspect failed`。
- 模型可用性检测总预算调整为 120 秒，按提供商限制并发，并区分超时、限流、认证、临时上游故障和明确不可用。
- 模型检测状态由 Host 统一持久化，在设置页和对话模型选择器之间保持一致；未知视觉能力不再被模型名称规则提前拒绝。
- 恢复微信入口、附件按钮、工作区权限按钮与 ZeroWall Science 品牌显示。

## 发布边界

- 发布 Stable Windows x64 安装包，并同步更新七牛云 Stable 元数据。
- 源码提交到 GitHub，创建 `v4.3.0` Tag 与 GitHub Release，并附带 Windows 安装包和 blockmap。
- 应用内更新仍以七牛云为唯一更新源，GitHub Release 仅作为源码与安装包下载渠道。
