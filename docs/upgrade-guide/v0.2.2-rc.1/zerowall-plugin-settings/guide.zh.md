---
kind: upgrade-guide
description: "ZeroWall 生图设置移入生图插件，Desktop 显式提供受管 Claude 运行路径。"
---

# ZeroWall 插件设置

[English](guide.md) | 中文

## 变更

生图配置归属 `@zerowall/dsh-imagecreate`。环境 Remote 的 `setImageModelSelection` 和 `setImageQuality` 已移除，媒体选择写入不再接受 `image`。生图消费者使用 `zerowallImageSettings`，接口和类型从生图包的 `./remote` 与 `./types` 入口导出。已有任务记录继续使用任务保存的模型和参数。

Desktop 在加载 profile 前提供 `ZEROWALL_DESKTOP_RUNTIME_ROOT`、`ZEROWALL_DESKTOP_PNPM_ENTRY` 和 `DSH_DESKTOP_NODE_EXECUTABLE`。Claude 安装使用这些路径及 `DSH_HOME` 下的隔离运行目录，不支持旧桌面标记变量和猜测的 pnpm 布局。启用后自动准备 CLI；用户明确卸载后，重启也不会自动装回。

插件使用说明显示在所属插件详情中，名称、注册表发现、优先级和启停策略保持一致。独立、项目和导入的 Skills 继续显示在 Skills 管理器。

## 迁移

1. 同步更新 ZeroWall 插件组，并使用包含运行路径初始化的新 Desktop 构建；单独更新 npm 插件不能给旧 Desktop Host 增加此逻辑。
2. 打开生图插件配置。首次加载备份并迁移环境插件中的生图选择，写入 `DSH_HOME/zerowall/imagecreate/settings.json`；原选择为空时，依据真实目录解析已保存的媒体图片选择。已有选择按用户设置保护。新用户的自动默认值来自组合配置指定的分组和模型，保存选择后自动同步不再覆盖。
3. 自定义调用方改用 `zerowallImageSettings.get()` 和 `.save({ selection, quality })`。视频、音乐和语音继续使用环境服务，不再向环境服务写入生图选择。
4. 打开 Claude 设置查看真实 CLI 版本，准备失败时使用安装或修复。`runtimeRoot` 或 `ZEROWALL_CLAUDE_RUNTIME_ROOT` 可覆盖数据目录，`version`、`registry` 和 `autoInstall` 配置受管准备过程。可执行文件通过版本探测后才显示就绪。
5. 在所属插件的“使用说明”中管理说明；开关表示是否向模型提供说明，与插件启停独立。`providerOwners` 将官方 provider 映射到所属 npm 包，无需修改官方包。
