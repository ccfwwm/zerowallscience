---
kind: upgrade-guide
description: "ZeroWall 业务更新要求明确的安装白名单与重启激活，未签名客户端需要手动引导安装。"
---

# ZeroWall 业务与桌面更新

[English](guide.md) | 中文

## 变更

白名单内的随应用业务包可使用精确版本的用户 profile 代，覆盖安装副本。核心运行时包仍由安装持有。新版本使用独立七牛 `newui` 更新源；未签名构建不提供自动更新源。账户入口打开云账户设置，更新操作打开设置 → 更新。原版 8.x 通道不受影响。

## 迁移

1. 保留当前 newui profile、凭据与用户 patch。从未签名构建升级时手动安装已签名且启用更新源的 newui EXE。不要把 8.x 客户端指向此通道。
2. 发行维护者在修改 Science 自有默认包后运行 `node distribution/scripts/sync-update-policy.mjs --write`，再重新构建 EXE。共享核心与 React 包不得加入 `dsh.installation.profileOverrides`。
3. 使用设置 → 更新检查并准备 npm 版本。明确重启后才激活；新 Host 与 Client 启动后，页面才展示生效版本。保留 profile 配置、禁用选择与兼容性豁免。
4. 激活失败恢复上一代并保留提示。需要时使用恢复随应用功能或原生插件恢复，随后确认生效版本及就绪状态。保留归档日志与不可变代目录供诊断。发布与恢复见[更新操作](../../../developer/zerowall/desktop-updates.zh.md)。
