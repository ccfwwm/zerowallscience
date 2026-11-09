# @zerowall/dsh-plugin-brand-ui

[English](README.md) | 中文

## 摘要

通过公开界面插槽和主题服务提供 ZeroWall 标识与配色。侧栏与空白会话标题显示 `ZeroWall Science`，品牌首页不显示预览版标签。首页标题需要 ZeroWall Desktop 提供的 `conversation.hero.brand.title` 插槽。窗口、安装器和更新流程由桌面应用维护。

明暗语义变量统一背景、文字配色、边框、主操作与侧栏选中态。新的 Science profile 默认浅色，已保存的主题选择优先。Windows 外壳读取独立的 `--dsw-specific-titlebar-fill`，并在原生标题栏按钮上合成弹窗遮罩色。插件保留现有标识。

## 使用

ZeroWall Desktop 根据安装清单选择此包。在插件页检查状态和插件提供的配置。验证基线为 DSH 0.2.2-rc.1 和 Node.js 24.9 或更新版本。更新时保留已有配置与数据。

详细工作流及历史平台要求见[保留的迁移参考](migration-reference.md)。当前依赖版本以包清单为准。

## 开发

在仓库根目录构建并检查压缩包：

```sh
pnpm run zerowall:build
pnpm run zerowall:pack
```

再发行时保留包内 LICENSE 及第三方声明。
