---
description: "将 ZeroWall 插件发布到 npm，通过 DSH 安装，并维护独立的原生桌面发行壳。"
---

# 发布和安装 ZeroWall 插件

[English](npm-distribution.md) | 中文

## 概述

AI Cloud、Brand UI 和 Science bundle 使用公开的 `@ccfwwm` npm scope。DSH 与 Cordis 兼容声明指定最低版本；开发依赖和桌面锁文件固定经过测试的构建。支持基线为 DSH `0.2.2-rc.1`、Cordis `4.1.0`、Node.js `24.9.0`。

## 目录

- [1. 选择集成方式](#integration)
- [2. 验证与发布](#publish)
- [3. 安装与更新](#install)
- [4. 升级既有桌面 profile](#migration)
- [开发备注](#dev-note)

-----

<a id="integration"></a>

## 1. 选择集成方式

独立发布的 [Science bundle](../../../distribution/science/README.zh.md)管理应用配置。官方 DSH 运行时与单独维护的桌面壳组合，保留原生 ZeroWall 品牌。

| 定制 | 所属位置 |
|---|---|
| 云登录、凭据、余额和模型发现 | `@ccfwwm/dsh-plugin-ai-cloud` |
| 侧栏与会话品牌、主题覆盖 | `@ccfwwm/dsh-plugin-brand-ui` |
| 插件组合、账号页面、凭据引导、索引 URL | `@ccfwwm/dsh-bundle-science` |
| 安装器、可执行文件图标、任务栏标识、托盘、初始窗口和更新 | `apps/desktop` 下的 ZeroWall 桌面发行版 |

这些包无需修改 `packages/` 或 `vendor/`。桌面发行版保留自身的集成和打包代码。在 Electron 壳启动后加载的插件，无法提供完整原生品牌定制。

<a id="publish"></a>

## 2. 验证与发布

先确认 `npm whoami` 返回的账号有目标 scope 的发布权限。在各固定插件目录执行以下命令，先处理 `zerowall-dsh-plugin-ai-cloud`，再处理 `zerowall-dsh-plugin-brand-ui`：

```sh
npm ci --no-audit --no-fund
npm run check
npm run test:package
npm publish --access public --tag next
```

发布 hook 执行检查和独立打包消费者验证。也可发布 `test:package` 已验证的原始压缩包；npm 不会重建压缩包。发布前检查 `npm pack --dry-run --json`。包版本不可覆盖：后续每次发布都要增加 `version`。`next` 标签选择预览版本；准备就绪后，用 `npm dist-tag add <package>@<version> latest` 将已测试版本提升为稳定通道。

两个依赖可用后，再发布 Science bundle。在桌面仓库中执行：

```sh
npm pack ./distribution/science --pack-destination .artifacts
npm publish ./.artifacts/ccfwwm-dsh-bundle-science-0.1.0-preview.1.tgz --access public --tag next
npm view @ccfwwm/dsh-bundle-science@next version dependencies engines
```

Desktop Host 声明 npm 依赖。新版本发布后，按需要调整最低版本，执行 `pnpm install`、检查锁文件，再完成 [Windows 交付指南](windows-delivery.zh.md)中的检查。仅发布插件不会重建已经安装的桌面运行时。

<a id="install"></a>

## 3. 安装与更新

升级单独安装的 npm CLI，然后安装预览套件：

```sh
npm install --global @deepseek-ai/dsh@0.2.2-rc.1
dsh --version
dsh plugin --profile web add @ccfwwm/dsh-bundle-science@next
dsh web
```

再次执行套件 `add` 命令即可选择当前预览版本。桌面端完全退出应用后，使用其内置命令和 `--profile desktop`。升级全局 npm CLI 不会替换桌面安装器内置的运行时。插件安装使用 pnpm，需保证它在 PATH 中。使用 pnpm 11 时，若提示构建脚本决策，在 profile 的 `pnpm-workspace.yaml` 中显式拒绝无需执行的 `@google/genai` 和 `protobufjs` 脚本，再重试。ZeroWall Desktop 会预置这些拒绝项。

独立试用 Web 时，先把 `DSH_HOME` 设置为一个新的绝对目录，再安装并启动。检查云账号入口、模型设置、品牌图标和 Discover 标签是否出现。禁用套件并重启，检查配置和界面注册是否移除。云认证和付费请求需要另行授权的测试账号。

<a id="migration"></a>

## 4. 升级既有桌面 profile

桌面端将已启用的内置 bundle 名称从 `@zerowall` 升级为 `@ccfwwm`，把原 manifest 保存为 `package.before-npm-scope.json`，并保留用户补丁和禁用选择。已有 profile 继续使用各个插件的组合，新 profile 选择 Science 套件。

若要将已有 profile 切换为套件，先停止应用并备份 `package.json`、`cordis.patch.yml`。安装套件后，将 `dsh.profile.bundles` 中各自的 AI Cloud、Brand UI 和实验性插件市场条目替换为一个 `@ccfwwm/dsh-bundle-science` 条目。保留其他条目和用户补丁。已有账号页面或索引补丁继续覆盖套件，直到你主动删除这些特定覆盖项。

更换运行时时保留用户数据备份。卸载插件不会降级 Session 或存储格式。数据兼容请阅读上游升级指南；此 bundle 不引入 Session 格式。

<a id="dev-note"></a>

## 开发备注

<details>
<summary>维护详情——点击展开</summary>

无。

</details>
