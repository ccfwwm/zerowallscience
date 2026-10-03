# ZeroWall Science 8.0.3

## 变更

- 移除旧的第三方 `dsh-auto-review` 集成，统一使用 DSH `0.2.0-rc.2` 自带的 `@deepseek-ai/dsh-experimental-auto-review`。
- 删除未进入正式运行时的 `@daweifu/capability-menu` 源码和构建入口。
- 增加 profile 迁移，升级旧的 7.5/8.0.x profile 时移除旧审查插件的 bundle、依赖和选择记录。
- 保留账户、模型、项目、Skills、MCP 和其他插件配置。

## 发布状态

Windows x64 安装包已发布至七牛云 Stable 更新源和 GitHub Release `v8.0.3`，桌面更新指针已指向本版本。
