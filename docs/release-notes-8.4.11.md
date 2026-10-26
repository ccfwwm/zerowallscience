# ZeroWall Science 8.4.11

## 更新与稳定性

- 修复插件更新在 Windows 上复制完整用户 profile、串行校验依赖和清理候选目录导致的长时间卡顿。
- 插件批量更新使用按影响闭包的快照，保留独立回滚字节；已存在且完整的未请求依赖不会重复下载或安装。
- pnpm 在桌面候选 profile 内复用已认证的资源事务，拒绝伪造事务回执，激活后清理进入可恢复后台队列。
- Skills 更新合并为一次签名 catalog、并行准备和逐项热刷新，界面显示当前资源、阶段、计数和日志；取消状态在不可逆激活阶段正确反映。

## 资源

- 集成最新已验证插件清单，MCP 本地适配版本提升至 0.2.22，base 版本为 0.1.29，扩展中心为 0.1.17。
- 纳入最新 Skills 内容，包括 `zerowall-tooluniverse` 0.1.2 及已更新的 R/单细胞/医学数据 Skills。
- 保留 DSH 固定提交和稳定签名资源合同；未发布资源、密钥和用户数据不进入安装包。

## 验收

本版本使用新的 build ID 生成 Windows x64 安装器，并核验插件快照、Skills/MCP 资源收据、ASAR/runtime closure、`dsh --version`、`zws --version`、安装器大小和 SHA-256。

问题分析与实施顺序见 [插件与 Skills 更新优化实施计划](resource-update-performance-8.4.11.zh-CN.md)。
