# ZeroWall Science 8.2.1

本版本修复计划侧栏无法读取的问题：停用并移除 Progressive Tools 的本地源码和有效插件注册，恢复 DSH 原生工具调用路径。`exit_plan_mode` 现在直接写入 DSH 可识别的计划调用记录。

- 将受影响的官方 Skills、研究工作流、R/Python/MCP 和文件工作流迁移到 DSH 原生工具名。
- 删除 `@everclear077/dsh-progressive-tools` 的仓库源码、workspace、锁文件和 profile/inventory 注册；保留历史会话的 routed 日志读取兼容性。
- 保留 `@zerowallscience/dsh-bundle-science` 组合声明，仅移除其中已删除插件配置。
- 更新 MCP、Skills、扩展中心和桌面版本合同至本版；DSH 继续固定在 `4af4cb76935bd893a6854f38403bd06928878074`。
- 将 AI 云平台插件更新目录与最新归档统一到 `@zerowallscience/plugin-ai-cloud@0.1.16`，扩展中心保持最新 `0.1.12`，各插件继续独立发布，桌面版本保持 `8.2.1`。
- 为依赖闭包或客户端产物已经变化的 11 个第一方插件和 3 个 DSH 适配包递增独立资源版本，保留已发布同版本归档的原始字节。
- 组合包因纳入新的通知插件资源版本递增至 `@zerowallscience/dsh-bundle-science@0.1.15`。
- 修复扩展更新候选 profile 引用旧版安装产物的 `file:` 依赖时更新失败：根据已验签目录解析对应资源，校验后写入内容寻址缓存，并同步修复候选 profile 与锁文件中的失效路径。
- 本机用户 Skills 的旧路由迁移保留原版本、固定和启用状态，并在替换前生成逐项备份和迁移记录。

完整 Windows x64 构建、原生计划回归、Skills 迁移收据和资源发布状态以 `artifacts/verification/8.2.1/` 与 `artifacts/release/8.2.1/` 中的实际收据为准。
