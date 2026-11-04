---
description: "准备 Windows x64 未签名测试安装包，运行定向回归，验收真实云流程并保留交付证据。"
---

# ZeroWall Windows 打包与测试

[English](windows-delivery.md) | 中文

## 概述

本文用于生成并验收 Windows x64 测试安装包。自动检查、安装测试和真实云调用分别覆盖不同层次。交付负责人必须对实际安装包完成手动清单，才能宣称验收通过。签名、上传 Release 和晋升稳定资源目录是独立操作。

## 目录

- [1. 准备与预检](#preflight)
- [2. 执行定向回归检查](#automated-tests)
- [3. 生成未签名安装包](#package)
- [4. 验收实际安装包](#manual-acceptance)
- [5. 保留证据并按流程发布](#record)
- [开发备注](#dev-note)

-----

<a id="preflight"></a>

## 1. 准备与预检

在 `zerowallscience-newui` 运行。先读[打包说明](../../../apps/desktop/packaging/README.zh.md)与 [Windows 签名要求](../../../apps/desktop/windows-signing/README.zh.md)。准备 Node、固定版本 pnpm、Git、PowerShell 7、tar、Python、Visual C++ Build Tools 和 Windows SDK。秘密信息不能进入跟踪文件。未签名路径不需要签名证书。

真正打包前确定完整构建版本。按打包说明中的基础版本、上海日期与递增序号规则，检查已有本地和已发布记录。下方是预检示例，并非预留发布号；打包时替换为已确定的版本。

```powershell
pnpm install --frozen-lockfile
$buildVersion = '0.2.2-alpha.2.20261104.1'
pnpm --dir apps/desktop run package:win:x64:unsigned --check --build-version $buildVersion
```

预检成功会报告本地配置与工具链有效。它不执行下载、构建、签名、安装，也不能证明云服务可用。依赖安装完成后再运行检查或打包。

<a id="automated-tests"></a>

## 2. 执行定向回归检查

按改动所属位置选择测试。以下桌面命令检查启动与安装器打包行为，不执行真实 Windows 安装，也不调用模型。

```powershell
pnpm run test apps/desktop/tests/main-startup.spec.ts apps/desktop/tests/installer-packaging.spec.ts apps/desktop/tests/windows-directory-installer.spec.ts
```

插件变更在各受影响的固定插件目录运行 `npm run check` 和 `npm run test:package`。修改原生安装器时，由 Windows 维护者单独执行以下界面测试；它会创建测试安装器和隔离测试位置。

```powershell
pnpm --dir apps/desktop run test:installer --language zh_CN
```

| 改动 | 补充证据 |
|---|---|
| TypeScript、公开导出、运行时依赖 | `build:artifacts` 后执行 `build:check`，或执行 `build`；验证打包消费者与受影响运行时 smoke。 |
| 文档 | `pnpm run test:docs`、`pnpm run doc-sync`、`pnpm run lint` 和 `git diff --check`。 |
| 模型可见行为 | 对应的无密钥 Session 回放；获得真实凭据授权时验证实际提供商。 |
| 界面行为 | 所属组件／浏览器预期输出及实际桌面截图；Web 自动化使用仓库的目录选择器 overlay。 |
| 安装器、图标、动画 | 原生界面测试、浅色／暗色与缩放、减少动画偏好，以及安装卸载检查。 |

测试选择见[测试策略](../../testing.zh.md)，发布提交前执行[推送前检查](../../../.agents/skills/dsh-pre-push-checks/SKILL.md)。缺少 API key 或跳过套件不能记为通过。DSH 真实 API 测试与 AI Cloud 测试使用不同服务认证，一方通过不能证明另一方可用。

<a id="package"></a>

## 3. 生成未签名安装包

预检与定向检查通过后，在同一终端使用已确定的版本运行以下命令。打包流程自行执行完整构建和隔离运行时 smoke。同一检出目录的目标暂存目录共享，不要并发启动多次打包。

```powershell
pnpm --dir apps/desktop run package:win:x64:unsigned --build-version $buildVersion
```

检查最终退出码和本次 `result.json`，不能只看构建成功日志。未签名打包不写入签名发布完成记录，并省略生产更新配置。实际更新分发需使用签名构建和专门的更新验收流程。

| 产物 | 相对桌面仓库的位置 |
|---|---|
| 测试安装包 | `apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts/zerowall-science-<build-version>-win-x64-unsigned.exe` |
| 流水线结果与阶段日志 | `apps/desktop/.desktop-build/packaging-runs/<run>/` |
| 原生安装器测试输出 | `apps/desktop/.desktop-build/installer-tests/` |
| 已准备运行时与解包暂存 | `apps/desktop/.desktop-build/targets/win-x64/`；精确路径见本次结果记录。 |

Electron 下载超时时，检查失败 URL 和当前进程代理。缓存 ZIP 不代表可完全离线准备，流程仍可能下载校验文件。只使用本机已配置的代理，保留摘要校验。不要通过关闭校验或替换锁文件摘要解决完整性错误。

<a id="manual-acceptance"></a>

## 4. 验收实际安装包

Windows 交付负责人在干净 Windows x64 虚拟机，或使用独立 profile 的专用测试账户完成清单。不要覆盖正在使用的日常安装，也不要删除其凭据来模拟首次启动。记录实际安装包标识、截图、结果与剩余问题。

| 场景 | 必须观察到的结果 |
|---|---|
| 安装与品牌 | ZeroWall 标题、介绍、安装器／应用／任务栏／快捷方式图标、进度动画、取消与错误恢复；浅色／暗色和 100%／200% 缩放。 |
| 全新启动 | 直接进入工作区；只显示 AI Cloud 登录注册；暂时跳过可见，同次运行聚焦后不重弹。 |
| 已保存账户 | 尊重记住密码选项；重启恢复有效凭据；凭据过期时可以重新登录恢复。 |
| 模型与调用 | 刷新模型目录，创建会话，完成一次真实文本调用与图片调用，并检查保存结果。 |
| 余额 | 显示当前余额，低于 5 元提示，等于 5 元不提示，过期余额有标记且不自动弹充值提示。 |
| 失败路径 | 验证断网、拒绝登录、取消和重新联网；错误可处理，不重复创建任务或订单。 |
| 插件 | Discover 列出目标版本；全新 Git 安装、重启、禁用、重新启用和兼容升级可用，无重复界面。 |
| 卸载与更新 | 验证快捷方式和明确的数据保留选择；签名更新另按已安装应用更新流程验收。 |

真实云请求可能消耗余额。使用获得授权的测试账户，记录成功结果但不保存凭据或支付信息。检查充值入口可打开；创建或支付订单需要单独授权的支付测试。充值提示不代表允许自动付款。

<a id="record"></a>

## 5. 保留证据并按流程发布

将验收记录与保留的构建产物放在一起；包含机器诊断时不要提交到公开源码历史。交给其他测试者前填写以下字段。

- 桌面提交、DSH 基线、构建版本、工作区是否有修改、Windows 版本与架构。
- 两个插件的包版本和固定提交、Discover 来源，以及实际测试过的签名目录通道。
- 安装包路径、字节数、SHA-256、打包运行目录、退出码和运行时 smoke 结果。
- 自动检查命令与结果、profile 隔离方式、安装／启动日志、截图和真实云调用结果。
- 未测试项、恢复安装包与数据备份、验收负责人和发布结论。

使用 PowerShell `Get-FileHash -LiteralPath <absolute-installer-path> -Algorithm SHA256` 计算安装包摘要。可执行文件、临时消费者项目、个人路径、凭据和账户原始诊断不进入源码提交。源码推送、未签名测试包交付、GitHub Release 和签名稳定目录分别记录。

本地验收完成后，按[发布说明](../../../apps/desktop/publishing/README.zh.md)和[已安装应用更新验收](../../../apps/desktop/tests/installed-update/README.zh.md)完成签名发布。preview 签名资源目录仍需单独验收签名、归档摘要、不兼容拒绝、升级失败恢复和稳定晋升。

<a id="dev-note"></a>

## 开发备注

<details>
<summary>维护上下文</summary>

无。

</details>
