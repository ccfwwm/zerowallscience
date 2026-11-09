---
kind: upgrade-guide
description: "ZeroWall Science 9 隔离桌面数据，沿用稳定版安装身份并加密迁移凭据。"
---

# ZeroWall Science 9 桌面版

[English](guide.md) | 中文

## 变更

Windows 产品版本与随包 DSH 核心版本独立。ZeroWall 官方 Windows 安装包保留 `com.zerowall.science` 和 8.x 稳定更新源。官方未签名构建内置 Ed25519 资源校验公钥，此机制与 Windows Authenticode 独立。本地未签名测试构建不提供更新源。

打包桌面版将 Harness 数据保存在平台应用数据目录的 `zerowall-science/harness-v9` 中。ZeroWall 密钥由操作系统加密存入 `credentials/vault-v9.json`。原有 8.x 和 newui 源数据继续保留。

桌面在云账户请求完成前显示启动界面。若两个源 profile 都包含科研数据库，第一份数据库生效，内容不同的第二份保留为已校验的冲突快照；不会自动合并数据库业务行。

同一规范目录的工作区登记会合并会话归属，保留目标工作区的身份和名称。已经完成迁移的安装也会执行一次索引修复，并备份原索引，不会重新导入源会话。单条会话成功后的检查点可跨部分迁移重试保留，避免覆盖后续续聊内容。全新数据目录自动选择默认工作区；如果启动时先打开了其他主面板，返回 Conversation 后会重新恢复工作区和空白会话。

桌面读取 `sessions-desktop` 中的标准化副本。无法读取的会话逐条跳过，不阻止启动。源数据与导入检查点仍保留；跳过项报告见[桌面历史](../../../../apps/desktop/README.zh.md#application-overview)。

## 迁移

1. 安装 9.0 前关闭旧版桌面应用。首次启动从现有 newui 数据目录与官方 8.x 稳定版目录导入用户会话、附件、工作区索引、设置和 Skills。完整会话目录通过字节校验后生效，冲突保留在 `harness-v9/.migration/zerowall-v9/conflicts`。已发布日志在读取时使用现有 DSH 迁移目录升级。
2. 查看导入结果。已有账号选择和主动退出优先；无法解密的凭据需要重新登录，源密文仍保留。余额与模型可用性由账户服务重新获取。
3. 确认预期会话可以打开并续聊。完成记录位于 `harness-v9/.migration/zerowall-v9/completed.json`，失败项记录在 `partial.json` 中，下次启动重试。单份会话、文件、设置、数据库或凭据迁移失败都不会阻止工作台启动，也不会中止其余可用项目的导入。排查冲突期间不要删除旧目录。
4. 在“设置 → 常规 → 关于”查看产品与核心版本和官方链接。桌面安装需要单独确认，业务插件通过 npm 更新。恢复稳定更新指针可以停止后续分发，但不会降级已安装版本的数据。
