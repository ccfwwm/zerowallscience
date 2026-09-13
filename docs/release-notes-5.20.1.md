# ZeroWall Science 5.20.1

## 本次更新

- 修复 FigureYa 紧凑 MCP 对常见动作名和参数形式的兼容，包括源码读取、文件列表、计划创建和产物查询。
- 修复 FigureYa 任务返回 `job_id` 后无法等待的问题，`job_id` 现在可直接作为运行 ID 使用。
- 修复旧会话调用 `mcp__rmcp__r_files` 时被能力策略拦截的问题；兼容入口仅在原会话执行范围内生效，不重新暴露到新请求的工具列表。
- 修复 FigureYa 服务器源码和示例文件无法下载到本地工作区的问题；下载使用 Manifest 和分片，本地写入后仅返回路径与校验信息。
- 修复 `capability_execute` 调用聚合 MCP 工具时扁平参数未装入 `arguments` 的问题。
- 更新科研提示词中的 FigureYa 文件下载和任务 ID 规则。

## 兼容性

- 新会话继续使用紧凑工具面和 `capability_search`、`capability_execute`，不恢复旧 MCP 工具名称。
- 大文件和图片不会自动作为 base64 或图像内容进入模型上下文。
- 保留现有会话、项目、附件和凭据，不迁移或清理用户数据。
- Windows x64 稳定版安装包版本为 5.20.1。
