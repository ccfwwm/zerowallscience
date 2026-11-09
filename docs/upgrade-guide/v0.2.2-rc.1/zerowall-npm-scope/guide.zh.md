---
kind: upgrade-guide
description: "ZeroWall 包使用 @zerowall npm scope，桌面逐个选择业务插件。"
---

# ZeroWall npm 插件包

[English](guide.md) | 中文

## 变更

ZeroWall 包从 `@ccfwwm` 改为 `@zerowall`。新桌面 profile 逐个选择内置业务插件。Science 组合包配置发现页和账户引导，不再重复挂载 AI Cloud 或 Brand UI。默认发行版排除 File Review、Dream Skin、Open File Viewer 和 Office Tools。Office 预览使用 DSH 内置转换器。

## 迁移

1. 更新前退出桌面。桌面迁移已启用的安装器内置 ZeroWall bundle，并在 profile manifest 旁创建 `package.before-zerowall-scope.json`。新增默认 bundle 只补齐一次并记录 `zerowall.defaultBundles`，同时将 manifest 备份为 `package.before-default-plugins.json`。无记录的 profile 补入当前默认集合，后续启动保留停用和恢复选择。用户补丁及显式安装的名称、版本保持不变。
2. 替换显式安装的旧包时，先备份 profile，再通过 `dsh plugin --profile desktop` 移除旧包并添加对应的 `@zerowall` 包。保留配置和数据目录。
3. 打开插件页。安装器提供的业务 bundle 显示在内置插件中，profile 依赖仍可管理。点击插件检查配置和运行状态。
4. 确认安装版本并完成一次任务后再处理备份。包改名不会迁移 Session 代际或删除插件数据。
