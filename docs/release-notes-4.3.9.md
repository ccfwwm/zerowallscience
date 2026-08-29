# ZeroWall Science 4.3.9

## 本次更新

- 适配 DeepSeek Harness `0.1.2-alpha.1`，修复稳定版 ASAR 环境下标准 Agent preset 无法解析的问题。
- 修复历史会话恢复、无项目新建会话、模型选择和附件入口的桌面回归问题。
- 稳定版统一使用 ZeroWall Science 品牌和稳定更新渠道，输出目录固定为 `desktop/dist`。
- 改进 AI Cloud、微信状态显示、工作区目录选择和在资源管理器中打开工作区。
- 保留科研图片查重、普通文件/图片附件、演示文稿和科研数据库等既有功能。

## 兼容性与边界

- 保留现有 `DSH_HOME`、会话、附件和科研数据库，不迁移用户数据。
- 稳定 Windows 版本通过 `desktop/dist` 生成，使用 Qiniu 稳定更新渠道。
