---
kind: upgrade-guide
description: "ZeroWall 插件 bundle 名称使用 npm 账号 scope，替代原 Git 包的 scope。"
---

# ZeroWall npm 插件名称

[English](guide.md) | 中文

## 变更

ZeroWall AI Cloud 与 Brand UI 使用 `@ccfwwm/dsh-plugin-ai-cloud` 和 `@ccfwwm/dsh-plugin-brand-ui`。原 `@zerowall` 名称对应 Git 分发。新桌面 profile 选择 `@ccfwwm/dsh-bundle-science`，由它管理云引导、账号页面选择和插件索引配置。Desktop Host 不再在用户补丁之后强制覆盖账号页面。

## 迁移

1. 完全退出桌面应用，保留 profile 和用户数据的备份。
2. 启动更新后的 ZeroWall 桌面发行版。它重命名已启用的内置 bundle 条目，保存 `package.before-npm-scope.json`，并保留禁用选择和用户补丁。用户单独安装的旧 Git 包会保留，直到明确移除。
3. 手动管理 profile 时，安装新名称，并替换 `dsh.profile.bundles` 中的旧条目。若选择完整 Science 套件，遵循 [npm 分发](../../../developer/zerowall/npm-distribution.zh.md#migration)，仅启用一套组合。
4. 重启后确认账号入口、模型设置和品牌图标。新 profile 由 Science bundle 提供账号界面选择；已有用户补丁继续优先。
