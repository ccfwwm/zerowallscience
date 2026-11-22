---
kind: upgrade-guide
description: "ZeroWall Science 9.1.13 将默认 Desktop profile 和受管 Python 改用固定路径。"
---

# ZeroWall Science 固定 Desktop 数据目录

[English](guide.md) | 中文

## 变更

ZeroWall Science 9.1.13 从 `%APPDATA%\zerowall-science\harness` 读取默认 Desktop profile。Windows 当前用户新装使用 `%LOCALAPPDATA%\Programs\ZeroWallScience`，覆盖升级沿用已注册的安装目录。随包运行时和活动 Python 依赖分别位于 Harness 数据目录下的 `dsh-runtimes/dsh-primary-runtime` 和 `python/env`。

## 迁移

1. 关闭 ZeroWall Science 9.1.12，再运行 9.1.13 安装器。首次启动从 `harness-v9` 和已有的 `harness` 导入聊天历史和附件。启动后打开一条旧聊天和其中一个附件。
2. 打开 AI Cloud 账户页。Desktop 使用现有的 Windows 加密凭据库。若会话需要重新登录，请使用应用内的 AI Cloud 入口。
3. 查看 Python 设置，首次依赖安装会在后台进行。安装失败时可在该页面重试。
4. 保留已有的 `harness-v9` 和 `harness.before-fixed-home` 供恢复使用。旧设置、已安装插件和 Python 文件留在这些目录中。显式指定 `DSH_HOME` 时沿用原 profile。Desktop 从该 profile 清理已下线的会话通知包，并备份修改过的文件。
