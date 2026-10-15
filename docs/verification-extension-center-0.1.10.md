# 扩展中心 0.1.10 验收与七牛发布

后续修正：用户报告的失败实际是本轮测试留下的历史回滚冲突，0.1.10 没有清楚显示任务动作；窄视口验收未完整清除 Playwright viewport，导致用户拉大窗口后右侧空白。本轮用户升级只验收了 tarball import，未覆盖扩展中心自身的正式签名升级。这些不足及补验结果见 [0.1.11 修复与验收](verification-extension-center-0.1.11.md)。

2026-10-13（北京时间）。用户已授权实施、直接使用本机做真实升级验收，并在通过后发布七牛。

## 基线与范围

- 分支：`main`；父 HEAD：`f727d39994bf396346e3bf249dc5758b3288d27a`。
- DSH：`8c00ce78435cf35300654c41e69336e69dc758b1`，版本 `0.2.0-rc.2`，未修改。
- 桌面：`8.1.3`，未修改、未重新打包桌面安装器。
- 唯一升级资源：`@zerowallscience/plugin-extension-center`，`0.1.9 → 0.1.10`。
- 源码范围：该插件组件、样式、语言、测试、package/descriptor 版本，以及 `dsh:inventory` 生成的扩展中心版本记录。本文件为验收记录。
- 直接在当前 checkout 开发，未创建 worktree；用户既有未跟踪目录与文件保留。未提交或推送源码，未发布 GitHub Release。

## 最终行为

插件、Skills、MCP、Python 在扩展中心统一管理；Python 路径、镜像与诊断仍由 Python 插件的详细设置提供，未复制其领域服务。五种筛选为全部、有更新、已安装、已停用、未安装/缺失，支持与搜索组合。

DSH 核心显示“系统核心”和只读说明，不再显示“尚未确认激活”。不能停用的 ZeroWall 基础插件仍能独立更新，不能将 `managed=false` 一概理解为只能随桌面升级。普通插件的安装、停用和运行状态分别呈现；桌面未返回可靠运行状态时显示“运行状态暂不可用”，不伪造激活成功。操作按钮按资源能力显示。

一键更新先完成 Skills/MCP/Python 操作，最后把所有可更新插件 ID 一次提交给桌面 8.1.3 已有的批量事务 API。该事务下载并校验完整插件依赖闭包，再准备候选 profile、统一激活一次。固定版本或依赖冲突条目保留在筛选中，但不自动更新。失败不自动重试。

更新完成只刷新本地列表。插件发起操作时保存会话标记，10 分钟内重新挂载不再自动检查远端；手动检查仍可执行。重新挂载恢复资源任务并轮询进行中的任务。该会话标记依赖稳定 renderer origin；桌面 8.1.3 会保留本机 Host 端口。

条目为统一紧凑列表，主操作带文字，辅助操作用图标、title 与 ARIA 名称。真实设置内容宽度约 559 CSS px 时，常见条目高约 68.7 px；调整前约 99.7 px。740 px 的 Electron 视口模拟下，内容宽约 451 px，操作自动分到下方，未发现横向溢出。未改变用户语言、模型、推理强度或参数。

## 本机真实验收

真实程序为 `C:/Users/ccf/AppData/Local/Programs/ZeroWallScience/ZeroWallScience.exe`，FileVersion/运行版本为 8.1.3。使用现有 `C:/Users/ccf/AppData/Roaming/zerowall-science` 用户数据，通过已安装桌面的正式管理 endpoint 导入最终 tarball，没有替换用户 profile、桌面文件或固定 Python 根。

1. 实际 `0.1.9 → 0.1.10` 导入成功，候选健康检查和激活通过。
2. 对比升级前后其他插件版本，以及启用、移除、固定版本选择，保持一致。已核对的 `.credentials.yaml`、dream-skin、活动 cordis 配置哈希一致；不声称对全部用户文件做了逐字节审计。
3. 用真实 renderer 验收更新/缺失筛选、搜索、三个 DSH 核心条目的状态与无操作按钮，以及 Python Core 43/43、Science 529/529 的计数。没有安装或更新 Python 依赖。
4. 单插件历史回滚曾拒绝执行：旧历史记录的基础依赖不满足当前环境插件所需的 `plugin-base@0.1.11`，返回 `PLUGIN_ROLLBACK_CONFLICT`。此路径未成功，不能记为通过。随后使用本次导入事务的完整 profile 回退，实际恢复 0.1.9 和原配置，再成功导入最终 0.1.10 包。
5. 在本机独立临时 profile 中，调用已安装 8.1.3 的实际资源管理器，对账号与 AI 云平台两个插件执行公网签名批次，真实 pnpm、真实 Host 验收通过：停止和启动各一次；完整 profile 回退通过；注入候选健康失败后恢复旧 profile 和活跃 Host。未对用户的账号/AI 云平台插件执行该测试更新。

真实界面自动化使用仓库的 Playwright Electron 接口。Windows Computer Use 窗口捕获/激活失败，未使用其不可靠截图判定结果；只关闭了本轮启动的程序实例后重新以 Electron 接口打开真实安装程序，用户此前临时目录中的旧实例未关闭。

证据在 `artifacts/verification/8.1.3/extension-center-0.1.10/`：

- `baseline.json`、`real-upgrade.json`、`rollback.json`、`final-local-verification.json`。
- `real-batch-receipt.json`，`complete=true`，两个插件、Host starts/stops 均为 1，故障恢复通过。
- `desktop-extension-center-wide.png`、`desktop-extension-center-narrow.png`、`desktop-core-status.png`、`desktop-python.png`。
- `qiniu-normal-public-urls.json`，普通 URL 独立公网校验 `complete=true`。

## 检查结果与限制

| 命令或检查 | 实际结果 |
| --- | --- |
| 扩展中心 typecheck / test | 最终源码通过；14/14 |
| pnpm typecheck / plugins:typecheck | 全仓类型检查通过 |
| dsh:inventory / dsh:verify / profiles:check / dsh:runtime:closure / version:check | 通过；发布前再次 verify/profiles/version 通过 |
| pnpm test:security | 2 通过 |
| pnpm test:updates | 59 通过，3 跳过；未放宽断言 |
| pnpm plugins:verify-pack | 最终 22 个原生插件包通过；receipt 位于 `native-pack/435f3244-b756-4052-aeec-199c084bf16c/` |
| pnpm smoke:update | 通过，桌面 Stable 元数据仍为 8.1.3 |
| 真实本机 Host / Electron / 插件升级 | 上节专项实测通过，含真实设置页与批量单次 Host 激活 |
| 全量 pnpm plugins:test | 首次科研测试因未指定固定 Python，16 项失败；不记为全量通过 |
| research 专项补验 | 使用本机现有固定 Python 与依赖后，58 文件通过、2 文件跳过；322 项通过、3 项跳过 |
| 非 research 插件测试 | 未改动的 BioGenie 资源完整性测试失败：`BIOGENIE_RESOURCE_INVALID: payload bytes differ`；1 失败、1 跳过。未修改其 payload 或签名来通过测试 |
| 其余插件补验 | 排除已单独验收的 research 与存在完整性失败的 BioGenie 后，20 个 workspace 的测试批次退出码 0；367 项通过、3 项跳过 |
| 全仓统一注入 Python 的尝试 | MCP 生命周期 fixture 预期“共享 Python/MCP 环境未就绪”，被真实已就绪 Python 改成缺 SciMaster Key，因此失败；固定 Python 环境仅用于 research 专项补验 |

其余插件日志为 `extension-center-0.1.10-plugins-test-other.log`。所有本轮日志位于 `artifacts/logs/8.1.3/extension-center-0.1.10-*.log`。资源更新测试的原有跳过项保留。

没有重新运行桌面安装器完整 `verify:package`、全套 `smoke:electron` 或通用 `smoke:host`，使用本次真实已安装桌面的专项 Host/Electron/升级/批量故障恢复验收；没有重建 ASAR、桌面安装器或修改 DSH。`release:metadata` 属于桌面发布元数据，本次插件定向发布未重新生成。未验证其他操作系统、所有外部科研服务或不同历史版本桌面的批量能力；桌面低于 8.1.3 需要先升级桌面。

单插件旧历史回滚冲突仍属于桌面的历史依赖恢复问题；本次插件更新不修改桌面事务逻辑。普通插件运行状态无法确认时仍如实报告 unavailable，而非用 UI 假定运行成功。

## 产物与七牛发布

- build ID：`extension-center-0.1.10-20261013-0030`。
- tarball：`artifacts/release/8.1.3/plugins/plugin-extension-center/0.1.10/zerowallscience-plugin-extension-center-0.1.10.tgz`。
- 大小：149,285 字节。
- SHA-256：`b9e2d07d2bc5a1618957f2f9f6eef3e6ebe2d371427762546677fe1610436648`。
- source fingerprint：`ad249ab87bbb5b550df243a88cdd40a8abde66202b04e05ec3b7f1127394402e`。

本地验收后，以正式 `stable-4` 私钥生成定向签名目录。与当前公网目录逐项比较，只有扩展中心改为 0.1.10，其余 38 条签名资源条目字节保持一致，目录未删除其他资源。

执行 `node scripts/publish-resources.mjs stage|promote|verify --kind plugin --reuse-published` 均成功：39 资源加 1 目录共 40 个不可变对象校验通过，只提升插件目录的一个 signed pointer。密钥与七牛凭据从 ignored 文件加载，未输出、提交或上传。

普通无查询参数的 URL 再次下载，签名、目录大小/SHA-256、插件 tarball 大小/SHA-256 均通过。发布前后 `stable/latest.yml` 和 Skills/MCP/Python 三个资源指针哈希完全一致。

- [扩展中心 0.1.10 tarball](https://zerowall.chengxunkeji.cn/stable/plugins/plugin-extension-center/0.1.10/zerowallscience-plugin-extension-center-0.1.10.tgz)
- [插件更新指针](https://zerowall.chengxunkeji.cn/stable/catalogs/plugin-latest.json)
- [本次不可变签名目录](https://zerowall.chengxunkeji.cn/stable/catalogs/plugin/8.1.3/extension-center-0.1.10-20261013-0030-1791823800316/catalog.json)

发布收据为 `artifacts/release/8.1.3/publication/qiniu-resources-plugin-stage.json` 和 `qiniu-resources-plugin-public.json`。没有创建 GitHub Release 或改桌面 latest 指针。
