---
kind: upgrade-guide
description: ZeroWall Windows 电脑操控插件使用新的 npm 包名。
---

# Windows 电脑操控插件包名

[English](guide.md) | 中文

## 变更

ZeroWall Windows 桌面端使用 `dsh-computer-use-win` 的后继包 `@zerowall/dsh-computer-use-win`。迁移到新默认值时会启用一次，包括已升级到 0.1.13 的 profile。插件配置项和工具名沿用原有名称。

## 迁移

1. 在 ZeroWall Windows 桌面版 9.1.13 打开设置 → 更新，将 ZeroWall Science 插件组合更新到 0.1.15 或更高版本，按提示重启。
2. 等待桌面端安装或更新 `@zerowall/dsh-computer-use-win`，再重启一次。确认插件开关已开启，设置页也能打开。桌面版 9.1.13 将下载的包显示在「已安装插件」。随附替代包的宿主会把开关归入「内置插件」。迁移会备份改动的配置文件，并保留此后对开关的更改。
3. 对于手动维护的其他 Windows DSH profile，从对应 profile 移除 `dsh-computer-use-win` 并添加 `@zerowall/dsh-computer-use-win`。有按包名声明的自定义配置时，更新包名。
