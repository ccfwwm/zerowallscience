---
kind: package-bundle
description: "从七牛云目录安装和更新 ZeroWall 插件与技能压缩包，无需替换桌面程序。"
---

# @zerowall/dsh-plugin-online-catalog

[English](README.md) | 中文

## 概述

此退役组合包保留供早期部署使用。Desktop Host Runtime 9.1.6 已将目录功能并入现有插件页面和更新中心。兼容内容的新增仍独立于 EXE 发布。

## 目录

- [使用此包](#use-this-package)
- [目录配置](#catalog-configuration)
- [模型体验](#model-experience)
- [已知限制](#known-limitations)

<a id="use-this-package"></a>
## 使用此包

此独立入口已退役。请更新 Host Runtime 至 9.1.6 并重启，使用内置“插件 → 发现”“插件 → 技能”和“设置 → 更新”。无需再次安装目录插件。旧依赖和技能回执保留，组合包选择会自动移除，参见[迁移指南](../../../docs/upgrade-guide/v0.2.2-rc.1/integrated-plugin-catalog/guide.zh.md)。

<a id="catalog-configuration"></a>
## 目录配置

默认插件地址为 `https://zerowall.chengxunkeji.cn/stable/catalog/plugins.json`；技能地址为 `https://zerowall.chengxunkeji.cn/stable/catalog/skills.json`。在组合条目上配置 `pluginIndexUrl`、`skillIndexUrl`、`home`、`fetchTimeoutMs`、`maxCatalogBytes` 或 `maxSkillBytes` 可覆盖默认值。默认每次操作允许 15 秒，每份清单限制 4 MiB，每个技能压缩包限制 64 MiB。地址必须使用 HTTPS，且不得携带凭据或片段。下载拒绝重定向。刷新失败时保留上次快照中有效的一侧，并阻止安装，直到刷新成功。

插件清单使用 [market format 1](../../../packages/util/plugin-market-index/README.zh.md)。现有插件管理器负责兼容性、构建审批、包安装、回滚和诊断日志。失败操作保留完整管理器结果，包括输出和日志路径。技能清单使用 schema 1，声明唯一 ID、版本、本地化标题及说明、不可变 HTTPS ZIP 地址、字节数、SHA-256 和完整技能名称。长度或哈希校验失败不会修改已有技能。Skills 导入器负责解压和替换；更新成功后恢复全局启停状态，启用新增技能，并保留工作区覆盖。技能版本回执以原子写入方式保存在所选 DSH 主目录下。

先发布不可变的包与压缩包，再更新[目录源文件](../../../market/catalog/README.zh.md)并刷新 CDN。已有客户端在下次明确刷新时发现新增内容；不启用定时轮询或后台安装。

<a id="model-experience"></a>
## 模型体验

此组合不添加工具或提示词内容。已安装并启用的技能通过现有技能注册表提供。

<a id="known-limitations"></a>
## 已知限制

Git 来源支持首次安装；Registry 更新使用现有管理器能力。只读或不支持更新的包来源仍可通过插件页面管理。DSH 版本不兼容时，需要使用兼容的包或更新 Host Runtime。清单本身无法提供新的 Host API。技能导入在发布后失败时，可能留下禁用或未完成配置的导入内容；界面会报告该状态，并要求重试前检查 Skills。技能版本回执描述目录安装，无法反映任意本地编辑。
