# ZeroWall Science 8.0.8 架构

8.0.8 恢复完整离线默认功能，同时保留插件独立分发。DSH 固定为 `86b6740d0e671cee0b3fd0168de484c0efbf46ea`，不因本次修复升级。

## 分发与加载

- `app.asar/node_modules`：五个 Core 插件及 DSH/桌面宿主闭包。
- `resources/offline-profile/modules`：全部默认领域插件、第三方适配器、支持库和原生/前端资源。
- `resources/offline-profile/packages`：独立签名目录引用的插件 tarball。
- `resources/extensions/skills`、`extensions/mcp`、`extensions/capabilities`：默认 Skills 和小型科研启动资源；大型 Python 环境继续按需安装。

安装器的离线 receipt 绑定 build ID、应用版本、DSH commit、目标平台、插件身份及每个文件的大小和 SHA-256。首次启动验签后复制至用户拥有的不可变 generation，不运行网络包安装。profile 链接到此固定 generation；Core peer 通过共享解析器解析，保持 Cordis/DSH 服务身份一致。

离线文件校验和 generation 复制最多并发处理 16 个文件。复制严格消费验签后的清单，逐项复核目标大小和 SHA-256，完成后才原子激活缓存；避免 Windows 逐文件串行复制阻塞首次启动。

## architecture 7 修复

保留旧 profile 和全部自定义文件，补齐未被用户明确停用、卸载的默认插件。在 candidate profile 中补缺配置和插件，写事务 journal，停止原 Host，原子切换并启动真实 Host 健康检查。通过后写完成 receipt；失败恢复原 profile，保留失败 generation。中断由 journal 恢复。固定版本缺包且离线没有精确版本时阻止激活并提示操作，不自动解除固定。

## 扩展中心

位于设置，负责资源生命周期；MCP、Python、环境变量及科研引擎保留领域配置入口。四组列表独立读取、显示和报错，区分包存在、用户启用选择、实际激活和固定版本。本地读取最多 5 秒，人工检测每组最多 15 秒，并有去重和旧结果保护。

打开、切标签和本地刷新不检查远端，启动/每日扩展检测默认关闭。人工检测仅获取验签 metadata；更新使用现有候选事务和回滚。桌面安装器更新策略保留。

## 验收边界

原始 ASAR 必须排除可选插件代码；完整功能验收同时读取并验签离线闭包。安装包检查不能代替真实 Host/Electron 测试。验证断网启动、中文路径、旧用户升级、损坏 profile 修复、用户选择保留及失败回滚，证据记录到功能对照报告。
