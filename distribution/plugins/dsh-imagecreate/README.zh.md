# @zerowall/dsh-imagecreate

[English](README.md) | 中文

## 摘要

提供生图 Skill、generate_image、edit_image 和结果展示。图片模型、质量、比例与尺寸由生图插件配置管理；缺少必要尺寸时在提交生成前报告错误。

## 使用

ZeroWall Desktop 根据安装清单选择此包。在插件页检查状态和插件提供的配置。验证基线为 DSH 0.2.2-rc.1 和 Node.js 24.9 或更新版本。更新时保留已有配置与数据。

桌面安装包将内置 Skill 资源保留在 ASAR 外，并在打包前校验必要文件。Skill 从已安装的插件目录加载，不向用户文件夹复制说明。

详细工作流及历史平台要求见[保留的迁移参考](migration-reference.md)。当前依赖版本以包清单为准。

在“生图配置”或本插件详情中选择模型、分组、质量与协议参数。生成、编辑和 PPT 共用 `zerowallImageSettings`，视频图片参考通过延迟注入读取。设置原子写入 `DSH_HOME/zerowall/imagecreate/settings.json`，`home` 可覆盖 DSH 主目录。首次加载备份旧环境及媒体图片设置，已有选择标记为用户设置。组合配置声明 `preferredGroupName` 和 `preferredModelId`，仅从真实、可用且唯一匹配的路由初始化默认模型。手动保存后，登录、同步和重启均保留模型及参数；路由缺失或不唯一时提示选择，不替换为其他模型。

## 开发

在仓库根目录构建并检查压缩包：

```sh
pnpm run zerowall:build
pnpm run zerowall:pack
```

再发行时保留包内 LICENSE 及第三方声明。
