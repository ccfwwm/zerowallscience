# ZeroWall Science 6.2.1

## 中文

- Python 环境改为独立进程后台更新，支持流式解压、断点恢复、快照切换与回滚，保护正在运行的任务；解释器保持 3.12.10。
- 修复环境更新后版本和依赖清单不同步的问题。依赖采用可滚动列表，支持逐包检查、升级预览、兼容性验证和版本恢复。
- 修复“设置 > 插件 > 插件配置”中 Free Search 配置卡不显示以及展开后因残留自更新引用而崩溃的问题。设置卡现在只依赖稳定的 `slots` 服务，搜索引擎快捷命令仍在 `commandUi` 可用时按需注册。
- 移除文件审查设置卡中的 GitHub Star 跳转、推广文案及相关样式，保留差异布局和自动换行配置。
- 延续 6.2.0 的 OpenCode Zen Free、模型检测、科研工具、Office 与会话生命周期能力，默认模型保持不变。

## English

- Update Python environments in a dedicated background process with streaming extraction, resumable downloads, snapshot activation, and rollback while protecting running tasks. Python remains at 3.12.10.
- Keep the active environment version and package inventory in sync. Add a scrollable dependency list with per-package update checks, change previews, compatibility validation, and version restoration.
- Restore the Free Search configuration card under Settings > Plugins > Plugin Configuration and fix its expansion crash caused by stale self-update references. The card now depends only on the stable `slots` service, while the engine command registers when `commandUi` is available.
- Remove the GitHub Star promotion, link, copy, and styles from the File Review settings card while preserving diff layout and word-wrap controls.
- Retain the OpenCode Zen Free catalog, model checks, research tools, Office integration, and session lifecycle behavior introduced in 6.2.0. The default model is unchanged.
