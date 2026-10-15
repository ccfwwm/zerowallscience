# 扩展中心 0.1.11 修复、真实升级与七牛发布

2026-10-13，北京时间。用户反馈“更新失败、右侧空白”，并授权直接使用其电脑升级测试，通过后发布七牛。

## 基线与改动范围

- 分支：`main`；父 HEAD：`f727d39994bf396346e3bf249dc5758b3288d27a`。
- DSH：`8c00ce78435cf35300654c41e69336e69dc758b1`，`0.2.0-rc.2`，未修改。
- 桌面：`8.1.3`；扩展中心：`0.1.10 → 0.1.11`。
- 只修改扩展中心组件、样式、语言、测试、package/descriptor 版本和生成的插件 inventory；新增本报告。
- 直接当前 checkout 开发，未创建 worktree，保留既有未跟踪文件。未提交、推送或创建 GitHub Release。

## 两处问题的真实原因

当前窗口可见的失败记录是 `rollback`，不是 `update`：

- 原始任务 `d461950f-8f6e-4582-baff-447f7dfbb36e` 为上一轮验收留下的回滚失败。
- 用户随后重试产生 `85e9f352-33c2-4fe8-b68a-36051c3d20da`，同样是回滚。
- 错误为 `PLUGIN_ROLLBACK_CONFLICT: @zerowallscience/plugin-environment requires @zerowallscience/plugin-base@0.1.11`。

0.1.10 把所有任务列在“更新任务”下，且回滚记录只显示插件名称，没有动作、版本和时间。这使历史回滚失败看起来像当前升级失败。0.1.11 改为“资源操作记录”，显示动作、版本、时间和错误详情；失败状态包含动作；明确说明回滚依赖冲突已保留当前版本；该冲突的历史任务不能直接无效重试。失败记录仍保留，没有删除或改写成成功。旧历史依赖恢复冲突属于桌面事务保护，本次没有更改或绕过依赖验证。

右侧空白是上一轮 Playwright Electron 验收遗留的固定视口：原生窗口已变为约 1442×1021 CSS px，但 renderer 仍固定为 1381×902；原生 `webContents.capturePage()` 确认右侧和底部未铺满。清除临时 CDP 指标仍没有消除 Playwright 的 viewport 配置，因此实际退出本轮启动的实例并以 `viewport: null` 重开已安装软件。随后原生窗口缩放、真实右侧面板打开/收起、Host 重载均正常。最终原生内容和页面均为 1442×1021，页面无横向溢出。窗口位置与大小已恢复用户反馈时的尺寸，未修改侧边栏插件或桌面源码。用户此前临时目录里的旧程序实例未关闭。

上一轮 0.1.10 的实际用户升级验收使用本地 tarball 导入，未覆盖扩展中心自身的签名更新路径；窄视口测试也没有完整恢复。这两处验收不足在本轮补齐。

## 真实本机升级与恢复测试

使用 `C:/Users/ccf/AppData/Local/Programs/ZeroWallScience/ZeroWallScience.exe` 和现有 `C:/Users/ccf/AppData/Roaming/zerowall-science`，没有替换安装程序或用户 profile。

1. 先从公网正式目录触发扩展中心 0.1.10 的签名更新任务，下载、依赖准备、健康检查、激活成功；任务 `d1e61653-987e-42ed-8d50-539e7e3cf32c` 为 `succeeded`。
2. 构建 0.1.11，用现有正式 `stable-4` 信任密钥签名，stage 上传不可变目录和归档，不提升公网 latest 指针。
3. 在用户实际 profile 中通过正式资源任务接口指定本地正式签名目录，归档仍通过七牛 HTTPS 下载，真实执行 `0.1.10 → 0.1.11`。任务 `21c08e84-a157-4c8f-874b-3717c7f9c1f4` 为 `succeeded`，健康检查和激活通过。没有以 tarball import 替代签名升级。
4. 比较当前任务前后的插件版本、启用和固定选择，只有扩展中心变为 0.1.11；凭据文件、dream-skin、活动 cordis patch/config 四个文件的 SHA-256 与此前基线一致。模型仍为 `gpt-6.1-sol`，推理等级 `Default`。不声称全部用户文件逐字节审计。
5. 实际设置页展示 `v0.1.11` 和“更新 · 扩展中心，0.1.10 → 0.1.11，已完成”，历史任务显示“回滚 · 失败”，原始错误可展开，冲突重试禁用。
6. 在隔离 profile 用已安装 Electron、实际 pnpm 和实际 Host，对扩展中心及账号两个插件执行正式签名批次：停止/启动 Host 各一次；完整 profile 回退成功；注入候选健康失败后恢复旧 profile 和活跃 Host。用户账号插件未用于此隔离测试。
7. 本地验收完成后提升七牛插件指针，并用普通无 query 公网 URL 下载验证。最后实际桌面 check 返回扩展中心 `version=installedVersion=0.1.11`、`activationState=active`、`catalogStatus=checked`。

证据目录：`artifacts/verification/8.1.3/extension-center-0.1.11/`。

- `reported-task-baseline.json`、`reported-window.png`：反馈时的页面和任务。
- `public-self-update-0.1.10.json`、`signed-upgrade-0.1.11.json`：正式自身升级及配置比较。
- `fixed-extension-center.png`：升级完成、明确回滚动作的真实界面。
- `native-window.png`、`native-resized.png`、`right-sidebar-settled.png`、`normal-window-metrics.json`、`final-normal-window.png`：无固定视口的原生布局。
- `isolated-signed-batch/batch-receipt.json`：两个插件、单次 Host 激活、完整回退与故障恢复，`complete=true`。
- `qiniu-normal-public-urls.json`：公网签名和下载校验，`complete=true`。

Windows Computer Use 窗口截图返回不对应应用的图像，未用它验收；真实图像取自已安装 Electron 的 renderer/原生 capturePage。未使用 PowerShell UIAutomation。

## 命令与结果

| 检查 | 本轮结果 |
| --- | --- |
| 扩展中心 test / typecheck | 16/16 通过；类型检查通过 |
| dsh:inventory / dsh:verify / profiles:check / dsh:runtime:closure / version:check | 通过 |
| test:security | 2 通过 |
| test:updates | 59 通过，3 原有跳过 |
| plugins:verify-pack | 22 个原生插件包通过；receipt `native-pack/f6a1158c-3427-4a5a-b952-e184dda98f1c/` |
| release:metadata / smoke:update | 通过，桌面元数据仍为 8.1.3 |
| plugin:pack extension-center | 通过，产物及签名目录依赖闭包检查通过 |
| 真实自身签名升级 / Electron 界面 / 隔离 Host 批次及故障恢复 | 上述专项实测通过 |
| git diff --check | 通过 |
| 七牛 stage / promote / verify + 独立普通 URL 校验 | 全部通过 |

本轮未重复全仓 typecheck、plugins:typecheck、plugins:test；使用扩展中心专项检查，上轮全仓类型检查已通过。上轮全量插件测试存在未修改的 BioGenie payload 完整性失败，不记为全量通过。本轮没有重建 ASAR/桌面安装器，未重复 installer `verify:package`、通用 `smoke:electron`/`smoke:host`；以本机已安装程序的专项升级、界面和 Host 实测验证。没有验证其他操作系统或全部历史桌面版本。旧历史单插件回滚依赖冲突仍保留；本次修正显示与无效重试，不宣称修复桌面历史依赖恢复算法。

## 产物与发布

- build ID：`extension-center-0.1.11-20261013-0200`。
- 归档：`C:/softworks/gpt-tools/zerowallscience/artifacts/release/8.1.3/plugins/plugin-extension-center/0.1.11/zerowallscience-plugin-extension-center-0.1.11.tgz`。
- 大小：150,623 字节。
- SHA-256：`60e2a4f86d04ab64eb9f1b3805802789b0770d21c263c9792e49f9e16eb8b7d9`。
- source fingerprint：`57d57e0a86139ba6c908968d8f7c2e9f7583e205a8ea7b03e4702d749901c014`。
- [扩展中心 0.1.11](https://zerowall.chengxunkeji.cn/stable/plugins/plugin-extension-center/0.1.11/zerowallscience-plugin-extension-center-0.1.11.tgz)。
- [插件指针](https://zerowall.chengxunkeji.cn/stable/catalogs/plugin-latest.json)。
- [不可变正式签名目录](https://zerowall.chengxunkeji.cn/stable/catalogs/plugin/8.1.3/extension-center-0.1.11-20261013-0200-1791827702477/catalog.json)。

定向目录只替换扩展中心，其余 38 条资源签名条目保持一致。40 个不可变对象（39 资源加目录）和 1 个插件指针通过校验。`stable/latest.yml` 及 Skills/MCP/Python 三个指针哈希保持一致。旧版 0.1.10 归档未覆盖；没有发布桌面或其他插件。签名与七牛凭据来自 ignored 文件，未打印、上传或提交。

当前桌面 8.1.3 足以使用本次修复，不需要更新桌面版本。
