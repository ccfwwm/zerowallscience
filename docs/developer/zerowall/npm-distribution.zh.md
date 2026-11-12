---
description: "构建与发布 ZeroWall npm 插件。"
---

# ZeroWall npm 发行版

[English](npm-distribution.md) | 中文

## 摘要

ZeroWall Desktop 默认提供六个上游 npm 插件和 ZeroWall 业务插件。自有包使用 `@zerowall`。9.1 正式发布集合中的 15 个 `@zerowall` 包使用 npm `latest`：Skills 和 Science 固定为 `0.1.1`，其余包固定为 `0.1.0`。验证基线仍为 DSH `0.2.2-rc.1`、Cordis `4.1.0`、Node.js `24.21.0` 和 pnpm `11.28.5`；Desktop 锁文件固定安装版本。

随 Desktop 提供的业务包通过设置 → 更新：精确 npm 版本在用户目录封存为候选代，重启后激活。白名单、共享运行时与恢复行为见[软件更新](desktop-updates.zh.md)。

## 目录

- [包的归属](#package-ownership)
- [构建与检查压缩包](#build-and-inspect-archives)
- [发布](#release)
- [已有配置](#existing-profiles)
- [开发备注](#dev-note)

<a id="package-ownership"></a>
## 包的归属

[Science 清单](../../../distribution/science/package.json) 维护默认选择。Desktop 分别选择各组合包，使每个插件可以独立停用，避免重复注册。Science 补丁配置 Discover 和账户引导。单独安装 Science 不会启用其全部依赖。

| 归属 | 包 |
|---|---|
| 上游 npm | `dsh-free-search`、`dsh-better-sidebar`、`dsh-wechat`、`dsh-ssh-ops`、`@dingyi222666/dsh-session-notification`、`@michengai/dsh-archive-manager` |
| ZeroWall 业务 | 合并 Harvest 的 Zotero、PPT、视频、生图、Claude、AI 云平台和品牌界面 |
| 共享服务 | 环境配置、MCP、Python、科研存储和资源完整性 |

第三方包保留上游实现和原生配置。排除 File Review、Dream Skin、Open File Viewer 和 Office Tools。PPT 使用官方 Office 转换服务及其已安装的 LibreOffice kit。

<a id="build-and-inspect-archives"></a>
## 构建与检查压缩包

在仓库根目录运行：

```sh
pnpm run zerowall:build
pnpm run zerowall:pack
pnpm run zerowall:verify-formal
```

打包命令检查导出、补丁、README 和许可证，拒绝本地依赖协议，并将版本和 SHA-512 完整性值写入 `.artifacts/zerowall-npm/manifest.json`。它使用现有产物，不重复构建。通过 `--output <directory>` 和 `--packages <comma-separated-names>` 选择独立的发布集合。保留这些准确归档用于发布。

将这些归档和对应的 DSH 版本安装到独立目录，再运行 `pnpm run zerowall:check-install <directory>`。命令导入公开 Host 入口、检查安装版本，并拒绝重复的 DSH 或 LibreOffice kit 版本。报告写入 `.artifacts/zerowall-npm/installed-validation.json`；通过 `--manifest <path>` 和 `--output <path>` 选择独立的发布清单与报告。

<a id="release"></a>

<a id="publish"></a>
## 发布

发布需要对 `@zerowall` 有写权限的 npm 账号。scope 检查被拒绝不能改用其他 scope。将验证后的依赖归档先发布到 `latest`，再发布消费者，最后发布 Science。9.1 包元数据不再暴露 `preview` profile 或 `next` 发布标签。在隔离配置中从 npm 回装清单指定的精确版本，重复启动、配置和工作流检查后再更新 Desktop 或提升 9.1 正式更新源。递增版本，不覆盖已发布归档。

本地归档检查不代表 registry 发布、需登录工作流或 Windows 安装验收通过。原生客户端验收遵循 [Windows 交付指南](windows-delivery.zh.md)。

<a id="existing-profiles"></a>

<a id="migration"></a>
## 已有配置

Desktop 将已启用、由安装器提供的旧包身份改为 `@zerowall`，并保存 `package.before-zerowall-scope.json`。新增默认 bundle 只补齐一次，记录在 `zerowall.defaultBundles`，并保存 `package.before-default-plugins.json`；无此记录的 profile 补入当前默认集合。后续启动保留停用和恢复选择，显式依赖保留名称及版本。用户补丁、凭据、任务数据和项目路径仍由用户管理。见[升级指南](../../upgrade-guide/v0.2.2-rc.1/zerowall-npm-scope/guide.zh.md)。

安装器提供的插件显示在“内置插件”，包括停用、缺失及失败的包。用户安装的组合包显示在“已安装插件”。打开插件可查看版本、状态、说明和插件提供的配置。内部运行组件位于高级清单。刷新只读取状态，不保存配置。

<a id="dev-note"></a>
## 开发备注

<details>
<summary>维护细节 — 点击展开</summary>

Registry 回装及需登录的工作流需要相应发布权限和账号授权。

</details>
