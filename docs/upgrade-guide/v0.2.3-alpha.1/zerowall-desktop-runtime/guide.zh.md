---
kind: upgrade-guide
description: "使用旧版 Host 协议的 ZeroWall Desktop 需要通过完整安装包升级到 DSH 0.2.3-alpha.1。"
---

# ZeroWall Desktop 运行时升级

[English](guide.md) | 中文

## 变更

ZeroWall Desktop 9.1.11 内置 DSH 0.2.2-rc.1 和 Host 协议 4。内置 DSH 0.2.3-alpha.1 的 Desktop 构建使用 Host 协议 5 和 LibreOffice Kit 0.2.3。已安装的 Bootstrap 仅接纳兼容字段与当前 Desktop 匹配的 Host Runtime。

## 迁移

1. 关闭 ZeroWall Desktop，备份 Harness 主目录和 Desktop profile。运行内置 DSH 0.2.3-alpha.1 的完整安装包。
2. 如果 profile 覆盖了 `office-to-pdf` 配置行，请将覆盖目标改为 `office-kit`，并按 [Office Kit 迁移指南](../../v0.2.2-alpha.3/office-kit-package/guide.zh.md) 使用新版提供方包。
3. 如果 profile 或 overlay 选择了 Python PTC 提供方，请按 [Node PTC 迁移指南](../../v0.2.2-rc.2/python-ptc-removal/guide.zh.md) 操作。ZeroWall 工具仍可使用受管 Python 环境。
4. 启动升级后的应用。打开一个已有会话及其附件，再预览一份 Office 文档，检查 profile 和运行时。
