---
description: "准备 Windows 开发环境，定位定制代码，在插件 main 开发，并将经过测试的 npm 包集成到桌面。"
---

# ZeroWall 桌面与插件开发

[English](development.md) | 中文

## 概述

从固定目录构建桌面，在各自仓库开发插件。将经过测试的插件产物发布到 npm，通过桌面依赖声明和锁文件选择版本。本地修改插件不会自动更新桌面内置版本。

## 目录

- [1. 准备开发环境](#setup)
- [2. 构建并运行桌面](#desktop-loop)
- [3. 定位改动归属](#source-map)
- [4. 在各插件 main 开发](#plugin-loop)
- [5. 集成已测试的插件版本](#integration)
- [6. 分段同步上游](#upstream)
- [开发备注](#dev-note)

-----

<a id="setup"></a>

## 1. 准备开发环境

使用 Windows x64、Git、Node.js 24.9 或更高版本，以及 [packageManager](../../../package.json)声明的 pnpm 版本。当前仓库声明 pnpm 11.28.5。Windows 打包还需[打包预检](windows-delivery.zh.md#preflight)检查的工具。

```powershell
Set-Location C:\codekg\scienceproject\zerowallscience-newui
node --version
pnpm --version
git status --short --branch
pnpm install --frozen-lockfile
```

依赖安装完成后再启动其他 pnpm 命令。若有意修改依赖导致冻结安装失败，运行 `pnpm install` 重新解析，检查锁文件，并一起提交。不要对同一目录并发安装。

<a id="desktop-loop"></a>

## 2. 构建并运行桌面

在桌面仓库根目录运行以下命令。第一条构建仓库产物，第二条基于产物检查聚合程序，第三条使用已有产物启动桌面。

```powershell
pnpm run build:artifacts
pnpm run build:check
pnpm run start:desktop
```

也可运行 `pnpm run dev:desktop`，先构建仓库产物和桌面壳再启动。它不能代替聚合 `build:check`。`pnpm run build` 执行仓库两个构建阶段。修改后重新构建并启动；此启动器不会监听独立插件仓库。

[开发启动器](../../../apps/desktop/scripts/dev.ts)会输出实际 `DSH_HOME`、Electron 用户数据目录和调试端口。默认数据位于 `apps/desktop/.desktop-build/development/`。隔离测试时，在当前终端为 `DSH_HOME`、`DSH_DESKTOP_USER_DATA_DIR` 都设置新的绝对路径后启动。保留已安装应用的数据。

默认本机调试端口为 Electron 主进程 9229、渲染进程 9222、Host 9230。窗口和壳错误查主进程，界面错误查渲染器 DevTools，账户、网络和提供商错误查 Host。不要连接或终止无关的已安装进程。

<a id="source-map"></a>

## 3. 定位改动归属

优先修改直接负责该功能的位置，将业务能力放在插件中。编辑前阅读对应 README 和适用的 `AGENTS.md`。

| 改动 | 归属 |
|---|---|
| 初始窗口、恢复、任务栏标识 | [apps/desktop/src/main.ts](../../../apps/desktop/src/main.ts) |
| 应用与托盘图标 | [apps/desktop/resources](../../../apps/desktop/resources)、[图标生成器](../../../apps/desktop/scripts/render-tray-icon.ts) |
| 安装器文案与动画 | [apps/desktop/installer](../../../apps/desktop/installer)、[安装器图稿生成器](../../../apps/desktop/scripts/render-installer-brand.ps1) |
| 内置插件依赖与账户界面呈现 | [Desktop Host manifest](../../../apps/desktop-host/package.json)、[profile 组合](../../../apps/desktop-host/src/profile.ts) |
| 登录、余额、云调用 | AI Cloud 仓库：`src/account`、`src/cloud`、`test` |
| 品牌插槽与主题 | Brand UI 仓库：`src/client`、`test` |

应用和安装器图标属于桌面壳。AI Cloud 在自己的包和 bundle 中提供图标，不能指向桌面资源路径。界面文案进入语言字典，复用 DSH 主题令牌和插槽，插件释放时一并清理注册、计时器与监听器。

<a id="plugin-loop"></a>

## 4. 在各插件 main 开发

使用现有固定目录。以下以 AI Cloud 为例；Brand UI 使用 `zerowall-dsh-plugin-brand-ui`。先检查本地修改，处理后再拉取。不要为拉取成功而覆盖草稿。

```powershell
Set-Location C:\codekg\scienceproject\zerowall-dsh-plugin-ai-cloud
git status --short --branch
git switch main
git pull --ff-only origin main
npm ci --no-audit --no-fund
npm run check
npm run test:package
```

`check` 执行类型检查、单元测试和构建。`test:package` 将当前产物打包，并从独立的临时消费者验证。Git 安装不运行生命周期脚本，因此源码改动必须检查并提交重建后的 `lib/`。CI 会拒绝构建后产物发生变化的提交。临时消费者不是额外开发仓库。

推送 `main` 前检查完整差异，只暂存本次源码、测试、文档、manifest 和构建产物，再提交并执行 `git push origin main`。保留正常 hooks。通过 `git ls-remote origin refs/heads/main` 核对远端。纯插件文档提交无需提升包版本或更新桌面固定版本。

<a id="integration"></a>

## 5. 集成已测试的插件版本

通过 [npm 分发](npm-distribution.zh.md#publish)发布已测试插件。按需要更新 `apps/desktop-host/package.json` 中的最低依赖版本，执行 `pnpm install`，并检查 `pnpm-lock.yaml`。不要手动替换摘要或忽略完整性错误。

需要市场发现的版本按[索引格式](../../../packages/util/plugin-market-index/README.zh.md)更新 `market/index.json`，保留已有版本，并与包元数据和 DSH 兼容范围一致。重新构建桌面，完成[定向检查与干净 profile 验收](windows-delivery.zh.md#automated-tests)，再一起提交桌面 manifest、锁文件与索引。在另一个 profile 安装成功，不能证明桌面内置了该版本。

<a id="upstream"></a>

## 6. 分段同步上游

同步上游前记录官方 DSH 基线与本地补丁。优先比较启动、安装器、插件插槽、远程 schema、凭据和 profile 加载。只保留新基线仍需要的定制，并对新 peer 版本检查插件。按[迁移流程](migration.zh.md)分段验证后再更新集成基线。

<a id="dev-note"></a>

## 开发备注

<details>
<summary>维护上下文</summary>

无。

</details>
