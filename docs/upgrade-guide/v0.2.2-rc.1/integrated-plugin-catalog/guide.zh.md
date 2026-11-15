---
kind: upgrade-guide
description: "独立在线目录组合包退役，功能并入内置插件页面与更新中心。"
---

# 集成插件与技能目录

[English](guide.md) | 中文

## 变更

Desktop Host Runtime 9.1.7 将在线发现内置于现有插件页面。“发现”列出插件，“技能”列出技能压缩包，“设置 → 更新”通过现有的一键与单项操作管理已安装项的更新。独立的“在线插件与技能”设置页面退役。

加载 profile 时，会从其 `package.json` 的 `dsh.profile.bundles` 中移除 `@zerowall/dsh-plugin-online-catalog`。该依赖、用户补丁、已安装技能及 `$DSH_HOME/zerowall-online-catalog/skills.json` 版本回执均保留。Session 格式不变。

## 迁移

1. 在“设置 → 更新”中更新 Host Runtime，然后重启并应用。Desktop EXE 9.1.4 兼容此更新，无需单独安装目录插件。
2. 打开“插件 → 发现”或“插件 → 技能”并刷新目录。通过现有 Skills 管理插件检查已安装技能。
3. 确认设置中只有一个更新页面，且不再显示独立在线目录页面。已安装技能的更新显示在更新中心；兼容的新条目通过七牛云清单到达，无需再次发布 EXE。

自定义部署可在现有 `plugin-market` 行配置 `skillIndexUrl` 和 `skillReceiptDir`，参见[市场服务](../../../../packages/boot/plugin-market/README.zh.md#use-this-package)。显式 profile 设置优先于 Desktop 默认值。
