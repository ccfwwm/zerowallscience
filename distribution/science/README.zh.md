---
description: "将 ZeroWall 云服务、品牌和插件发现安装到官方 DSH Web 或桌面 profile。"
kind: "package-bundle"
---

# @zerowall/dsh-bundle-science

[English](README.md) | 中文

## 概述

此包提供 ZeroWall 分发所需的依赖和 Discover 配置。桌面安装器分别选择清单声明的默认 bundle。单独安装此包不会选择这些 bundle。它选择云账号界面，并关闭官方模型凭据的自动引导。适用于 DSH `>=0.2.2-rc.1`、Node.js `>=24.9.0` 的 Web 或桌面 profile。原生桌面品牌由独立的 ZeroWall 桌面发行版提供。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>

## 使用此包

使用标准 DSH 命令安装正式版本。修改包前完全停止选定的 profile，完成后重新启动。

```sh
dsh plugin --profile web add @zerowall/dsh-bundle-science@latest
dsh web
```

桌面端需先打开应用一次以初始化 profile，完全退出后使用应用内置的 `dsh` 命令：

```sh
dsh plugin --profile desktop add @zerowall/dsh-bundle-science@latest
```

bundle 自带插件配置。后续用户 profile 补丁可以覆盖 `ui-settings-account`、`ui-settings-models` 和 `plugin-market`。随 Desktop 提供的业务包通过设置 → 更新准备，重启后生效；普通 Web profile 包可重复 `add` 命令更新。执行 `dsh plugin --profile web remove @zerowall/dsh-bundle-science` 后重启即可移除。账号和会话数据继续由所属服务保存。

-----

<a id="understand-the-implementation"></a>

## 理解实现

<details>
<summary>维护详情——点击展开</summary>

[补丁](cordis.patch.yml)配置 Discover 和官方凭据引导。各个已选依赖提供自己的 bundle 补丁。Desktop Host 仅负责解析包并启动官方 profile runner。bundle 依赖范围和插件 peer 声明使用最低版本；桌面锁文件选择可复现的构建版本。[npm 分发指南](https://github.com/ccfwwm/zerowallscience-newui/blob/main/docs/developer/zerowall/npm-distribution.md)负责发布与迁移命令，页面顶部提供中文切换链接。

</details>

-----

<a id="model-experience"></a>

## 模型体验

AI Cloud 提供用户所选的模型。官方插件索引服务可以为支持的预设提供既有 `plugin_market` 工具。此 bundle 不新增工具实现或 Session 事件。

#### KV Cache 影响

更改启用工具或所选模型，可能按已挂载官方提供商的规则改变请求前缀。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 安装器、原生应用图标、任务栏标识、托盘和启动窗口需要单独维护的桌面壳。
- 最低版本声明允许升级，但不保证兼容未来的破坏性 API 变更。
- 选择各个 bundle 即可启用对应能力；Science 补丁不会重复注册它们。

-----

<a id="dev-note"></a>

### 开发备注

<details>
<summary>维护详情——点击展开</summary>

无。

</details>
