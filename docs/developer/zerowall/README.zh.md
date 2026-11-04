---
description: "开发 ZeroWall 桌面与独立插件，分批迁移原项目功能，并完成 Windows 测试包交付。"
---

# ZeroWall Science 开发指导

[English](README.md) | 中文

## 概述

本文档用于继续开发已定制的 DSH 桌面。每个插件独立维护，在桌面中接入经过测试的固定提交。开发、功能迁移、打包和真实服务验收分别验证。

## 目录

- [选择开发任务](#reading-order)
- [仓库职责](#repositories)
- [产品基线](#product-baseline)
- [查阅对应说明](#references)
- [开发备注](#dev-note)

-----

<a id="reading-order"></a>

## 选择开发任务

根据本次改动选择指南。DSH 架构和各包 README 仍是 API 的说明依据。

- [日常开发](development.zh.md)：开发环境、源码位置、插件 `main` 开发及桌面集成。
- [功能迁移](migration.zh.md)：依赖盘点、迁移批次、持久化数据、兼容与回退。
- [Windows 打包与测试](windows-delivery.zh.md)：环境预检、未签名打包、回归检查、手动验收与交付记录。

<a id="repositories"></a>

## 仓库职责

本机开发根目录是 `C:\codekg\scienceproject`。保留以下三个日常开发目录；每个插件使用现有的 `main` 检出。

| 目录／仓库 | 职责 |
|---|---|
| [zerowallscience-newui](https://github.com/ccfwwm/zerowallscience-newui) | Electron 壳、安装器、启动、窗口与任务栏品牌、内置插件版本固定、Discover 索引。 |
| [zerowall-dsh-plugin-ai-cloud](https://github.com/ccfwwm/zerowall-dsh-plugin-ai-cloud) | 账户、安全凭据、云模型、文本和图片／媒体云调用，以及插件自带图标。 |
| [zerowall-dsh-plugin-brand-ui](https://github.com/ccfwwm/zerowall-dsh-plugin-brand-ui) | 侧栏和会话品牌插槽，以及可撤销主题覆盖。 |

原项目 `C:\softworks\gpt-tools\zerowallscience` 是迁移参考源。保留该仓库、数据，以及既有 `deepseek-harness`、`zerowall-dsh-plugins` 仓库。原项目中仍有的科学功能，不代表已接入新桌面。

不要再创建长期保留的 `-check`、`-iconfix` 等重复源码目录。在固定目录运行检查，使用忽略的产物目录和临时消费者 profile 隔离测试。历史草稿放恢复归档，不再作为开发目录。

<a id="product-baseline"></a>

## 产品基线

启动直接进入工作区。AI Cloud 恢复已保存凭据，或提供登录、注册和可见的暂时跳过入口。侧栏底部显示余额，低于 5 元提示充值。自定义模型放在**设置 → 模型**；保持侧栏不出现额外的 AI 平台、AI 云生图和我的模型页面。

通过 [Desktop Host manifest](../../../apps/desktop-host/package.json)、[锁文件](../../../pnpm-lock.yaml)和 [Discover 索引](../../../market/index.json)确认已集成的插件版本。插件 `main` 的更新不会自动改变固定到已测试提交的桌面。Discover 是 Git 索引，不承担 ZeroWall 签名资源目录的验签职责。

<a id="references"></a>

## 查阅对应说明

修改包之前先读[架构](../../architecture.zh.md)，共享构建系统见[开发说明](../../development.zh.md)。[测试策略](../../testing.zh.md)、[桌面打包](../../../apps/desktop/packaging/README.zh.md)和 [Windows 签名](../../../apps/desktop/windows-signing/README.zh.md)分别维护详细规则。本组指南说明 ZeroWall 的具体开发流程。

<a id="dev-note"></a>

## 开发备注

<details>
<summary>维护上下文</summary>

无。

</details>
