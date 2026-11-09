# @zerowall/dsh-videocreate

[English](README.md) | 中文

## 摘要

保留视频、音乐、参考素材、持久任务和本地合成。插件页保存视频与音乐模型及 JSON 参数，保留其他类别配置。生成需要可用模型与账号权限；本地合成需要管理运行时中的 FFmpeg。

## 使用

参考图创建的图片默认设置归属生图插件。本插件延迟读取 `zerowallImageSettings`，已保存路由不可用时不随意选择第一个图片模型。已有任务继续使用记录中的模型和参数。

ZeroWall Desktop 根据安装清单选择此包。在插件页检查状态和插件提供的配置。验证基线为 DSH 0.2.2-rc.1 和 Node.js 24.9 或更新版本。更新时保留已有配置与数据。

桌面安装包将内置 Skill 和合成脚本保留在 ASAR 外，并在打包前校验必要文件。合成使用 Python 依赖服务，从已安装的插件目录定位脚本。

详细工作流及历史平台要求见[保留的迁移参考](migration-reference.md)。当前依赖版本以包清单为准。

## 开发

在仓库根目录构建并检查压缩包：

```sh
pnpm run zerowall:build
pnpm run zerowall:pack
```

再发行时保留包内 LICENSE 及第三方声明。
